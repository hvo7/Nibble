import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

await mkdir('.nibble-test',{recursive:true});
const root=await mkdtemp(path.resolve('.nibble-test/single-import-'));
const bundle=path.join(root,'imports.cjs');
await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:[
"export {singleImportDraft,primaryImportRecipe,historyImportRecipe,importTitleHint} from './src/shared/import-draft';",
"export {Store} from './electron/database';",
"export {MediaStore} from './electron/media';",
"export {organizeLocal} from './electron/extraction';",
"export {ImportService} from './electron/processing';",
"export {createPreviewApi} from './tests/ui/preview-api';",
"export {extractWebsite} from './electron/website';",
"export {blankRecipe,uid,recipeSchema} from './src/shared/model';",
"export {sourceRecipe,jsonLd} from './tests/fixtures/website';",
"export {savedBrowserRecipe} from './tests/fixtures/browser-capture';"
].join('\n')},outfile:bundle,bundle:true,platform:'node',format:'cjs',packages:'external',logLevel:'silent',plugins:[{name:'offline-boundaries',setup(builder){
  builder.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'offline'}));
  builder.onResolve({filter:/^\.\/network$/},()=>({path:'network',namespace:'offline'}));
  builder.onLoad({filter:/.*/,namespace:'offline'},args=>({contents:args.path==='electron'
    ? "export const app={isPackaged:false,getAppPath:()=>process.cwd()}; export const nativeImage={};"
    : "export async function fetchPublic(url,signal){signal?.throwIfAborted();return {body:globalThis.__offlineRecipeHtml,url};} export async function fetchPublicImage(){throw Error('Image transport is offline in this suite.');}",loader:'js'}));
}}]});
const {singleImportDraft,primaryImportRecipe,historyImportRecipe,importTitleHint,Store,MediaStore,ImportService,organizeLocal,createPreviewApi,extractWebsite,blankRecipe,uid,recipeSchema,sourceRecipe,jsonLd,savedBrowserRecipe}=createRequire(import.meta.url)(bundle);
globalThis.fetch=()=>{throw Error('External access is disabled in this suite.');};
const parse=html=>extractWebsite(html,'https://example.com/carrot-ginger-soup',uid()).recipes;
const variant={...sourceRecipe,recipeIngredient:['800 g carrots','150 g onion','15 g olive oil','10 g ginger','750 ml stock','2 g salt'],recipeYield:'6 servings',nutrition:{...sourceRecipe.nutrition,calories:'240 kcal'}};
const twoVariants=jsonLd([sourceRecipe,variant]);
const unrelated={...sourceRecipe,name:'Banana bread',recipeIngredient:Array.from({length:12},(_,i)=>(i+1)+' g ingredient '+i)};
const multiDish=jsonLd([unrelated,sourceRecipe]);
const now=()=>new Date().toISOString();
function capture(html){return{...savedBrowserRecipe(),url:'https://example.com/carrot-ginger-soup',title:'Carrot & ginger soup',html};}
async function desktop(t){
  const store=new Store(await mkdtemp(path.join(root,'db-')));await store.open();const profileId=uid();store.saveProfile({id:profileId,name:'Test kitchen',units:'metric',avatar:'',createdAt:now()});
  const service=new ImportService(store,new MediaStore(store),()=>{});t.after(()=>{service.cancelAll();store.close();});return{store,service,profileId};
}
async function finished(snapshot,id){
  for(let i=0;i<200;i++){await new Promise(resolve=>setImmediate(resolve));const job=(await snapshot()).jobs.find(j=>j.id===id);if(job?.status!=='running')return job;}
  throw Error('Import did not finish');
}
test('same-title variants become one complete recipe with reviewable conflicts and retained sources',()=>{
  const candidates=parse(twoVariants),before=structuredClone(candidates);assert.equal(candidates.length,2);
  const [r]=singleImportDraft(candidates);assert.equal(r.ingredients.length,6);assert.deepEqual(r.ingredients.map(i=>i.original),variant.recipeIngredient);assert.equal(r.servings,null);assert.equal(r.sourceNutrition,null);
  assert.ok(r.websiteImport.conflicts.some(c=>c.field==='servings'&&!c.resolved));assert.ok(r.websiteImport.conflicts.some(c=>c.field==='nutrition'&&!c.resolved));
  assert.ok(r.evidence.some(e=>e.label.startsWith('Additional source record:')));assert.match(r.evidence.map(e=>e.text).join('\n'),/600 g carrots/);assert.match(r.evidence.map(e=>e.text).join('\n'),/180/);
  assert.equal(r.sourceReview.confirmed,false);assert.equal(r.status,'review');recipeSchema.parse(r);assert.deepEqual(candidates,before);assert.equal(singleImportDraft([r])[0],r);
});
test('page-title relevance selects the main dish instead of a longer related recipe',()=>{
  const candidates=parse(multiDish),[r]=singleImportDraft(candidates,'Carrot & ginger soup');
  assert.equal(r.title,sourceRecipe.name);assert.equal(r.ingredients.length,5);assert.ok(!r.ingredients.some(i=>i.original.includes('ingredient 12')));assert.equal(r.servings,4);assert.equal(r.sourceNutrition.values.calories,180);assert.equal(r.websiteImport.conflicts.length,0);
  assert.ok(r.evidence.some(e=>e.text.includes('Banana bread')));
});
test('visible complete recipe card wins a tied structured representation without joining quantities',()=>{
  const candidates=parse(twoVariants);candidates[0].websiteImport.method='Recipe card';
  const [r]=singleImportDraft(candidates);assert.equal(r.id,candidates[0].id);assert.equal(r.ingredients[0].amount,600);assert.equal(r.ingredients.length,5);
});
test('legacy history preserves saved edits and deleted identity instead of exposing an alternate draft',()=>{
  const candidates=parse(twoVariants),id=uid();const job={id,profileId:candidates[0].profileId,request:{url:'https://example.com/carrot-ginger-soup',text:'',assetIds:[],useAI:false,profileId:candidates[0].profileId},drafts:candidates};
  const saved={...candidates[0],revision:1,title:'My corrections',updatedAt:now()};assert.equal(historyImportRecipe(job,[saved]).title,'My corrections');
  const deleted={...saved,revision:2,deletedAt:now()};assert.equal(historyImportRecipe(job,[deleted]),deleted);assert.ok(historyImportRecipe(job,[deleted]).deletedAt);
  assert.equal(importTitleHint(job),'carrot ginger soup');assert.equal(singleImportDraft([]).length,0);assert.equal(primaryImportRecipe([]),undefined);
});
test('desktop website import stores exactly one draft with accurate primary ingredient count',async t=>{
  const {store,service,profileId}=await desktop(t);globalThis.__offlineRecipeHtml=multiDish;
  const id=service.start({profileId,url:'https://example.com/carrot-ginger-soup',text:'',assetIds:[],useAI:false});
  const job=await finished(()=>store.snapshot(),id);assert.equal(job.status,'review');assert.equal(job.drafts.length,1);assert.equal(job.drafts[0].title,sourceRecipe.name);assert.equal(job.drafts[0].ingredients.length,5);assert.match(job.stage,/^5 ingredients/);
  const saved=store.saveRecipe(job.drafts[0]);assert.equal(saved.revision,1);assert.equal(store.snapshot().jobs[0].drafts.length,1);
});
test('desktop saved-page import plus text keeps one draft and all original evidence',async t=>{
  const {store,service,profileId}=await desktop(t);const id=service.start({profileId,url:'',text:'A note from the cook.',assetIds:[],useAI:false,browserCapture:capture(twoVariants)});
  const job=await finished(()=>store.snapshot(),id);assert.equal(job.status,'review');assert.equal(job.drafts.length,1);assert.equal(job.drafts[0].ingredients.length,6);assert.ok(job.drafts[0].evidence.some(e=>e.text==='A note from the cook.'));
  const saved=store.saveRecipe(job.drafts[0]);assert.throws(()=>store.saveRecipe({...saved,status:'ready',sourceReview:{confirmed:true,parser:'sections-v2'}}),/conflict|Resolve/i);
});
test('preview saved-page import follows the same single-draft and source-conflict rules',async()=>{
  const {api,profileId}=createPreviewApi({});const id=await api.startImport({profileId,url:'',text:'',assetIds:[],useAI:false,browserCapture:capture(twoVariants)});
  const job=await finished(api.snapshot,id);assert.equal(job.status,'review');assert.equal(job.drafts.length,1);assert.equal(job.drafts[0].ingredients.length,6);assert.equal(job.drafts[0].servings,null);
  const saved=await api.saveRecipe(job.drafts[0]);assert.equal(saved.revision,1);await assert.rejects(api.saveRecipe({...saved,status:'ready',sourceReview:{confirmed:true,parser:'sections-v2'}}),/conflict|Resolve/i);
});
test('plain-text imports retain one standard recipe with nutrition separate from ingredients',async t=>{
  const {store,service,profileId}=await desktop(t);const id=service.start({profileId,url:'',text:'Soup\nServes 2\nIngredients\n200 g carrots\n1 tbsp oil\nInstructions\nCook the carrots.\nNutrition\nPer serving\nCalories: 120 kcal',assetIds:[],useAI:false});
  const job=await finished(()=>store.snapshot(),id);assert.equal(job.drafts.length,1);assert.equal(job.drafts[0].ingredients.length,2);assert.equal(job.drafts[0].steps.length,1);assert.equal(job.drafts[0].sourceNutrition.values.calories,120);
});


test('local-model organization requests and accepts one recipe, rejecting multiple suggestions',async()=>{
  const originalFetch=globalThis.fetch,requests=[];let duplicate=false;
  const recipe={title:'Carrot soup',description:'',ingredients:['1 carrot'],steps:['Cook carrot.'],servings:null};
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/api/tags'))return{ok:true,json:async()=>({models:[{name:'local-test'}]})};
    assert.equal(url,'http://127.0.0.1:11434/api/chat');requests.push(JSON.parse(options.body));
    return{ok:true,json:async()=>({message:{content:JSON.stringify({recipes:duplicate?[recipe,recipe]:[recipe]})}})};
  };
  try{
    const text='Carrot soup\nIngredients\n1 carrot\nInstructions\nCook carrot.';
    const result=await organizeLocal(text,uid(),'local-test',new AbortController().signal);assert.equal(result.length,1);assert.equal(result[0].ingredients.length,1);
    assert.equal(requests[0].format.properties.recipes.maxItems,1);assert.match(requests[0].messages[0].content,/one consistent recipe/);
    duplicate=true;await assert.rejects(organizeLocal(text,uid(),'local-test',new AbortController().signal));
  }finally{globalThis.fetch=originalFetch;}
});

