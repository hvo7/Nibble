import { contextBridge, ipcRenderer } from 'electron';
import type { NibbleApi } from '../src/shared/api';

const api: NibbleApi = {
  snapshot: () => ipcRenderer.invoke('snapshot'),
  saveProfile: value => ipcRenderer.invoke('profile:save', value),
  saveRecipe: value => ipcRenderer.invoke('recipe:save', value),
  saveCollection: value => ipcRenderer.invoke('collection:save', value),
  deleteCollection: id => ipcRenderer.invoke('collection:delete', id),
  saveGroup: value => ipcRenderer.invoke('group:save', value),
  saveTag: value => ipcRenderer.invoke('tag:save', value),
  deleteTag: id => ipcRenderer.invoke('tag:delete', id),
  saveSettings: value => ipcRenderer.invoke('settings:save', value),
  setUsdaKey: value => ipcRenderer.invoke('key:set', value),
  capabilities: () => ipcRenderer.invoke('capabilities'),
  selectMedia: id => ipcRenderer.invoke('media:select', id),
  addImage: (profileId, name, bytes) => ipcRenderer.invoke('media:image', { profileId, name, bytes }),
  asset: id => ipcRenderer.invoke('media:get', id),
  startImport: value => ipcRenderer.invoke('import:start', value),
  cancelImport: id => ipcRenderer.invoke('import:cancel', id),
  searchFoods: query => ipcRenderer.invoke('food:search', query),
  getFood: id => ipcRenderer.invoke('food:get', id),
  exportRecipe: value => ipcRenderer.invoke('recipe:export', value),
  backup: () => ipcRenderer.invoke('backup'),
  restore: () => ipcRenderer.invoke('restore'),
  removeMedia: id => ipcRenderer.invoke('media:remove', id),
  printRecipe: value => ipcRenderer.invoke('recipe:print', value),
  openLink: url => ipcRenderer.invoke('link:open', url),
  openBrowserCompanion: () => ipcRenderer.invoke('browser:companion'),
  onChange: callback => { const handler = () => callback(); ipcRenderer.on('changed', handler); return () => ipcRenderer.removeListener('changed', handler); },
};
contextBridge.exposeInMainWorld('nibble', api);
