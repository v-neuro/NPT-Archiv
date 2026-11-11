import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Archive, scanArchive, seal, copyArchive } from '../src/archive.js';
import { createArchive, probeFolder } from '../src/storage.js';
import { objectPath, selectedRevision } from '../src/model.js';
import { sha256, uid } from '../src/shared.js';
import { DiskStorage, sampleOperations, syntheticPdf } from './support.mjs';
async function setup(t){const root=await mkdtemp(join(tmpdir(),'npt-archive-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);const archive=await Archive.open(storage);return {root,storage,archive};}
test('disk-only reopen recovers patient, stay, selected revisions and PDF links; verified copy restores independently',async t=>{
 const {storage,archive}=await setup(t);const sample=await sampleOperations();
 await archive.commit(sample.operations,sample.files,'SYNTH');
 const pdf=syntheticPdf(),hash=await sha256(pdf);const attachment={id:uid(),hash,size:pdf.length,kind:'pdf',name:'synthetic.pdf',method:'manual-confirmation',note:'Synthetic session compared',revisionId:null};
 await archive.commit([{type:'attachment.add',assessmentId:sample.assessment.id,attachment}],new Map([[hash,pdf]]));
 const reopened=await Archive.open(new DiskStorage(storage.root)); // No caches, IDB or handles from prior app instance.
 const a=reopened.snapshot.state.assessments[sample.assessment.id];assert.equal(a.patientId,sample.patient.id);assert.equal(a.stayId,'0000456');assert.equal(selectedRevision(a).id,sample.revision.id);assert.equal(a.attachments[0].hash,hash);assert.equal(reopened.snapshot.state.patients[a.patientId].identifier,'000123');
 assert.deepEqual(await storage.read(objectPath(a.attachments[0])),pdf);
 const targetRoot=await mkdtemp(join(tmpdir(),'npt-archive-restore-'));t.after(()=>rm(targetRoot,{recursive:true,force:true}));const target=new DiskStorage(targetRoot);
 const copy=await copyArchive(storage,target);assert.equal(copy.commits,2);assert.deepEqual((await scanArchive(target)).state,reopened.snapshot.state);
 await assert.rejects(copyArchive(storage,target),/leer/);
});
for(const phase of ['before-write','partial-write','after-close','read'])for(const area of ['objects/','records/'])test(`injected ${phase} at ${area}: previous committed state survives`,async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);
 const old=archive.snapshot.head;const pdf=syntheticPdf(),hash=await sha256(pdf);
 const attachment={id:uid(),hash,size:pdf.length,kind:'pdf',name:'later.pdf',method:'manual',note:'synthetic',revisionId:null};
 let fired=false;storage.fault=(p,path)=>{if(!fired&&p===phase&&path.startsWith(area)){fired=true;return true;}return false;};
 await assert.rejects(archive.commit([{type:'attachment.add',assessmentId:s.assessment.id,attachment}],new Map([[hash,pdf]])));
 assert.equal(fired,true);assert.equal(archive.snapshot.readOnly,true);storage.fault=null;
 const result=await scanArchive(storage);assert.ok(result.state.assessments[s.assessment.id]);assert.equal(result.state.assessments[s.assessment.id].patientId,s.patient.id);
 // A successfully closed commit may be present after an uncertain error; reopening reveals it rather than retrying blindly.
 assert.ok(result.head===old||result.state.assessments[s.assessment.id].attachments.length===1);
});
test('corrupt / missing originals reject entire affected commit and retain earlier state',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);
 const pdf=syntheticPdf(),hash=await sha256(pdf),a={id:uid(),hash,size:pdf.length,kind:'pdf',name:'x.pdf',method:'manual',note:'test',revisionId:null};
 await archive.commit([{type:'attachment.add',assessmentId:s.assessment.id,attachment:a}],new Map([[hash,pdf]]));
 await writeFile(storage.path(objectPath(a)),'corrupt');let result=await scanArchive(storage);assert.equal(result.readOnly,true);assert.equal(result.state.assessments[s.assessment.id].attachments.length,0);assert.equal(result.records.length,1);
 await rm(storage.path(objectPath(a)));result=await scanArchive(storage);assert.equal(result.records.length,1);assert.equal(result.readOnly,true);
});
test('malformed, unknown-version and forked commits never silently win',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);
 const make=async(type,parent=archive.snapshot.head)=>{const p={...archive.snapshot.records[0].payload,id:uid(),parent,operations:[{type,assessmentId:s.assessment.id,patientId:null,reason:'synthetic'}]};return seal(p);};
 const unknown=await make('future.operation');await storage.writeNew(`records/${unknown.payload.id}.json`,new TextEncoder().encode(JSON.stringify(unknown)));assert.equal((await scanArchive(storage)).records.length,1);assert.equal((await scanArchive(storage)).readOnly,true);
 await rm(storage.path(`records/${unknown.payload.id}.json`));
 for(let i=0;i<2;i++){const rec=await make('patient.link');await storage.writeNew(`records/${rec.payload.id}.json`,new TextEncoder().encode(JSON.stringify(rec)));}
 const fork=await scanArchive(storage);assert.equal(fork.records.length,1);assert.equal(fork.readOnly,true);assert.ok(fork.issues.some(x=>x.message.includes('Verzweigte')));
});
test('unknown manifest version / unrelated folder do not get initialized or overwritten',async t=>{
 const {storage}=await setup(t);const manifest=JSON.parse(await readFile(storage.path('archive.json'),'utf8'));manifest.schemaVersion=99;await writeFile(storage.path('archive.json'),JSON.stringify(manifest));
 await assert.rejects(Archive.open(storage),/nicht unterstützt/);await assert.rejects(createArchive(storage),/leer/);assert.equal(JSON.parse(await readFile(storage.path('archive.json'),'utf8')).schemaVersion,99);
});
test('patient reassignment, stay correction and revision selection survive reopen with full history',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);
 const p={id:uid(),identifier:'00999',label:'SYNTHETIC CORRECTION'};
 await archive.commit([{type:'patient.create',patient:p},{type:'patient.link',assessmentId:s.assessment.id,patientId:p.id,reason:'Explicit synthetic correction'},{type:'stay.update',assessmentId:s.assessment.id,stayId:'000999',reason:'Synthetic stay correction'}]);
 const reopened=await scanArchive(storage);assert.equal(reopened.state.assessments[s.assessment.id].patientId,p.id);assert.equal(reopened.state.assessments[s.assessment.id].stayId,'000999');assert.equal(reopened.state.history.length,2);assert.equal(reopened.state.history[0].operations[1].assessment.patientId,s.patient.id);
});
test('stale writer and disconnected share fail closed without overwriting commits',async t=>{
 const {storage,archive}=await setup(t);const stale=await Archive.open(storage);const s=await sampleOperations();await archive.commit(s.operations,s.files);
 await assert.rejects(stale.commit([{type:'patient.create',patient:{id:uid(),identifier:'777',label:''}}]),/geändert/);
 storage.fault=(p)=>p==='list';await assert.rejects(archive.commit([{type:'patient.link',assessmentId:s.assessment.id,patientId:null,reason:'test'}]));storage.fault=null;assert.equal((await scanArchive(storage)).records.length,1);
});
test('synthetic capability probe removes only its own file',async t=>{
 const {storage}=await setup(t);await probeFolder(storage);assert.deepEqual((await storage.list()).map(x=>x.name),['archive.json']);
});
