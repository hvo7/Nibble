import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() }, nativeImage: {} }));
vi.mock('../electron/network', () => ({ fetchPublic: vi.fn(), fetchPublicImage: vi.fn() }));
import { fetchPublic, fetchPublicImage } from '../electron/network';
import { Store } from '../electron/database';
import { MediaStore } from '../electron/media';
import { ImportService } from '../electron/processing';
import { blankRecipe, uid } from '../src/shared/model';
import { conflictHtml, sourceRecipe, jsonLd } from './fixtures/website';
import { savedBrowserRecipe } from './fixtures/browser-capture';

let directory: string; let store: Store; let service: ImportService; let profileId: string;
beforeEach(async () => { directory = mkdtempSync(path.join(os.tmpdir(), 'nibble-import-')); store = new Store(directory); await store.open(); profileId = uid(); store.saveProfile({ id: profileId, name: 'Kitchen', units: 'metric', avatar: '', createdAt: '' }); service = new ImportService(store, new MediaStore(store), () => {}); vi.mocked(fetchPublic).mockReset(); vi.mocked(fetchPublicImage).mockReset(); });
afterEach(() => { vi.restoreAllMocks(); service.cancelAll(); store.close(); rmSync(directory, { recursive: true, force: true }); });
describe('Import jobs and saved data', () => {
  it('imports a saved browser page without calling the blocked website and persists its evidence', async () => {
    const capture = savedBrowserRecipe();
    vi.mocked(fetchPublic).mockRejectedValue(new Error('403'));
    const id = service.start({ profileId, url: 'https://example.com/unrelated', text: '', assetIds: [], useAI: false, browserCapture: capture });
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('review'));
    const job = store.snapshot().jobs.find(j => j.id === id)!;
    expect(fetchPublic).not.toHaveBeenCalled(); expect(job.request.url).toBe(capture.url);
    expect(job.drafts[0].ingredients).toHaveLength(17); expect(job.request.browserCapture).toEqual(capture);
    expect(job.drafts[0].sourceUrl).toBe(capture.url); expect(job.drafts[0].evidence[0].label).toContain('Browser capture');
    expect(() => store.saveRecipe({ ...job.drafts[0], status: 'ready' })).toThrow('Check');
    const saved = store.saveRecipe({ ...job.drafts[0], sourceReview: { confirmed: true, parser: 'sections-v2' }, status: 'ready' });
    store.close(); store = new Store(directory); await store.open();
    expect(store.snapshot().recipes.find(r => r.id === saved.id)?.ingredients).toHaveLength(17);
    expect(store.snapshot().jobs.find(j => j.id === id)?.request.browserCapture).toEqual(capture);
  });
  it('imports a website into an isolated review job with source conflicts intact', async () => {
    vi.mocked(fetchPublic).mockResolvedValue({ body: conflictHtml, url: 'https://example.com/final-recipe' });
    const id = service.start({ profileId, url: 'https://example.com/old', text: '', assetIds: [], useAI: false });
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('review'));
    const draft = store.snapshot().jobs.find(j => j.id === id)!.drafts[0];
    expect(draft.sourceUrl).toBe('https://example.com/final-recipe'); expect(draft.ingredients).toHaveLength(5);
    expect(draft.websiteImport?.conflicts[0].resolved).toBe(false); expect(store.snapshot().recipes).toHaveLength(0);
  });
  it('does not parse a website access-denied page as recipe text', async () => {
    vi.mocked(fetchPublic).mockResolvedValue({ body: '<main><h1>Access denied</h1><p>403 please sign in</p></main>', url: 'https://example.com' });
    const id = service.start({ profileId, url: 'https://example.com', text: '', assetIds: [], useAI: false });
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('review'));
    expect(store.snapshot().jobs.find(j => j.id === id)!.drafts[0].ingredients).toHaveLength(0);
  });
  it('saves inaccessible links as incomplete reviewable drafts with upload fallback', async () => {
    vi.mocked(fetchPublic).mockRejectedValue(new Error('Access restricted'));
    const id = service.start({ profileId, url: 'https://www.instagram.com/reel/example', text: '', assetIds: [], useAI: false });
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('review'));
    const draft = store.snapshot().jobs.find(j => j.id === id)!.drafts[0];
    expect(draft.sourceUrl).toContain('instagram'); expect(draft.ingredients).toHaveLength(0);
    expect(draft.warnings.some(w => w.includes('screenshots'))).toBe(true); expect(store.snapshot().recipes).toHaveLength(0);
  });
  it('cancels an in-flight fetch without corrupting saved recipes', async () => {
    const recipe = store.saveRecipe({ ...blankRecipe(profileId), title: 'Saved dinner' });
    vi.mocked(fetchPublic).mockImplementation((_url, signal) => new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('Canceled')), { once: true })));
    const id = service.start({ profileId, url: 'https://example.com', text: '', assetIds: [], useAI: false });
    service.cancel(id);
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('canceled'));
    expect(store.snapshot().recipes[0]).toEqual(recipe);
  });
  it('makes retries separate drafts so saved corrections survive', async () => {
    const request = { profileId, url: '', text: 'Soup\nIngredients\n200 g carrots\nInstructions\nChop carrots.', assetIds: [], useAI: false };
    const firstId = service.start(request);
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === firstId)?.status).toBe('review'));
    const first = store.snapshot().jobs.find(j => j.id === firstId)!;
    const recipe = store.saveRecipe({ ...first.drafts[0], title: 'My corrected soup' });
    const secondId = service.start(request);
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === secondId)?.status).toBe('review'));
    expect(store.snapshot().jobs.find(j => j.id === secondId)!.drafts[0].id).not.toBe(recipe.id);
    expect(store.snapshot().recipes[0].title).toBe('My corrected soup');
  });
});

