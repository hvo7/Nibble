import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Offline UI integration: real React and SQLite, substituted desktop/network
// boundaries. No Electron, web server, external service or Vitest runtime.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','localStorage','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Event','MouseEvent','HTMLDialogElement'])
  Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.fetch=()=>{throw Error('This test suite is offline.');};
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-visible','true');};
const {createElement:h,act}=await import('react');
const {createRoot}=await import('react-dom/client');
await mkdir('.nibble-test',{recursive:true});
const dir=await mkdtemp(path.resolve('.nibble-test/ui-workflows-'));
const bundle=path.join(dir,'ui.cjs');
await build({stdin:{contents:[
"export {App} from './src/App';",
"export {RecipeEditor} from './src/components/RecipeEditor';",
"export {ImportDialog} from './src/components/ImportDialog';",
"export {Store} from './electron/database';",
"export {blankRecipe,uid,emptyMacros,defaultSettings} from './src/shared/model';",
"export {parseIngredient} from './src/shared/recipe';",
"export {extractWebsite} from './electron/website';",
"export {conflictHtml} from './tests/fixtures/website';"
].join('\n'),loader:'tsx',resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
const {App,RecipeEditor,ImportDialog,Store,blankRecipe,uid,emptyMacros,defaultSettings,parseIngredient,extractWebsite,conflictHtml}=createRequire(import.meta.url)(bundle);
const now=()=>new Date().toISOString();
const settle=async()=>{await act(async()=>{await new Promise(resolve=>setImmediate(resolve));});};
function button(name,within=document){const el=[...within.querySelectorAll('button')].find(x=>name instanceof RegExp?name.test(x.textContent):x.textContent.trim()===name);assert.ok(el,'Missing button: '+name);return el;}
function aria(name){const el=document.querySelector('[aria-label="'+name+'"]');assert.ok(el,'Missing aria-label: '+name);return el;}
function field(name){const label=[...document.querySelectorAll('label')].find(x=>x.querySelector('span')?.textContent===name);assert.ok(label,'Missing field: '+name);return label.querySelector('input,select,textarea');}
async function click(el){if(typeof el==='string'||el instanceof RegExp)el=button(el);assert.ok(!el.matches(':disabled'),'Disabled: '+el.textContent);await act(async()=>el.click());await settle();}
async function change(el,value){await act(async()=>{const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});}
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function fixture(t){
  document.body.innerHTML='';localStorage.clear();let store=new Store(await mkdtemp(path.join(dir,'db-')));await store.open();
  const profile={id:uid(),name:'Test kitchen',units:'metric',avatar:'',createdAt:now()};store.saveProfile(profile);
  const listeners=new Set(),calls=[];const emit=()=>listeners.forEach(fn=>fn());
  const api={snapshot:async()=>store.snapshot(),onChange:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  for(const method of ['saveRecipe','saveProfile','saveCollection','deleteCollection','saveGroup','saveTag','deleteTag'])
    api[method]=async(...args)=>{calls.push([method,...args]);const result=store[method](...args);emit();return result;};
  Object.assign(api,{
    saveSettings:async settings=>{store.setSetting('app',JSON.stringify(settings));emit();},
    capabilities:async()=>{calls.push(['capabilities']);return{ramGB:8,models:[],ollama:false,ffmpeg:false,whisper:false};},
    setUsdaKey:async()=>{},selectMedia:async()=>[],addImage:async(id,name)=>({id:uid(),name,mime:'image/png',size:12}),
    startImport:async request=>{calls.push(['startImport',request]);const draft={...blankRecipe(request.profileId),title:request.text.split('\n')[0]||'New import'};const job=jobFor(draft,request);store.saveJob(job);emit();return job.id;},
    cancelImport:async id=>{const job=store.snapshot().jobs.find(j=>j.id===id);store.saveJob({...job,status:'canceled',stage:'Canceled'});emit();},
    searchFoods:async()=>[],getFood:async()=>{throw Error('No fixture food');},
    exportRecipe:async()=>false,backup:async()=>false,restore:async()=>false,removeMedia:async()=>0,printRecipe:async()=>{},openLink:async()=>{},openBrowserCompanion:async()=>{},
  });window.nibble=api;let root;
  const mount=async(element=h(App))=>{const host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(element));await settle();};
  t.after(async()=>{if(root)await act(async()=>root.unmount());store.close();document.body.innerHTML='';});
  return{get store(){return store;},profile,api,calls,mount,emit,reopen:async()=>{const directory=store.directory;store.close();store=new Store(directory);await store.open();return store.snapshot();},recipe:(title='Test soup',extra={})=>({...blankRecipe(profile.id),title,...extra})};
}
function jobFor(recipe,request={profileId:recipe.profileId,url:'',text:recipe.title,assetIds:[],useAI:false,readImages:false}){return{id:uid(),profileId:recipe.profileId,status:'review',stage:'Ready to review',error:'',createdAt:now(),updatedAt:now(),drafts:[recipe],request};}
async function openDraft(f,recipe){f.store.saveJob(jobFor(recipe));await f.mount();await click('Drafts');await click('Review recipe');}
async function editorMount(f,recipe,extra={}){const errors=[],dirty=[];await f.mount(h(RecipeEditor,{initial:recipe,profile:f.profile,snapshot:f.store.snapshot(),onClose:()=>{},onSave:f.api.saveRecipe,onError:e=>errors.push(e),onSupplement:async r=>f.api.saveRecipe(r),onDirty:value=>dirty.push(value),...extra}));return{errors,dirty};}

test('Save persists conflicted drafts and subsequent edits; Back returns to library',async t=>{
  const f=await fixture(t),r=extractWebsite(conflictHtml,'https://example.com/soup',f.profile.id).recipes[0];
  assert.ok(r.websiteImport.conflicts.some(c=>!c.resolved));await openDraft(f,r);await click('Save recipe');
  assert.match(document.body.textContent,/Saved to your library.*Needs Review/);let saved=f.store.snapshot().recipes[0];assert.equal(saved.revision,1);assert.equal(saved.status,'review');assert.equal(saved.ingredients.length,5);
  assert.ok(document.querySelector('.saved-recipe-page'));assert.equal(document.querySelector('.editor-page'),null);assert.equal(document.querySelector('[aria-label="Recipe title"]'),null);await click('Edit recipe');await change(aria('Recipe title'),'Soup edited');await click('Save recipe');saved=f.store.snapshot().recipes[0];assert.equal(saved.revision,2);assert.equal(saved.title,'Soup edited');
  await click(/Back to library/);assert.ok(button('Soup edited'));assert.equal(document.querySelector('.job-card'),null);
  await click('Drafts');assert.equal(document.querySelector('.job-card'),null);assert.match(document.body.textContent,/No drafts to review/);await click(/^All Recipes/);await click('Soup edited');assert.ok(document.querySelector('.saved-recipe-page'));assert.equal(document.querySelector('h1').textContent,'Soup edited');
  const reopened=await f.reopen();assert.equal(reopened.recipes[0].revision,2);assert.equal(reopened.recipes[0].websiteImport.conflicts.length,r.websiteImport.conflicts.length);
});
test('Ready status still validates source conflicts and empty titles cannot save',async t=>{
  const f=await fixture(t),r=extractWebsite(conflictHtml,'https://example.com/soup',f.profile.id).recipes[0];
  assert.throws(()=>f.store.saveRecipe({...r,status:'ready',sourceReview:r.sourceReview?{...r.sourceReview,confirmed:true}:null}),/Resolve|review|source|conflict/i);assert.throws(()=>f.store.saveRecipe({...r,title:'   '}));
  await editorMount(f,{...r,title:''});await click('Save recipe');assert.match(document.body.textContent,/Give your recipe a title/);assert.equal(f.store.snapshot().recipes.length,0);
});
test('failed save retains edits and permits retry',async t=>{
  const f=await fixture(t),actual=f.api.saveRecipe;f.api.saveRecipe=async()=>{throw Error('Disk write failed');};
  await f.mount();await click('Write a recipe');await change(aria('Recipe title'),'Keep these edits');await click('Save recipe');
  assert.equal(aria('Recipe title').value,'Keep these edits');assert.match(document.body.textContent,/Disk write failed/);assert.equal(f.store.snapshot().recipes.length,0);
  f.api.saveRecipe=actual;await click('Save recipe');assert.equal(f.store.snapshot().recipes[0].title,'Keep these edits');assert.ok(document.querySelector('.saved-recipe-page'));assert.equal(document.querySelector('.editor-page'),null);
});
test('snapshot failure after committed save does not report failed save or retain stale revision',async t=>{
  const f=await fixture(t);await f.mount();await click('Write a recipe');await change(aria('Recipe title'),'Saved despite refresh');
  f.api.snapshot=async()=>{throw Error('Snapshot unavailable');};await click('Save recipe');assert.match(document.body.textContent,/Saved to your library/);assert.match(document.body.textContent,/recipe was saved, but/);
  assert.ok(document.querySelector('.saved-recipe-page'));await click('Edit recipe');await change(aria('Recipe title'),'Second save');await click('Save recipe');assert.equal(f.store.snapshot().recipes[0].revision,2);
});
test('pending save guards double clicks, editing and navigation',async t=>{
  const f=await fixture(t),gate=defer(),actual=f.api.saveRecipe;let writes=0;f.api.saveRecipe=async r=>{writes++;await gate.promise;return actual(r);};
  await f.mount();await click('Write a recipe');await change(aria('Recipe title'),'Slow save');const save=button('Save recipe');await act(async()=>{save.click();save.click();});
  assert.equal(writes,1);assert.ok(aria('Recipe title').matches(':disabled'));await click('Home');assert.ok(document.querySelector('.editor-page'));await act(async()=>gate.resolve());await settle();assert.equal(f.store.snapshot().recipes.length,1);
});
test('history trash confirms, survives restart, hides Review and restores same recipe',async t=>{
  const f=await fixture(t),r=f.recipe('Discardable draft');f.store.saveJob(jobFor(r));await f.mount();await click('Drafts');
  await click(aria('Move Discardable draft to Trash'));await click('Keep recipe');assert.equal(f.store.snapshot().recipes.length,0);
  await click(aria('Move Discardable draft to Trash'));await click('Move to Trash');assert.equal(document.querySelector('.job-card'),null);assert.doesNotMatch(document.body.textContent,/View in Trash/);assert.equal([...document.querySelectorAll('button')].some(x=>x.textContent==='Review recipe'),false);
  await click(aria('Open profiles: Test kitchen'));await click(button('Trash',document.querySelector('dialog')));assert.ok(button('Discardable draft'));let s=await f.reopen();assert.ok(s.recipes[0].deletedAt);assert.equal(s.jobs[0].drafts[0].id,r.id);
  await click('Restore recipe');s=f.store.snapshot();assert.equal(s.recipes.length,1);assert.equal(s.recipes[0].id,r.id);assert.equal(s.recipes[0].deletedAt,null);
  await click(/^All Recipes/);assert.ok(button('Discardable draft'));await click('Drafts');assert.equal(document.querySelector('.job-card'),null);
});
test('editor trash saves current edits; failed trash remains open for retry',async t=>{
  const f=await fixture(t);await openDraft(f,f.recipe());await change(aria('Recipe title'),'Draft final edits');const save=f.api.saveRecipe;f.api.saveRecipe=async()=>{throw Error('Cannot move now');};
  await click(aria('Move recipe to Trash'));await click('Move to Trash');assert.ok(document.querySelector('dialog[open]'));assert.match(document.body.textContent,/Cannot move now/);
  f.api.saveRecipe=save;await click('Move to Trash');assert.equal(f.store.snapshot().recipes[0].title,'Draft final edits');assert.ok(f.store.snapshot().recipes[0].deletedAt);assert.equal(document.querySelector('.editor-page'),null);
});
test('dirty navigation and image paste protect edits',async t=>{
  const f=await fixture(t);await openDraft(f,f.recipe());await change(aria('Recipe title'),'Unsaved');await click(/Back to library/);
  assert.ok(document.querySelector('dialog[aria-label="Keep your changes?"]'));await click('Keep editing');assert.equal(aria('Recipe title').value,'Unsaved');
  const e=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{files:[{type:'image/png'}]}});await act(async()=>document.dispatchEvent(e));
  assert.ok(document.querySelector('dialog[aria-label="Keep your changes?"]'));await click('Keep editing');await click('Home');await click('Discard changes');assert.equal(document.querySelector('.editor-page'),null);
});
test('duplicate opens without false dirty prompt; separate version saves once',async t=>{
  const f=await fixture(t),r=f.store.saveRecipe(f.recipe());await openDraft(f,{...r,id:uid(),revision:0});await click('Save recipe');await click('Open saved recipe');assert.ok(document.querySelector('.saved-recipe-page'));assert.equal(document.querySelector('.editor-page'),null);await click(/Back to library/);
  assert.equal(document.querySelector('dialog'),null);assert.equal(f.store.snapshot().recipes.length,1);await click('Drafts');await click('Review recipe');await click('Save recipe');await click('Save separate version');assert.equal(f.store.snapshot().recipes.length,2);
});
test('all navigation tabs, favorites, search, list view and filter resets',async t=>{
  const f=await fixture(t);f.store.saveRecipe(f.recipe('Weeknight soup',{totalMinutes:35}));await f.mount();await click(aria('Favorite Weeknight soup'));await click('Favorites');assert.ok(button('Weeknight soup'));await click(aria('Unfavorite Weeknight soup'));assert.equal(document.querySelector('.recipe-card'),null);
  await click(/^All Recipes/);await change(aria('Search recipes'),'not found');assert.equal(document.querySelector('.recipe-card'),null);await change(aria('Search recipes'),'soup');assert.ok(button('Weeknight soup'));
  await click(aria('list view'));assert.ok(document.querySelector('.list-view'));await click('Filters');await change(field('Total minutes at most'),'10');assert.equal(document.querySelector('.recipe-card'),null);
  await click('Home');assert.ok(button('Weeknight soup'));await click(/^All Recipes/);assert.equal(aria('Search recipes').value,'');
  for(const p of ['Collections','Tags','Drafts','Settings','Trash','Home'])await click(p);assert.equal(f.calls.some(c=>c[0]==='capabilities'),false);
});
test('collections, tags and bulk organization work; deleting collection preserves recipes',async t=>{
  const f=await fixture(t),r=f.store.saveRecipe(f.recipe('Organize me'));await f.mount();await click('Collections');await click('New collection');await change(field('Name'),'Dinner');await click('Save collection');
  const c=f.store.snapshot().collections.find(c=>c.name==='Dinner');assert.ok(c);await click(/^All Recipes/);await click(aria('Select Organize me'));await change(aria('Bulk collection'),c.id);const tag=f.store.snapshot().tags[0];await change(aria('Bulk tag'),tag.id);await click('Apply');
  assert.deepEqual(f.store.snapshot().recipes[0].collectionIds,[c.id]);assert.deepEqual(f.store.snapshot().recipes[0].tagIds,[tag.id]);await click('Collections');await click(button('Edit',[...document.querySelectorAll('.collection-card')].find(x=>x.querySelector('h2')?.textContent==='Dinner')));await change(field('Name'),'Dinners');await click('Save collection');assert.equal(f.store.snapshot().collections.find(x=>x.id===c.id).name,'Dinners');
  await click(button('Edit',[...document.querySelectorAll('.collection-card')].find(x=>x.querySelector('h2')?.textContent==='Dinners')));await click('Delete collection');await click('Confirm delete');assert.equal(f.store.snapshot().collections.some(x=>x.id===c.id),false);assert.equal(f.store.snapshot().recipes[0].id,r.id);assert.deepEqual(f.store.snapshot().recipes[0].collectionIds,[]);
  await click('Tags');await click('New tag');await change(field('Name'),'Testing');await click('Save tag');assert.ok(f.store.snapshot().tags.some(t=>t.name==='Testing'));
});
test('settings, profile rename and profile switching protect unsaved edits',async t=>{
  const f=await fixture(t);f.store.saveProfile({...f.profile,id:uid(),name:'Second kitchen'});await f.mount();await click('Settings');await change(field('Profile name'),'Renamed kitchen');await click('Home');await click('Keep editing');await click('Save profile');
  assert.equal(f.store.snapshot().profiles.find(p=>p.id===f.profile.id).name,'Renamed kitchen');
  await click([...document.querySelectorAll('label')].find(x=>x.textContent.includes('Read screenshots with local OCR')).querySelector('input'));await click('Save processing settings');assert.equal(f.store.settings().ocrEnabled,true);
  await click('Home');assert.equal(document.querySelector('dialog'),null);await click('Write a recipe');await change(aria('Recipe title'),'Keep in this kitchen');await click(aria('Open profiles: Renamed kitchen'));await click(/Second kitchen/);await click('Keep editing');assert.equal(aria('Recipe title').value,'Keep in this kitchen');
  await click('Save recipe');await click(/Back to library/);await click(aria('Open profiles: Renamed kitchen'));await click(/Second kitchen/);assert.equal(document.querySelector('.recipe-card'),null);
});
test('cancel Add sources keeps revision and unrelated imports remain separate',async t=>{
  const f=await fixture(t);await openDraft(f,f.recipe('Original'));await click('Add screenshots or text');const modal=document.querySelector('dialog[aria-label="A new recipe starts here"]');assert.ok(modal);assert.equal(f.store.snapshot().recipes[0].revision,1);
  await click(modal.querySelector('[aria-label="Close dialog"]'));await change(aria('Recipe title'),'Original edited');await click('Save recipe');assert.equal(f.store.snapshot().recipes[0].revision,2);
  await click(/Back to library/);await click('Import Recipe');await change(field('Caption, ingredients, or instructions'),'Unrelated recipe');await click('Create recipe draft');assert.equal(document.querySelector('.history-supplement'),null);
});
test('manual ingredients, instructions, scale, notes and Cook controls',async t=>{
  const f=await fixture(t);await f.mount();await click('Write a recipe');await change(aria('Recipe title'),'Manual soup');await click('Add ingredient');await change(aria('Ingredient 1'),'200 g carrots');await click(/Add (step|instruction)/);await change(aria('Step 1'),'Cook the carrots.');
  await click(/Scale recipe/);await click('Notes');await change(field('Your kitchen notes'),'Family favorite');await click('Save recipe');const r=f.store.snapshot().recipes[0];assert.equal(r.ingredients[0].amount,400);assert.equal(r.steps[0].text,'Cook the carrots.');assert.equal(r.notes,'Family favorite');
  await click('Cook');assert.ok(document.querySelector('dialog'));assert.match(document.querySelector('dialog').textContent,/Cook the carrots/);await click(document.querySelector('dialog [aria-label="Close dialog"]'));
});
test('blank USDA portion leaves confirmed grams intact',async t=>{
  const f=await fixture(t),i=parseIngredient('100 g carrots');i.grams=100;i.food={fdcId:123,description:'Carrots',dataType:'Foundation',per100g:emptyMacros(),retrievedAt:now(),basis:'per100g',portions:[{description:'one large carrot',grams:75}]};
  await editorMount(f,f.recipe('Nutrition soup',{ingredients:[i]}));await click('Nutrition');const portion=[...document.querySelectorAll('select')].find(x=>x.textContent.includes('one large carrot'));assert.ok(portion);await change(portion,'');await click('Save recipe');assert.equal(f.store.snapshot().recipes[0].ingredients[0].grams,100);
});
test('pending media preparation blocks early submit, Escape and repeated picks',async t=>{
  const f=await fixture(t),gate=defer();let picks=0,closed=0;f.api.selectMedia=async()=>{picks++;return gate.promise;};
  await f.mount(h(ImportDialog,{profileId:f.profile.id,settings:defaultSettings,onClose:()=>closed++,onStarted:()=>{},onError:e=>{throw e;}}));await change(field('Caption, ingredients, or instructions'),'Soup');const choose=button('Choose files');await act(async()=>{choose.click();choose.click();});assert.equal(picks,1);assert.ok(button('Create recipe draft').matches(':disabled'));
  const event=new Event('cancel',{cancelable:true,bubbles:true});await act(async()=>document.querySelector('dialog').dispatchEvent(event));assert.equal(event.defaultPrevented,true);assert.equal(closed,0);
  await act(async()=>gate.resolve([{id:uid(),name:'recipe.png',mime:'image/png',size:20}]));await settle();await click('Create recipe draft');const calls=f.calls.filter(c=>c[0]==='startImport');assert.equal(calls.length,1);assert.equal(calls[0][1].assetIds.length,1);assert.equal(calls[0][1].readImages,true);
});
test('excess files are reported rather than silently truncated',async t=>{
  const f=await fixture(t),errors=[];f.api.selectMedia=async()=>Array.from({length:21},(_,i)=>({id:uid(),name:i+'.png',mime:'image/png',size:20}));
  await f.mount(h(ImportDialog,{profileId:f.profile.id,settings:defaultSettings,onClose:()=>{},onStarted:()=>{},onError:e=>errors.push(e.message)}));await click('Choose files');assert.match(errors[0],/20 files/);assert.equal(document.querySelectorAll('.media-item').length,0);
});
test('reading a saved browser file blocks importing stale content',async t=>{
  const f=await fixture(t),gate=defer(),errors=[];await f.mount(h(ImportDialog,{profileId:f.profile.id,settings:defaultSettings,onClose:()=>{},onStarted:()=>{},onError:e=>errors.push(e.message)}));await change(field('Caption, ingredients, or instructions'),'Fallback text');
  const input=aria('Saved browser recipe file');Object.defineProperty(input,'files',{value:[{size:10,text:()=>gate.promise}],configurable:true});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));assert.ok(button('Create recipe draft').matches(':disabled'));
  await act(async()=>gate.resolve('invalid JSON'));await settle();assert.equal(errors.length,1);assert.ok(!button('Create recipe draft').matches(':disabled'));
});


