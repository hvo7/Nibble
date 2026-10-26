import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('electron',()=>({nativeImage:{createFromBuffer:vi.fn()}}));
import { nativeImage } from 'electron';
import { MediaStore } from '../electron/media';
import { Store } from '../electron/database';
import { uid } from '../src/shared/model';
let directory:string, store:Store, media:MediaStore, owner:string;
beforeEach(async()=>{directory=mkdtempSync(path.join(os.tmpdir(),'nibble-cover-'));store=new Store(directory);await store.open();owner=uid();store.saveProfile({id:owner,name:'Kitchen',units:'metric',avatar:'',createdAt:''});media=new MediaStore(store);});
afterEach(()=>{store.close();rmSync(directory,{recursive:true,force:true});vi.resetAllMocks();});
function image(width:number,height:number,empty=false){vi.mocked(nativeImage.createFromBuffer).mockReturnValue({getSize:()=>({width,height}),isEmpty:()=>empty,toPNG:()=>Buffer.from('re-encoded PNG without metadata')} as never);}
describe('Local dish photo storage',()=>{
  it('stores only re-encoded image bytes and keeps the asset owned by the importing profile',()=>{
    image(1200,900);const asset=media.addImage(Buffer.from('downloaded photo'),'Recipe photo.png',owner,true);
    expect(readFileSync(media.file(asset.id)).toString()).toBe('re-encoded PNG without metadata');expect(store.asset(asset.id,owner).mime).toBe('image/png');
    expect(()=>store.asset(asset.id,uid())).toThrow();
  });
  it('rejects unreadable, tiny, banner-shaped and overlarge decoded photos without writing assets',()=>{
    for(const [w,h,empty] of [[0,0,true],[1,1,false],[190,200,false],[1600,100,false],[100,1600,false],[10000,10000,false]] as const){
      image(w,h,empty);expect(()=>media.addImage(Buffer.from('photo'),'photo',owner,true)).toThrow();expect(readdirSync(media.directory)).toEqual([]);
    }
  });
  it('keeps normal screenshot uploads available at their original small dimensions',()=>{
    image(100,100);expect(media.addImage(Buffer.from('screenshot'),'screenshot',owner).id).toBeTruthy();
  });
});

it('cancellation during real photo decoding writes no asset or file', async () => {
  const sharp = (await import('sharp')).default;
  const bytes=await sharp({create:{width:400,height:428,channels:3,background:'red'}}).webp().toBuffer();
  const controller=new AbortController();
  const pending=media.addCoverPhoto(bytes,'Cover',owner,controller.signal);controller.abort(new Error('Canceled'));
  await expect(pending).rejects.toThrow('Canceled');
  expect(store.assetList()).toHaveLength(0);expect(readdirSync(media.directory)).toEqual([]);
});