async function imported(html: string) {
  vi.mocked(fetchPublic).mockResolvedValue({body:html,url:'https://example.com/carrot-ginger-soup'});
  const id=service.start({profileId,url:'https://example.com/carrot-ginger-soup',text:'',assetIds:[],useAI:false});
  await vi.waitFor(()=>expect(store.snapshot().jobs.find(j=>j.id===id)?.status).toBe('review'));
  return store.snapshot().jobs.find(j=>j.id===id)!.drafts[0];
}
function fakeMedia() {
  return vi.spyOn(MediaStore.prototype,'addCoverPhoto').mockImplementation(async (_bytes,name,owner)=>{
    const asset={id:uid(),name,mime:'image/png',size:100};store.addAsset(asset,owner);return asset;
  });
}
describe('Website cover import lifecycle',()=>{
  it('downloads only the main dish, persists the cover and provenance, and enforces profile ownership',async()=>{
    const media=fakeMedia();vi.mocked(fetchPublicImage).mockResolvedValue({bytes:Buffer.from('photo'),url:'https://cdn.example.com/soup.jpg'});
    const draft=await imported(jsonLd([{...sourceRecipe,name:'Banana bread',image:'/bread.jpg',recipeIngredient:Array.from({length:20},(_,i)=>`${i+1} g flour`)},{...sourceRecipe,image:'/soup.jpg'}]));
    expect(fetchPublicImage).toHaveBeenCalledTimes(1);expect(vi.mocked(fetchPublicImage).mock.calls[0][0]).toBe('https://example.com/soup.jpg');
    expect(media).toHaveBeenCalledWith(expect.any(Buffer),expect.stringContaining('dish photo'),profileId,expect.any(AbortSignal));
    expect(draft.coverId).not.toBeNull();expect(draft.evidence.some(e=>e.kind==='image'&&e.assetId===draft.coverId)).toBe(true);
    expect(draft.websiteImport?.sources.find(s=>s.field==='Cover photo')?.raw).toBe('https://cdn.example.com/soup.jpg');
    const saved=store.saveRecipe(draft);store.close();store=new Store(directory);await store.open();
    expect(store.snapshot().recipes.find(r=>r.id===saved.id)?.coverId).toBe(draft.coverId);
    const other=uid();store.saveProfile({id:other,name:'Other',units:'metric',avatar:'',createdAt:''});
    expect(()=>store.saveRecipe({...blankRecipe(other),title:'Other',coverId:draft.coverId})).toThrow();
  });
  it('falls back after a broken photo and keeps the recipe when all downloads fail',async()=>{
    fakeMedia();vi.mocked(fetchPublicImage).mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce({bytes:Buffer.from('photo'),url:'https://example.com/second.jpg'});
    const draft=await imported(jsonLd({...sourceRecipe,image:['/first.jpg','/second.jpg']}));expect(draft.coverId).not.toBeNull();expect(fetchPublicImage).toHaveBeenCalledTimes(2);
    vi.mocked(fetchPublicImage).mockRejectedValue(new Error('blocked'));
    const failed=await imported(jsonLd({...sourceRecipe,image:'/first.jpg'}));expect(failed.ingredients).toHaveLength(5);expect(failed.coverId).toBeNull();expect(failed.warnings.some(w=>w.includes('photo could not be saved'))).toBe(true);
  });
  it('falls back after corrupt or tiny image decoding and limits download attempts',async()=>{
    fakeMedia().mockImplementation(()=>{throw new Error('Unreadable image');});vi.mocked(fetchPublicImage).mockResolvedValue({bytes:Buffer.from('bad'),url:'https://example.com/photo.jpg'});
    const draft=await imported(jsonLd({...sourceRecipe,image:Array.from({length:10},(_,i)=>`/photo${i}.jpg`)}));
    expect(fetchPublicImage).toHaveBeenCalledTimes(6);expect(draft.coverId).toBeNull();expect(draft.ingredients).toHaveLength(5);
  });
  it('canceling a photo download retains parsed ingredients and creates no cover asset',async()=>{
    const media=fakeMedia();vi.mocked(fetchPublic).mockResolvedValue({body:jsonLd({...sourceRecipe,image:'/soup.jpg'}),url:'https://example.com/soup'});
    vi.mocked(fetchPublicImage).mockImplementation((_url,signal)=>new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(new Error('Canceled')),{once:true})));
    const id=service.start({profileId,url:'https://example.com/soup',text:'',assetIds:[],useAI:false});
    await vi.waitFor(()=>expect(fetchPublicImage).toHaveBeenCalledTimes(1));service.cancel(id);
    await vi.waitFor(()=>expect(store.snapshot().jobs.find(j=>j.id===id)?.status).toBe('canceled'));
    expect(store.snapshot().jobs.find(j=>j.id===id)?.drafts[0].ingredients).toHaveLength(5);expect(media).not.toHaveBeenCalled();
  });
  it('saved browser captures stay offline even if metadata contains remote photos',async()=>{
    const capture=savedBrowserRecipe(jsonLd({...sourceRecipe,image:'https://example.com/photo.jpg'}));
    const id=service.start({profileId,url:'',text:'',assetIds:[],useAI:false,browserCapture:capture});
    await vi.waitFor(()=>expect(store.snapshot().jobs.find(j=>j.id===id)?.status).toBe('review'));
    expect(fetchPublic).not.toHaveBeenCalled();expect(fetchPublicImage).not.toHaveBeenCalled();
  });
  it('does not download logos or invent a cover when no suitable photo exists',async()=>{
    const draft=await imported(jsonLd({...sourceRecipe,image:'/site-logo.jpg'}));expect(draft.coverId).toBeNull();expect(fetchPublicImage).not.toHaveBeenCalled();
  });
});