test('supplement imports attach only to their own job and remain unsaved until Save',async t=>{
  const f=await fixture(t),original=f.store.saveRecipe(f.recipe('Original dish',{evidence:[{id:uid(),kind:'text',label:'Original source',text:'Original source',assetId:null}]}));
  const other=f.recipe('Older unrelated import',{evidence:[{id:uid(),kind:'text',label:'Other source',text:'Other source',assetId:null}]});const oldJob=jobFor(other);f.store.saveJob(oldJob);
  await f.mount();await click('Original dish');await click('Edit recipe');await click('Add screenshots or text');await change(field('Caption, ingredients, or instructions'),'Extra details');await click('Create recipe draft');
  const newJob=f.store.snapshot().jobs.find(j=>j.id!==oldJob.id);newJob.drafts[0].evidence=[{id:uid(),kind:'text',label:'Extra source',text:'Extra source',assetId:null}];f.store.saveJob(newJob);await act(async()=>f.emit());await settle();
  await click('Review recipe');assert.equal(aria('Recipe title').value,'Older unrelated import');await click(/Back to library/);await click('Drafts');await click('Add evidence & review');
  assert.equal(aria('Recipe title').value,'Original dish');assert.equal(f.store.snapshot().recipes[0].evidence.length,1);await click(/Back to library/);assert.ok(document.querySelector('dialog[aria-label="Keep your changes?"]'));await click('Keep editing');await click('Save recipe');
  const saved=f.store.snapshot().recipes.find(r=>r.id===original.id);assert.equal(saved.evidence.length,2);assert.equal(saved.status,'review');assert.equal(saved.revision,3);assert.ok(document.querySelector('.saved-recipe-page'));await click('Drafts');assert.equal(document.querySelectorAll('.job-card').length,1);assert.match(document.querySelector('.job-card').textContent,/Older unrelated import/);
});
test('stale writes and cross-profile recipe relationships cannot overwrite existing data',async t=>{
  const f=await fixture(t),saved=f.store.saveRecipe(f.recipe());f.store.saveRecipe({...saved,title:'Corrected'});
  assert.throws(()=>f.store.saveRecipe({...saved,title:'Stale'}),/changed/);
  const other={...f.profile,id:uid(),name:'Other'};f.store.saveProfile(other);const foreignTag=f.store.snapshot().tags.find(tag=>tag.profileId===other.id);
  const current=f.store.snapshot().recipes[0];assert.throws(()=>f.store.saveRecipe({...current,tagIds:[foreignTag.id]}),/another profile/);assert.equal(f.store.snapshot().recipes[0].title,'Corrected');assert.deepEqual(f.store.snapshot().recipes[0].tagIds,[]);
});
test('profile creation and collection submission ignore rapid double clicks',async t=>{
  const f=await fixture(t);await f.mount();await click(aria('Open profiles: Test kitchen'));await change(field('New kitchen name'),'New kitchen');
  const gate=defer(),actual=f.api.saveProfile;let count=0;f.api.saveProfile=async p=>{count++;await gate.promise;return actual(p);};
  const add=button('Add a kitchen');await act(async()=>{add.click();add.click();});assert.equal(count,1);await act(async()=>gate.resolve());await settle();assert.equal(f.store.snapshot().profiles.filter(p=>p.name==='New kitchen').length,1);
  await click('Collections');await click('New collection');await change(field('Name'),'No duplicates');
  const collectionGate=defer(),save=f.api.saveCollection;let writes=0;f.api.saveCollection=async c=>{writes++;await collectionGate.promise;return save(c);};const buttonEl=button('Save collection');await act(async()=>{buttonEl.click();buttonEl.click();});assert.equal(writes,1);await act(async()=>collectionGate.resolve());await settle();assert.equal(f.store.snapshot().collections.filter(c=>c.name==='No duplicates').length,1);
});
test('export, print, backup and restore surface failures and respect cancellation',async t=>{
  const f=await fixture(t);await openDraft(f,f.recipe('Portable soup'));await click('Notes');
  f.api.exportRecipe=async()=>{throw Error('Export failed');};await click('Export JSON');assert.match(document.body.textContent,/Export failed/);assert.equal(f.store.snapshot().recipes.length,0);
  let exported;f.api.exportRecipe=async r=>{exported=r;return true;};await click('Export JSON');assert.equal(exported.title,'Portable soup');
  f.api.printRecipe=async()=>{throw Error('Printer unavailable');};await click('Print recipe');assert.match(document.body.textContent,/Printer unavailable/);
  await click('Settings');f.api.backup=async()=>{throw Error('Backup location unavailable');};await click('Save backup');assert.match(document.body.textContent,/Backup location unavailable/);await click(aria('Dismiss notification'));
  f.api.backup=async()=>false;await click('Save backup');assert.equal(document.querySelector('.toast'),null);
  f.api.backup=async()=>true;await click('Save backup');assert.match(document.body.textContent,/Backup saved/);await click(aria('Dismiss notification'));
  f.api.restore=async()=>false;await click('Restore backup');assert.equal(document.querySelector('.toast'),null);
  f.api.restore=async()=>true;await click('Restore backup');assert.match(document.body.textContent,/Backup restored/);
});
test('cooking steps, checklists and timer controls operate independently of saved recipe',async t=>{
  const f=await fixture(t),r=f.recipe('Cook me',{ingredients:[parseIngredient('1 carrot')],steps:[{id:uid(),text:'Simmer for 5 minutes.',group:'',provenance:'user'},{id:uid(),text:'Serve.',group:'',provenance:'user'}]});await editorMount(f,r);await click('Cook');assert.ok(button('Previous').disabled);
  await click(document.querySelector('.cooking-ingredient input'));assert.ok(document.querySelector('.cooking-ingredient.done'));
  // Advance between clock reads so two separate timestamps would display 5:01.
  let tick=Date.now();const clock=t.mock.method(Date,'now',()=>tick++);
  try {await click('Start 5 minute timer');} finally {clock.mock.restore();}
  assert.equal(document.querySelector('.timer').textContent,'5:00');
  await click('Next step');assert.equal(document.querySelector('.cooking-step').textContent,'Serve.');await click('Previous');assert.match(document.querySelector('.cooking-step').textContent,/Simmer/);await click('Next step');await click('Enjoy your meal');assert.equal(document.querySelector('dialog'),null);assert.equal(f.store.snapshot().recipes.length,0);
});
test('partial image-read failures keep successful attachments and report the failed file',async t=>{
  const f=await fixture(t),errors=[];const files=[{name:'good.png',type:'image/png',size:20,arrayBuffer:async()=>new ArrayBuffer(20)},{name:'bad.png',type:'image/png',size:20,arrayBuffer:async()=>{throw Error('Could not read bad.png');}}];
  await f.mount(h(ImportDialog,{profileId:f.profile.id,settings:defaultSettings,initialFiles:files,onClose:()=>{},onStarted:()=>{},onError:e=>errors.push(e.message)}));
  assert.equal(document.querySelectorAll('.media-item').length,1);assert.match(errors[0],/bad.png/);assert.match(document.querySelector('.media-item').textContent,/good.png/);
});
test('history cancel and retry act on the selected import',async t=>{
  const f=await fixture(t),job=jobFor(f.recipe());f.store.saveJob({...job,status:'running',stage:'Reading'});await f.mount();await click('Drafts');await click('Cancel import');
  assert.equal(f.store.snapshot().jobs[0].status,'canceled');await click(document.querySelector('.job-card summary'));await click('Retry as new draft');assert.equal(f.calls.filter(c=>c[0]==='startImport').length,1);assert.equal(f.store.snapshot().jobs.length,2);
});
test('opening a trashed recipe offers Restore and saves it back to the library',async t=>{
  const f=await fixture(t);f.store.saveRecipe(f.recipe('From trash',{deletedAt:now()}));await f.mount();await click('Trash');await click('From trash');
  assert.ok(aria('Move recipe to Trash').disabled);await click('Restore recipe');assert.equal(f.store.snapshot().recipes[0].deletedAt,null);await click(/Back to library/);assert.ok(button('From trash'));
});


