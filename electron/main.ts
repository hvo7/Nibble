import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { readFileSync, writeFileSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { importSchema, recipeSchema, settingsSchema, type Recipe } from '../src/shared/model';
import { Store } from './database';
import { MediaStore } from './media';
import { ImportService, runTool } from './processing';
import { NutritionService } from './nutrition';
import { collectionSchema, createBackup, groupSchema, profileSchema, restoreBackup, tagSchema } from './backup';
import { localModels } from './extraction';
import { displayAmount } from '../src/shared/recipe';

protocol.registerSchemesAsPrivileged([{ scheme: 'nibble', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const idSchema = z.string().uuid();
const dev = process.env.NIBBLE_DEV_URL === 'http://127.0.0.1:5173' && !app.isPackaged;
const smoke = process.env.NIBBLE_SMOKE === '1' && !app.isPackaged;
if (process.env.NIBBLE_DATA_DIR && !app.isPackaged) app.setPath('userData', path.resolve(process.env.NIBBLE_DATA_DIR));
if (process.env.NIBBLE_CHANNEL === 'staging' && (!process.env.NIBBLE_DATA_DIR || app.isPackaged)) throw new Error('Staging requires an isolated, unpackaged data directory.');
let store: Store;
let media: MediaStore;
let imports: ImportService;
let window: BrowserWindow;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  void app.whenReady().then(async () => {
    store = new Store(app.getPath('userData')); await store.open(); media = new MediaStore(store);
    const changed = () => { for (const view of BrowserWindow.getAllWindows()) view.webContents.send('changed'); };
    imports = new ImportService(store, media, changed);
    const nutrition = new NutritionService(store);
    protocol.handle('nibble', async request => {
      const url = new URL(request.url);
      if (url.hostname === 'media') {
        const id = url.pathname.slice(1);
        if (!idSchema.safeParse(id).success || !media.exists(id)) return new Response('', { status: 404 });
        const asset = store.asset(id);
        if (!asset.mime.startsWith('image/')) return new Response('', { status: 403 });
        return new Response(readFileSync(media.file(id)), { headers: { 'Content-Type': asset.mime, 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' } });
      }
      if (url.hostname !== 'app') return new Response('', { status: 404 });
      const root = path.join(app.getAppPath(), 'dist');
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) return new Response('', { status: 403 });
      return net.fetch(pathToFileURL(file).href);
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({ title: 'Nibble', width: 1320, height: 900, minWidth: 900, minHeight: 650, show: !smoke, backgroundColor: '#FFF8EE', icon: path.join(app.getAppPath(), 'assets', 'icon.ico'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-prevent-unload', event => {
      const choice = dialog.showMessageBoxSync(window, { type: 'question', buttons: ['Keep editing', 'Close without saving'], defaultId: 0, cancelId: 0, title: 'Unsaved recipe changes', message: 'Save your recipe before closing if you want to keep these changes.' });
      if (choice === 1) event.preventDefault();
    });

    // Every exposed command validates both its caller and its arguments.
    const handle = (channel: string, callback: (value: unknown) => unknown) => ipcMain.handle(channel, async (event, value) => {
      const url = event.senderFrame?.url ?? '';
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !(url.startsWith('nibble://app/') || (dev && url.startsWith('http://127.0.0.1:5173/')))) throw new Error('Untrusted application frame.');
      try { const result = await callback(value); return result; }
      catch (error) {
        if (error instanceof z.ZodError) throw new Error('Some values are invalid. Check the highlighted fields and try again.');
        if (error instanceof Error && /UNIQUE constraint/.test(error.message)) throw new Error('That name already exists. Choose a different name.');
        throw error;
      }
    });
    handle('snapshot', () => store.snapshot());
    handle('profile:save', value => { store.saveProfile(profileSchema.parse(value)); changed(); });
    handle('recipe:save', value => { const recipe = store.saveRecipe(recipeSchema.parse(value)); changed(); return recipe; });
    handle('collection:save', value => { store.saveCollection(collectionSchema.parse(value)); changed(); });
    handle('collection:delete', value => { store.deleteCollection(idSchema.parse(value)); changed(); });
    handle('group:save', value => { store.saveGroup(groupSchema.parse(value)); changed(); });
    handle('tag:save', value => { store.saveTag(tagSchema.parse(value)); changed(); });
    handle('tag:delete', value => { store.deleteTag(idSchema.parse(value)); changed(); });
    handle('settings:save', value => { store.setSetting('app', JSON.stringify(settingsSchema.parse(value))); changed(); });
    handle('key:set', value => { nutrition.setKey(z.string().max(100).parse(value)); changed(); });
    handle('media:get', value => store.asset(idSchema.parse(value)));
    handle('media:image', value => {
      const input = z.object({ profileId: idSchema, name: z.string().max(300), bytes: z.instanceof(ArrayBuffer) }).parse(value);
      return media.addImage(Buffer.from(input.bytes), input.name, input.profileId);
    });
    handle('media:select', async value => {
      const profileId = idSchema.parse(value); store.assertProfile(profileId);
      const result = await dialog.showOpenDialog(window, { title: 'Add recipe screenshots or video', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Recipe media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'] }] });
      if (result.canceled) return [];
      if (result.filePaths.length > 20) throw new Error('Choose up to 20 files per import.');
      return result.filePaths.map(file => {
        if (/\.(mp4|mov|webm)$/i.test(file)) return media.addVideo(file, profileId);
        if (statSync(file).size > 20 * 1024 * 1024) throw new Error('Images must be smaller than 20 MB.');
        return media.addImage(readFileSync(file), path.basename(file), profileId);
      });
    });
    handle('import:start', value => imports.start(importSchema.parse(value)));
    handle('browser:companion', async () => {
      const folder = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'browser-companion');
      if (!existsSync(path.join(folder, 'manifest.json'))) throw new Error('The browser companion is missing. Rebuild staging or reinstall Nibble.');
      const error = await shell.openPath(folder);
      if (error) throw new Error(`Could not open the browser companion folder: ${error}`);
    });
    handle('import:cancel', value => imports.cancel(idSchema.parse(value)));
    handle('food:search', value => nutrition.search(z.string().trim().min(2).max(200).parse(value)));
    handle('food:get', value => nutrition.food(z.number().int().positive().parse(value)));
    handle('capabilities', async () => {
      const settings = store.settings();
      const [models, ffmpeg, whisper] = await Promise.allSettled([localModels(), runTool(settings.ffmpegPath, ['-version'], undefined, 5000), runTool(settings.pythonPath, ['-c', 'import faster_whisper; print("ready")'], undefined, 10000)]);
      return { ramGB: Math.round(os.totalmem() / 1024 ** 3), models: models.status === 'fulfilled' ? models.value : [], ollama: models.status === 'fulfilled', ffmpeg: ffmpeg.status === 'fulfilled', whisper: whisper.status === 'fulfilled' };
    });
    handle('recipe:export', async value => {
      const recipe = recipeSchema.parse(value);
      const result = await dialog.showSaveDialog(window, { defaultPath: recipe.title.replace(/[^\w -]/g, '').slice(0, 80) + '.json', filters: [{ name: 'Recipe JSON', extensions: ['json'] }] });
      if (!result.filePath) return false;
      const snapshot = store.snapshot();
      writeFileSync(result.filePath, JSON.stringify({ format: 'nibble-recipe', version: 1, recipe, tags: snapshot.tags.filter(t => recipe.tagIds.includes(t.id)), groups: snapshot.groups.filter(g => snapshot.tags.some(t => recipe.tagIds.includes(t.id) && t.groupId === g.id)), collections: snapshot.collections.filter(c => recipe.collectionIds.includes(c.id)) }, null, 2)); return true;
    });
    handle('backup', async () => {
      const result = await dialog.showSaveDialog(window, { defaultPath: 'Nibble-backup.json', filters: [{ name: 'Nibble backup', extensions: ['json'] }] });
      if (!result.filePath) return false;
      writeFileSync(result.filePath, JSON.stringify(createBackup(store, media))); return true;
    });
    handle('restore', async () => {
      const result = await dialog.showOpenDialog(window, { title: 'Restore as additional profiles', properties: ['openFile'], filters: [{ name: 'Nibble backup', extensions: ['json'] }] });
      if (result.canceled) return false;
      if (statSync(result.filePaths[0]).size > 400 * 1024 * 1024) throw new Error('This backup exceeds the current 400 MB restore limit.');
      await restoreBackup(JSON.parse(readFileSync(result.filePaths[0], 'utf8')), store, media); changed(); return true;
    });
    handle('media:remove', value => {
      const profileId = idSchema.parse(value);
      const snapshot = store.snapshot();
      if (snapshot.jobs.some(j => j.status === 'running')) throw new Error('Finish or cancel the current import before removing media.');
      const covers = new Set([...snapshot.recipes.map(r => r.coverId), ...snapshot.collections.map(c => c.coverId)]);
      const ids = store.assetList().filter(a => a.profileId === profileId && !covers.has(a.asset.id)).map(a => a.asset.id);
      store.detachOriginalMedia(profileId, ids);
      ids.forEach(id => { if (existsSync(media.file(id))) unlinkSync(media.file(id)); }); changed(); return ids.length;
    });
    handle('link:open', value => { const url = new URL(z.string().max(2000).parse(value)); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only HTTPS links can be opened.'); return shell.openExternal(url.href); });
    handle('recipe:print', async value => {
      const recipe = recipeSchema.parse(value);
      const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
      const printer = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      const units = store.snapshot().profiles.find(p => p.id === recipe.profileId)?.units ?? 'metric';
      const html = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(recipe.title)}</title><style>body{font:15px Georgia;color:#173f2a;padding:32px;line-height:1.6}h1{font-size:30px}li{margin:8px 0}</style></head><body><small>NIBBLE</small><h1>${escape(recipe.title)}</h1><p>${escape(recipe.description)}</p><p>${recipe.servings ?? 'Unknown'} servings</p><h2>Ingredients</h2><ul>${recipe.ingredients.map(i => `<li>${escape(displayAmount(i, units))}</li>`).join('')}</ul><h2>Instructions</h2><ol>${recipe.steps.map(s => `<li>${escape(s.text)}</li>`).join('')}</ol><p>${escape(recipe.notes)}</p><small>${escape(recipe.sourceUrl)}</small></body></html>`;
      await printer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      printer.webContents.print({}, () => printer.close());
    });
    await window.loadURL(dev ? 'http://127.0.0.1:5173' : 'nibble://app/index.html');
    if (smoke) {
      await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 800))');
      const text = await window.webContents.executeJavaScript('document.body.innerText');
      console.log('NIBBLE_SMOKE', JSON.stringify({ title: await window.webContents.getTitle(), text, node: process.versions.node }));
      if (process.env.NIBBLE_SCREENSHOT) writeFileSync(process.env.NIBBLE_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
      app.quit();
    }
  }).catch(error => { console.error('Nibble startup failed:', error.message); if (!smoke) dialog.showErrorBox('Nibble could not start', error.message); app.exit(1); });
}
app.on('before-quit', () => imports?.cancelAll());
app.on('window-all-closed', () => app.quit());