it('saves a real WebP website response, persists it, and never calls Electron nativeImage', async () => {
  const sharp = (await import('sharp')).default;
  const { readFileSync } = await import('node:fs');
  const bytes = await sharp({create:{width:400,height:428,channels:3,background:{r:120,g:80,b:40}}}).webp().toBuffer();
  vi.mocked(fetchPublicImage).mockResolvedValue({bytes,url:'https://example.com/dish.png'});
  const draft=await imported(jsonLd({...sourceRecipe,image:'/dish.png'}));
  expect(draft.coverId).not.toBeNull();
  const stored=readFileSync(new MediaStore(store).file(draft.coverId!));
  expect(await sharp(stored).metadata()).toMatchObject({format:'png',width:400,height:428});
  const saved=store.saveRecipe(draft);store.close();store=new Store(directory);await store.open();
  expect(store.snapshot().recipes.find(r=>r.id===saved.id)?.coverId).toBe(draft.coverId);
  expect(draft.sourceReview?.confirmed).not.toBe(true);
});

it('tries the remaining ranked cover when the first three variants fail and retains failure evidence', async () => {
  fakeMedia();
  vi.mocked(fetchPublicImage).mockRejectedValueOnce(new Error('The site returned 404.')).mockRejectedValueOnce(new Error('The site returned 404.')).mockRejectedValueOnce(new Error('The site returned 404.')).mockResolvedValue({bytes:Buffer.from('photo'),url:'https://example.com/fourth.jpg'});
  const draft=await imported(jsonLd({...sourceRecipe,image:['/one.jpg','/two.jpg','/three.jpg','/fourth.jpg']}));
  expect(draft.coverId).not.toBeNull();expect(fetchPublicImage).toHaveBeenCalledTimes(4);
  expect(draft.websiteImport?.sources.filter(s=>s.field==='Cover photo attempt')).toHaveLength(3);
  expect(draft.websiteImport?.sources.find(s=>s.field==='Cover photo')?.raw).toContain('fourth.jpg');
});

it('a failed image download explains the cause while retaining the recipe and source', async () => {
  vi.mocked(fetchPublicImage).mockRejectedValue(new Error('The site returned 403.'));
  const draft=await imported(jsonLd({...sourceRecipe,image:'/dish.jpg'}));
  expect(draft.coverId).toBeNull();expect(draft.ingredients).toHaveLength(5);
  expect(draft.warnings.join(' ')).toContain('blocked or limited');
  expect(draft.websiteImport?.sources.some(s=>s.field==='Cover photo attempt'&&s.raw.includes('dish.jpg'))).toBe(true);
});

