import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile,utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Archive,scanArchive } from '../src/archive.js';
import { createArchive } from '../src/storage.js';
import { scanLibrary } from '../src/library.js';
import { objectPath,selectedRevision } from '../src/model.js';
import { DiskStorage,sampleOperations } from './support.mjs';
import { ASSESSMENT_TYPES,matchesAssessmentType } from '../src/assessment-types.js';
async function setup(t){const root=await mkdtemp(join(tmpdir(),'npt-library-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);const archive=await Archive.open(storage,{compact:true});return {root,storage,archive};}
test('compact library, warm folder index and lazy details preserve source data',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();s.assessment.assessmentTypeId='memory-clinic';await archive.commit(s.operations,s.files);
 const summary=selectedRevision(archive.snapshot.state.assessments[s.assessment.id]).document;
 assert.equal(summary.projected,true);assert.ok(summary.headers.length<388);assert.equal(summary.raw.stroop_notes_woerter,undefined);
 storage.calls=[];const reopened=await Archive.open(storage,{compact:true});assert.equal(reopened.snapshot.metrics.sourceRecordsRead,0);assert.equal(reopened.snapshot.metrics.indexHits,1);assert.equal(reopened.snapshot.metrics.originalsHashed,0);assert.ok(!storage.calls.some(c=>c.phase==='read'&&c.path.startsWith('objects/')));
 const full=await reopened.assessmentDetail(s.assessment.id);assert.deepEqual(selectedRevision(full).document,s.revision.document);assert.equal(full.assessmentTypeId,'memory-clinic');
});
test('deleting or corrupting derived indexes cannot lose patients, types or chosen revisions',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);await archive.commit([{type:'assessment.type.set',assessmentId:s.assessment.id,assessmentTypeId:'suspected-nph',reason:'Synthetic review'}]);
 const head=archive.snapshot.head;for(const rec of archive.snapshot.records)await writeFile(storage.path(rec.cachePath),'{');
 let reopened=await Archive.open(storage,{compact:true});assert.equal(reopened.snapshot.head,head);assert.equal(reopened.snapshot.metrics.sourceRecordsRead,2);assert.equal(reopened.snapshot.state.assessments[s.assessment.id].patientId,s.patient.id);
 await rm(storage.path('indexes'),{recursive:true});reopened=await Archive.open(storage,{compact:true});assert.equal(reopened.snapshot.state.assessments[s.assessment.id].assessmentTypeId,'suspected-nph');
 assert.equal(selectedRevision(reopened.snapshot.state.assessments[s.assessment.id]).id,s.revision.id);
});
test('changed source fingerprint invalidates cache; malformed source and missing records fail closed',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);
 const record=archive.snapshot.records[0],path=`records/${record.payload.id}.json`;await writeFile(storage.path(path),'{}');
 const reopened=await Archive.open(storage,{compact:true});assert.equal(reopened.snapshot.readOnly,true);assert.equal(reopened.snapshot.head,null);
});
test('same-size/same-time changes require full integrity verification, documented cache boundary',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);const original=s.revision.original;
 await writeFile(storage.path(objectPath(original)),new Uint8Array(s.csv.length));const reopened=await Archive.open(storage,{compact:true});
 assert.equal(reopened.snapshot.readOnly,false);await assert.rejects(reopened.assessmentDetail(s.assessment.id),/beschädigt/);await reopened.refresh({deep:true});assert.equal(reopened.snapshot.readOnly,true);
});
test('index write failure does not turn a verified saved assessment into data loss',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();storage.fault=(phase)=>phase==='cache';await archive.commit(s.operations,s.files);
 assert.equal(archive.snapshot.readOnly,false);assert.ok(archive.snapshot.issues.some(i=>i.path==='indexes/'));storage.fault=null;
 assert.equal((await scanArchive(storage)).state.assessments[s.assessment.id].patientId,s.patient.id);
});
test('stale compact writers cannot overwrite a later history event',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);const stale=await Archive.open(storage,{compact:true});
 await archive.commit([{type:'assessment.type.set',assessmentId:s.assessment.id,assessmentTypeId:'cognitive-status',reason:'Synthetic assignment'}]);
 await assert.rejects(stale.commit([{type:'assessment.type.set',assessmentId:s.assessment.id,assessmentTypeId:'memory-clinic',reason:'Stale synthetic review'}]),/geändert/);
});
test('all seven explicit types persist with history and filter legacy unknowns separately',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);
 assert.equal(archive.snapshot.state.assessments[s.assessment.id].assessmentTypeId,null);assert.equal(matchesAssessmentType(archive.snapshot.state.assessments[s.assessment.id],'unassigned'),true);
 for(const type of ASSESSMENT_TYPES)await archive.commit([{type:'assessment.type.set',assessmentId:s.assessment.id,assessmentTypeId:type.id,reason:'Synthetic type review'}]);
 const reopened=await Archive.open(storage,{compact:true});const a=reopened.snapshot.state.assessments[s.assessment.id];assert.equal(a.assessmentTypeId,ASSESSMENT_TYPES.at(-1).id);assert.equal(reopened.snapshot.state.history.length,8);assert.equal(matchesAssessmentType(a,'unassigned'),false);
});
test('full verification and detail access detect a record edit preserving source size and timestamp',async t=>{
 const {storage,archive}=await setup(t);const s=await sampleOperations();await archive.commit(s.operations,s.files);
 const record=archive.snapshot.records[0],path=`records/${record.payload.id}.json`;const data=await storage.read(path);
 const changed=Buffer.from(data).toString().replace('"appVersion":"0.2.0"','"appVersion":"0.2.1"');assert.equal(Buffer.byteLength(changed),data.length);assert.notEqual(changed,Buffer.from(data).toString());
 await writeFile(storage.path(path),changed);const time=new Date(record.source.lastModified);await utimes(storage.path(path),time,time);
 const reopened=await Archive.open(storage,{compact:true});assert.equal(reopened.snapshot.readOnly,false);await assert.rejects(reopened.assessmentDetail(s.assessment.id),/Prüfsumme/);
 await reopened.refresh({deep:true});assert.equal(reopened.snapshot.readOnly,true);
});
