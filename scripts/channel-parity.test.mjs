import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyChannelParity } from './verify-channel-parity.mjs';

function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nibble-parity-'));
  const names=['src/App.tsx','electron/main.ts','electron/processing.ts','electron/website-images.ts','electron/cover-photo.ts'];
  for(const name of names){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),'current source: '+name);}
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'1.0.1'}));
  for(const app of [root,path.join(root,'.nibble-staging/app')]){
    fs.mkdirSync(path.join(app,'dist/assets'),{recursive:true});fs.mkdirSync(path.join(app,'dist-electron'),{recursive:true});
    fs.writeFileSync(path.join(app,'dist/index.html'),'<script src="./assets/app.js"></script><link href="./assets/app.css">');
    fs.writeFileSync(path.join(app,'dist/assets/app.js'),'bundle');
    fs.writeFileSync(path.join(app,'dist/assets/app.css'),'same stylesheet');
    fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({version:'1.0.1'}));
    fs.mkdirSync(path.join(app,'browser-companion'),{recursive:true});
    for(const name of ['capture.js','photo-capture.js','popup.js','popup.html','popup.css']) fs.writeFileSync(path.join(app,'browser-companion',name),'shared companion '+name);
    fs.writeFileSync(path.join(app,'browser-companion/manifest.json'),JSON.stringify({name:app===root?'Nibble Recipe Companion':'Nibble Recipe Companion (Staging)',version:app===root?'1.0.1':'1.1.0',manifest_version:3,permissions:['activeTab','scripting']}));
    for(const name of ['dist/assets/app.js','dist-electron/main.cjs','dist-electron/preload.cjs']){
      fs.writeFileSync(path.join(app,name),'bundle');
      const mapFile=path.join(app,name+'.map');
      fs.writeFileSync(mapFile,JSON.stringify({sources:names.map(n=>path.relative(path.dirname(mapFile),path.join(root,n))),sourcesContent:names.map(n=>fs.readFileSync(path.join(root,n),'utf8'))}));
    }
  }
  return root;
}
test('parity verifies both channels against current application source',()=>{
  const root=fixture();try{assert.equal(verifyChannelParity(root).applicationSources,5);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('parity rejects an old production decoder even if the launcher version matches',()=>{
  const root=fixture();try{fs.appendFileSync(path.join(root,'dist-electron/main.cjs'),'old decoder');assert.throws(()=>verifyChannelParity(root),/Desktop bundle differs/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('parity rejects matching but stale bundles and different active styles',()=>{
  const root=fixture();try{
    fs.appendFileSync(path.join(root,'electron/cover-photo.ts'),'new code');assert.throws(()=>verifyChannelParity(root),/Stale compiled source/);
    fs.writeFileSync(path.join(root,'electron/cover-photo.ts'),'current source: electron/cover-photo.ts');
    fs.appendFileSync(path.join(root,'.nibble-staging/app/dist/assets/app.css'),'changed');assert.throws(()=>verifyChannelParity(root),/styles differ/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('parity rejects an outdated production companion even when app bundles match',()=>{
  const root=fixture();try{
    fs.appendFileSync(path.join(root,'browser-companion/popup.js'),'old companion');
    assert.throws(()=>verifyChannelParity(root),/Browser companion differs/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