async function portableCapture(data?: string, title = sourceRecipe.name) {
  const sharp = (await import('sharp')).default;
  const bytes = data ?? (await sharp({ create: { width: 640, height: 480, channels: 3, background: '#bb6633' } }).jpeg().toBuffer()).toString('base64');
  return { ...savedBrowserRecipe(jsonLd({ ...sourceRecipe, image: 'https://example.com/carrot-soup.jpg' })), version: 2 as const, title: sourceRecipe.name,
    coverPhoto: { mime: 'image/jpeg' as const, data: bytes, width: 640, height: 480, sourceUrl: 'https://example.com/carrot-soup.jpg', recipeTitle: title, reason: 'Recipe metadata' } };
}
async function importPortable(capture: Awaited<ReturnType<typeof portableCapture>>) {
  const id = service.start({ profileId, url: '', text: '', assetIds: [], useAI: false, browserCapture: capture });
  await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('review'));
  return store.snapshot().jobs.find(j => j.id === id)!;
}
describe('embedded browser dish photo lifecycle', () => {
  it('decodes real embedded JPEG offline, persists cover/source/recovery data and isolates profiles', async () => {
    const capture = await portableCapture(), job = await importPortable(capture), draft = job.drafts[0];
    expect(fetchPublic).not.toHaveBeenCalled(); expect(fetchPublicImage).not.toHaveBeenCalled();
    expect(draft.coverId).not.toBeNull(); expect(draft.evidence.some(e => e.assetId === draft.coverId && e.kind === 'image')).toBe(true);
    expect(draft.websiteImport?.sources.find(s => s.field === 'Cover photo')?.raw).toBe(capture.coverPhoto.sourceUrl);
    expect(draft.sourceReview?.confirmed).toBe(false); expect(draft.ingredients).toHaveLength(5);
    const saved = store.saveRecipe(draft); store.close(); store = new Store(directory); await store.open();
    expect(store.snapshot().recipes.find(r => r.id === saved.id)?.coverId).toBe(draft.coverId);
    expect(store.snapshot().jobs.find(j => j.id === job.id)?.request.browserCapture).toEqual(capture);
    const other = uid(); store.saveProfile({ id: other, name: 'Other', units: 'metric', avatar: '', createdAt: '' });
    expect(() => store.saveRecipe({ ...blankRecipe(other), title: 'Other', coverId: draft.coverId })).toThrow();
    const trashed = store.saveRecipe({ ...saved, deletedAt: new Date().toISOString() });
    expect(store.saveRecipe({ ...trashed, deletedAt: null }).coverId).toBe(draft.coverId);
  });
  it('keeps ingredients when embedded bytes are corrupt and allows a successful separate retry', async () => {
    const broken = await importPortable(await portableCapture(Buffer.from('not an image').toString('base64')));
    expect(broken.drafts[0].coverId).toBeNull(); expect(broken.drafts[0].ingredients).toHaveLength(5);
    expect(broken.drafts[0].warnings.join(' ')).toContain('saved dish photo could not be read');
    const corrected = store.saveRecipe({ ...broken.drafts[0], title: 'My soup correction' });
    const retry = await importPortable(await portableCapture());
    expect(retry.drafts[0].coverId).not.toBeNull(); expect(retry.drafts[0].id).not.toBe(corrected.id);
    expect(store.snapshot().recipes[0].title).toBe('My soup correction');
    expect(fetchPublicImage).not.toHaveBeenCalled();
  });
  it('does not attach another recipe record’s embedded cover', async () => {
    const job = await importPortable(await portableCapture(undefined, 'Banana bread'));
    expect(job.drafts[0].coverId).toBeNull(); expect(job.drafts[0].warnings.join(' ')).toContain('different recipe record');
  });
  it('canceling while embedded photo is decoding retains ingredients without assigning a cover', async () => {
    let finish!: () => void;
    vi.spyOn(MediaStore.prototype, 'addCoverPhoto').mockImplementation(async (_bytes, _name, _profile, signal) => {
      await new Promise<void>(resolve => { finish = resolve; }); signal?.throwIfAborted(); throw new Error('Unexpected completion');
    });
    const capture = await portableCapture();
    const id = service.start({ profileId, url: '', text: '', assetIds: [], useAI: false, browserCapture: capture });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function')); service.cancel(id); finish();
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('canceled'));
    const draft = store.snapshot().jobs.find(j => j.id === id)!.drafts[0];
    expect(draft.ingredients).toHaveLength(5); expect(draft.coverId).toBeNull();
  });
});