test('legacy multi-version imports show one review action and no remnants after deleting it',async t=>{
  const f=await fixture(t),a=f.recipe('One soup',{ingredients:[parseIngredient('1 carrot')]}),b=f.recipe('One soup',{ingredients:[parseIngredient('1 carrot'),parseIngredient('2 onions')]});
  f.store.saveJob({...jobFor(a),drafts:[a,b]});await f.mount();await click('Drafts');
  assert.equal([...document.querySelectorAll('button')].filter(x=>x.textContent==='Review recipe').length,1);
  assert.equal(document.querySelectorAll('.import-card-main').length,1);assert.doesNotMatch(document.body.textContent,/Review 1|Review 2|View in Trash/);
  assert.equal(document.querySelector('.import-details').open,false);
  await click('Review recipe');assert.ok(aria('Ingredient 2'));await click(/Back to library/);await click('Drafts');await click(aria('Move One soup to Trash'));await click('Move to Trash');
  assert.equal(document.querySelector('.job-card'),null);assert.match(document.body.textContent,/No drafts to review/);
  const reopened=await f.reopen();assert.equal(reopened.jobs[0].drafts.length,2);assert.equal(reopened.recipes[0].id,b.id);assert.ok(reopened.recipes[0].deletedAt);
  await act(async()=>f.emit());await settle();assert.equal(document.querySelector('.job-card'),null);
  await click(aria('Open profiles: Test kitchen'));await click(button('Trash',document.querySelector('dialog')));assert.ok(button('One soup'));
});
test('deleting an import removes only that import and leaves other jobs available',async t=>{
  const f=await fixture(t);f.store.saveJob(jobFor(f.recipe('Keep me')));f.store.saveJob(jobFor(f.recipe('Remove me')));await f.mount();await click('Drafts');
  await click(aria('Move Remove me to Trash'));await click('Move to Trash');assert.equal(document.querySelectorAll('.job-card').length,1);assert.match(document.querySelector('.job-card').textContent,/Keep me/);assert.doesNotMatch(document.querySelector('.job-card').textContent,/Remove me|Trash/);
});
test('profile Trash navigation respects unsaved recipe edits',async t=>{
  const f=await fixture(t);await f.mount();await click('Write a recipe');await change(aria('Recipe title'),'Do not lose this');
  await click(aria('Open profiles: Test kitchen'));await click(button('Trash',document.querySelector('dialog')));await click('Keep editing');assert.equal(aria('Recipe title').value,'Do not lose this');
});


