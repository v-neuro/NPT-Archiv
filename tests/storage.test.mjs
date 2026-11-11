import test from 'node:test';
import assert from 'node:assert/strict';
import { FolderStorage,permission,verifiedWrite,probeFolder,readManifest,inspectFolder,createArchive } from '../src/storage.js';
const missing=()=>new DOMException('Missing','NotFoundError');
function memoryDirectory(){
 const data=new Map();let failure='';const handle={name:'SYNTHETIC',kind:'directory',queryPermission:async()=>failure==='permission'?'denied':'granted',requestPermission:async()=>'denied',
 async getFileHandle(name,options={}){if(options.create&&failure==='createMissing')throw missing();if(!data.has(name)){if(!options.create)throw missing();data.set(name,new Uint8Array());}return {kind:'file',async getFile(){if(failure==='read')throw new DOMException('Disconnected','NotReadableError');return new File([data.get(name)],name);},async createWritable(){if(failure==='createWritable')throw new DOMException('Denied','NotAllowedError');let pending;return{async write(value){if(failure==='write')throw new DOMException('Disk full','QuotaExceededError');pending=value;},async close(){if(failure==='close')throw new DOMException('Disconnected','NotReadableError');data.set(name,failure==='corrupt'?new Uint8Array([0]):pending);},async abort(){}};}};},async* entries(){for(const name of data.keys())yield[name,{kind:'file'}];},async removeEntry(name){if(failure==='remove')throw missing();data.delete(name);}};
 return{data,storage:new FolderStorage(handle),setFailure:value=>{failure=value;}};
}
for(const failure of ['createWritable','write','close','read','corrupt'])test(`File System Access adapter rejects ${failure} failure without a false success`,async()=>{
 const m=memoryDirectory();m.setFailure(failure);await assert.rejects(verifiedWrite(m.storage,'synthetic.csv','SYNTHETIC'));assert.equal(m.data.has('synthetic.csv'),true);
});
test('permission denial/revocation and overwrite/path protection',async()=>{
 const m=memoryDirectory();await permission(m.storage.handle,'readwrite');m.setFailure('permission');await assert.rejects(permission(m.storage.handle,'readwrite',true),/nicht erlaubt/);m.setFailure('');
 await verifiedWrite(m.storage,'synthetic.csv','SYNTHETIC');await assert.rejects(verifiedWrite(m.storage,'synthetic.csv','REPLACEMENT'),/nicht überschrieben/);await assert.rejects(m.storage.writeNew('../unsafe','x'));assert.equal(new TextDecoder().decode(m.data.get('synthetic.csv')),'SYNTHETIC');
});
for(const [failure,step] of [['createMissing','Datei anlegen'],['createWritable','Schreibstream öffnen'],['read','Dateistand lesen'],['remove','Eigene Prüfdatei entfernen']])test(`folder probe exposes the failing ${step} step without claiming success`,async()=>{
 const m=memoryDirectory();const original=new TextEncoder().encode('EXISTING SYNTHETIC ARCHIVE');m.data.set('archive.json',original);m.setFailure(failure);
 await assert.rejects(probeFolder(m.storage),error=>{
  assert.equal(error.name,'FolderProbeError');assert.ok(error.message.includes(step));assert.ok(error.details.includes('Browserfehler:'));assert.match(error.details,/npt-ordnerpruefung-[a-f0-9-]+\.txt/);assert.ok(error.cause);return true;
 });
 assert.deepEqual(m.data.get('archive.json'),original);
});
test('empty selected folder gets a useful missing-manifest explanation and is not initialized',async()=>{
 const m=memoryDirectory();await assert.rejects(readManifest(m.storage),/In diesem Ordner fehlt archive.json/);assert.equal(m.data.size,0);
});
test('folder inspection distinguishes empty, unrelated and valid archives without initializing unrelated content',async()=>{
 const m=memoryDirectory();assert.equal((await inspectFolder(m.storage)).kind,'empty');assert.equal(m.data.size,0);
 m.data.set('unrelated.csv',new TextEncoder().encode('SYNTHETIC'));assert.equal((await inspectFolder(m.storage)).kind,'unrelated');assert.equal(m.data.size,1);
 m.data.delete('unrelated.csv');const manifest=await createArchive(m.storage);const found=await inspectFolder(m.storage);assert.equal(found.kind,'archive');assert.equal(found.manifest.archiveId,manifest.archiveId);
});
test('unreadable archive metadata is never classified as an empty setup candidate',async()=>{
 const m=memoryDirectory();m.data.set('archive.json',new TextEncoder().encode('{'));await assert.rejects(inspectFolder(m.storage));assert.equal(m.data.size,1);
});