test('Drafts replaces history in the sidebar and saved imports stay gone after database reopen',async t=>{
  const f=await fixture(t),draft=f.recipe('Pending soup');f.store.saveJob(jobFor(draft));await f.mount();
  assert.equal([...document.querySelectorAll('.sidebar nav button')].filter(b=>b.textContent==='Drafts').length,1);
  assert.doesNotMatch(document.querySelector('.sidebar').textContent,/Import History/);
  await click('Drafts');await click('Review recipe');await click('Save recipe');
  assert.ok(document.querySelector('.saved-recipe-page'));assert.equal(document.querySelector('.sidebar nav button.active').textContent.replace(/1$/,''),'All Recipes');
  await f.reopen();await act(async()=>f.emit());await settle();await click('Drafts');assert.equal(document.querySelector('.job-card'),null);
  assert.equal(f.store.snapshot().jobs.length,1);await click(/^All Recipes/);await click('Pending soup');assert.ok(document.querySelector('.saved-recipe-page'));
});
test('saved recipe page preserves groups, notes, original nutrition, evidence, and unknown estimates',async t=>{
  const f=await fixture(t),r=extractWebsite(conflictHtml,'https://example.com/soup',f.profile.id).recipes[0];r.notes='Keep the source amounts.';r.ingredients[0].group='Soup';
  await openDraft(f,r);await click('Save recipe');assert.ok(document.querySelector('.saved-recipe-page'));
  assert.equal(document.querySelectorAll('.recipe-ingredient-list input').length,5);assert.match(document.querySelector('.recipe-notes').textContent,/Keep the source amounts/);
  assert.match(document.querySelector('.recipe-group').textContent,/Soup/);assert.match(document.querySelector('[aria-label="Estimated nutrition"]').textContent,/Not calculated/);
  assert.match(document.querySelector('.recipe-source').textContent,/source|recipe|soup/i);
  const stored=f.store.snapshot().recipes[0];assert.deepEqual(stored.sourceNutrition,r.sourceNutrition);assert.deepEqual(stored.websiteImport.conflicts,r.websiteImport.conflicts);
  await click(document.querySelector('.recipe-ingredient-list input'));assert.ok(document.querySelector('.recipe-ingredient-list .checked'));assert.equal(f.store.snapshot().recipes[0].revision,1);
});
test('editing a saved recipe keeps the unsaved-change guard and failed edits stay editable',async t=>{
  const f=await fixture(t);f.store.saveRecipe(f.recipe('Saved soup'));await f.mount();await click('Saved soup');await click('Edit recipe');await change(aria('Recipe title'),'Changed soup');
  await click('Drafts');await click('Keep editing');assert.equal(aria('Recipe title').value,'Changed soup');
  const save=f.api.saveRecipe;f.api.saveRecipe=async()=>{throw Error('Write rejected');};await click('Save recipe');assert.ok(document.querySelector('.editor-page'));assert.equal(f.store.snapshot().recipes[0].title,'Saved soup');
  f.api.saveRecipe=save;await click('Save recipe');assert.equal(document.querySelector('.saved-recipe-page h1').textContent,'Changed soup');assert.equal(f.store.snapshot().recipes[0].revision,2);
});
test('saved and pending recipes remain separate across profiles',async t=>{
  const f=await fixture(t),second={...f.profile,id:uid(),name:'Other kitchen'};f.store.saveProfile(second);
  f.store.saveRecipe(f.recipe('My saved recipe'));f.store.saveJob(jobFor(f.recipe('My draft')));f.store.saveJob(jobFor({...f.recipe('Other draft'),profileId:second.id}));
  await f.mount();await click('Drafts');assert.equal(document.querySelectorAll('.job-card').length,1);assert.match(document.querySelector('.job-card').textContent,/My draft/);
  await click(aria('Open profiles: Test kitchen'));await click(/Other kitchen/);await click('Drafts');assert.equal(document.querySelectorAll('.job-card').length,1);assert.match(document.querySelector('.job-card').textContent,/Other draft/);
  await click(/^All Recipes/);assert.equal(document.querySelector('.recipe-card'),null);
});
test('recipe cover opens the saved page with keyboard activation',async t=>{
  const f=await fixture(t);f.store.saveRecipe(f.recipe('Keyboard soup'));await f.mount();const cover=aria('Open recipe: Keyboard soup');
  await act(async()=>cover.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await settle();assert.equal(document.querySelector('.saved-recipe-page h1').textContent,'Keyboard soup');
});


test('imported cover appears on Home and saved page; replacing/removing persists and picker cancel preserves it',async t=>{
  const f=await fixture(t),original={id:uid(),name:'Dish photo',mime:'image/png',size:100},replacement={id:uid(),name:'My photo',mime:'image/png',size:100};
  f.store.addAsset(original,f.profile.id);f.store.addAsset(replacement,f.profile.id);
  const r=f.recipe('Soup with photo',{coverId:original.id});await openDraft(f,r);await click('Save recipe');
  assert.equal(document.querySelector('.recipe-page-hero img').getAttribute('src'),`nibble://media/${original.id}`);
  await click('Home');assert.equal(document.querySelector('.recipe-card img').getAttribute('src'),`nibble://media/${original.id}`);
  await click('Soup with photo');await click('Edit recipe');await click('Change cover photo');assert.equal(document.querySelector('.recipe-heading img').getAttribute('src'),`nibble://media/${original.id}`);
  await click('Cancel');f.api.addImage=async()=>replacement;await click('Change cover photo');await pastePhoto();await click('Use this photo');await click('Save recipe');assert.equal(f.store.snapshot().recipes[0].coverId,replacement.id);
  await click('Edit recipe');await click('Remove cover photo');await click('Save recipe');assert.equal(f.store.snapshot().recipes[0].coverId,null);assert.equal(document.querySelector('.recipe-page-hero img'),null);
  assert.equal((await f.reopen()).recipes[0].coverId,null);
});

async function pastePhoto(target=aria('Paste cover photo'), type='image/png', size=128) {
  const file={name:'Pasted food.png',type,size,arrayBuffer:async()=>new Uint8Array([137,80,78,71]).buffer};
  const event=new Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'clipboardData',{value:{files:[file],items:[]}});
  await act(async()=>target.dispatchEvent(event));await settle();return event;
}
test('cover paste previews, confirms, survives save failure/retry and appears on saved cards',async t=>{
  const f=await fixture(t),r=f.recipe('Pasted dish'),photo={id:uid(),name:'food.png',mime:'image/png',size:128};f.store.addAsset(photo,f.profile.id);
  let calls=0;f.api.addImage=async(owner,name,bytes,cover)=>{calls++;assert.equal(owner,f.profile.id);assert.equal(cover,true);return photo;};
  await openDraft(f,r);await change(aria('Recipe description'),'Keep this description');await click('Choose cover photo');
  assert.equal(document.activeElement,aria('Paste cover photo'));await pastePhoto();
  assert.equal(document.querySelector('.recipe-heading img'),null);assert.ok(document.querySelector('.cover-photo-preview img'));await click('Use this photo');
  const save=f.api.saveRecipe;f.api.saveRecipe=async()=>{throw Error('Disk full');};await click('Save recipe');
  assert.match(document.body.textContent,/Disk full/);assert.equal(aria('Recipe description').value,'Keep this description');assert.equal(document.querySelector('.recipe-heading img').getAttribute('src'),'nibble://media/'+photo.id);
  f.api.saveRecipe=save;await click('Save recipe');await click('Home');
  assert.equal(document.querySelector('.recipe-card img').getAttribute('src'),'nibble://media/'+photo.id);assert.equal(calls,1);
  assert.equal((await f.reopen()).recipes[0].coverId,photo.id);
});
test('cover paste cancellation and decoding errors keep the current cover and form edits',async t=>{
  const f=await fixture(t),old={id:uid(),name:'old.png',mime:'image/png',size:10},next={...old,id:uid(),name:'next.png'};
  f.store.addAsset(old,f.profile.id);f.store.addAsset(next,f.profile.id);await openDraft(f,f.recipe('Keep cover',{coverId:old.id}));
  await change(aria('Recipe title'),'Keep edited title');await click('Change cover photo');f.api.addImage=async()=>next;await pastePhoto();await click('Cancel');
  assert.equal(document.querySelector('.recipe-heading img').getAttribute('src'),'nibble://media/'+old.id);
  await click('Change cover photo');f.api.addImage=async()=>{throw Error('Unreadable photo');};await pastePhoto();
  assert.match(document.body.textContent,/Unreadable photo/);assert.equal(button('Use this photo').disabled,true);
  await pastePhoto(aria('Paste cover photo'),'image/svg+xml');assert.match(document.body.textContent,/PNG, JPG, or WebP/);
  await pastePhoto(aria('Paste cover photo'),'image/png',9*1024*1024);assert.match(document.body.textContent,/smaller than 8 MB/);
  await click('Cancel');assert.equal(aria('Recipe title').value,'Keep edited title');
});
test('cover upload serializes duplicate pastes and locks save/navigation until preparation completes',async t=>{
  const f=await fixture(t),gate=defer(),photo={id:uid(),name:'food.png',mime:'image/png',size:10};f.store.addAsset(photo,f.profile.id);let calls=0;
  f.api.addImage=async()=>{calls++;await gate.promise;return photo;};await openDraft(f,f.recipe());await click('Choose cover photo');
  await pastePhoto();await pastePhoto();assert.equal(calls,1);assert.ok(button('Cancel').disabled);assert.ok(aria('Recipe title').matches(':disabled'));
  await click('Home');assert.ok(document.querySelector('.editor-page'));await act(async()=>gate.resolve());await settle();await click('Use this photo');await click('Save recipe');
  assert.equal(f.store.snapshot().recipes[0].coverId,photo.id);
});
test('cover file picker shares the paste decoder and text paste outside the dialog is untouched',async t=>{
  const f=await fixture(t),photo={id:uid(),name:'food.webp',mime:'image/png',size:10};f.store.addAsset(photo,f.profile.id);let calls=0;
  f.api.addImage=async(owner,name,bytes,cover)=>{assert.equal(cover,true);calls++;return photo;};await openDraft(f,f.recipe());
  const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:[],items:[],getData:()=> 'Some recipe notes'}});
  await act(async()=>aria('Recipe description').dispatchEvent(event));assert.equal(event.defaultPrevented,false);assert.equal(calls,0);
  await click('Choose cover photo');const input=aria('Cover photo file');
  Object.defineProperty(input,'files',{value:[{name:'food.webp',type:'image/webp',size:128,arrayBuffer:async()=>new ArrayBuffer(4)}],configurable:true});
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));await settle();await click('Use this photo');
  assert.equal(calls,1);assert.equal(document.querySelector('.recipe-heading img').getAttribute('src'),'nibble://media/'+photo.id);
});
