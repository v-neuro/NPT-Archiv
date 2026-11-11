import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Archive,copyArchive,scanArchive } from '../src/archive.js';
import { createArchive } from '../src/storage.js';
import { applyOperations,emptyState,isExcluded,matchesArchiveStatus,objectPath,selectedRevision } from '../src/model.js';
import { inspectFiles,buildPatientImport,planPatientImport } from '../src/import.js';
import { DiskStorage,sampleOperations,fixture,makeFile,syntheticPdf } from './support.mjs';
import { hasSourceMeasure } from '../src/summary.js';

test('legacy examinations default to included; status changes are explicit, reversible and reject invalid values',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),s.operations),id=s.assessment.id;
 assert.equal(state.assessments[id].excluded,false);assert.equal(matchesArchiveStatus(state.assessments[id]),true);
 const excluded=applyOperations(state,[{type:'assessment.exclusion.set',assessmentId:id,excluded:true}]);
 assert.equal(isExcluded(excluded.assessments[id]),true);assert.equal(isExcluded(state.assessments[id]),false);
 assert.equal(matchesArchiveStatus(excluded.assessments[id],'included'),false);assert.equal(matchesArchiveStatus(excluded.assessments[id],'excluded'),true);assert.equal(matchesArchiveStatus(excluded.assessments[id],'all'),true);
 for(const bad of ['true',1,null,undefined])assert.throws(()=>applyOperations(state,[{type:'assessment.exclusion.set',assessmentId:id,excluded:bad}]),/ungültig/);
 const included=applyOperations(excluded,[{type:'assessment.exclusion.set',assessmentId:id,excluded:false}]);assert.equal(isExcluded(included.assessments[id]),false);assert.equal(included.history.length,3);
 assert.deepEqual(included.assessments[id].revisions,state.assessments[id].revisions);
});

test('exclusion survives warm indexes, index deletion, full replay, backup and restoration without deleting originals',async t=>{
 const root=await mkdtemp(join(tmpdir(),'npt-exclusion-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(join(root,'source'));await mkdir(storage.root);await createArchive(storage);const archive=await Archive.open(storage,{compact:true});
 const rows=await inspectFiles([makeFile('visit.csv',await fixture()),makeFile('visit.pdf',syntheticPdf(false))],emptyState(),[]);const built=buildPatientImport(rows,emptyState(),{identifier:'00012',stayId:'00045',assessmentTypeId:'memory-clinic',actor:'TEST'});await archive.commit(built.operations,built.files,built.actor);
 const initial=Object.values(archive.snapshot.state.assessments)[0],id=initial.id;const originals=[initial.revisions[0].original,...initial.attachments];const originalBytes=await Promise.all(originals.map(o=>readFile(storage.path(objectPath(o)))));
 await archive.commit([{type:'assessment.exclusion.set',assessmentId:id,excluded:true}]);
 let reopened=await Archive.open(new DiskStorage(storage.root),{compact:true});assert.equal(reopened.snapshot.metrics.sourceRecordsRead,0);assert.equal(isExcluded(reopened.snapshot.state.assessments[id]),true);
 const full=await reopened.assessmentDetail(id);assert.deepEqual(selectedRevision(full).document.raw,rows[0].document.raw);assert.equal(full.patientId,initial.patientId);assert.equal(full.stayId,'00045');assert.equal(full.attachments.length,1);
 await rm(storage.path('indexes'),{recursive:true});reopened=await Archive.open(storage,{compact:true});assert.equal(isExcluded(reopened.snapshot.state.assessments[id]),true);assert.equal(isExcluded((await scanArchive(storage)).state.assessments[id]),true);
 const target=new DiskStorage(join(root,'backup'));await mkdir(target.root);await copyArchive(storage,target);const restored=await Archive.open(target,{compact:true});assert.equal(isExcluded(restored.snapshot.state.assessments[id]),true);
 await restored.commit([{type:'assessment.exclusion.set',assessmentId:id,excluded:false}]);const reincluded=await Archive.open(target,{compact:true});assert.equal(isExcluded(reincluded.snapshot.state.assessments[id]),false);assert.deepEqual(reincluded.snapshot.state.history.flatMap(h=>h.operations).filter(o=>o.type==='assessment.exclusion.set').map(o=>o.excluded),[true,false]);
 for(let i=0;i<originals.length;i++){assert.deepEqual(await readFile(storage.path(objectPath(originals[i]))),originalBytes[i]);assert.deepEqual(await readFile(target.path(objectPath(originals[i]))),originalBytes[i]);}
});

test('duplicates and revised sources never implicitly include an excluded examination again',async()=>{
 const s=await sampleOperations();const state=applyOperations(emptyState(),[...s.operations,{type:'assessment.exclusion.set',assessmentId:s.assessment.id,excluded:true}]);const draft={identifier:s.patient.identifier,stayId:s.assessment.stayId,assessmentTypeId:'general-neurology',confirmedPatientId:s.patient.id,actor:'TEST'};
 const duplicate=await inspectFiles([makeFile('synthetic.csv',s.csv)],state,[]);assert.equal(planPatientImport(duplicate,state,draft).previous[0].excluded,true);assert.throws(()=>buildPatientImport(duplicate,state,draft),/Keine neuen Dateien/);
 const revision=await inspectFiles([makeFile('updated.csv',await fixture('revised-same-session.csv'))],state,[]);Object.assign(revision[0],{action:'select',note:'Synthetic revision review'});const next=applyOperations(state,buildPatientImport(revision,state,draft).operations);assert.equal(isExcluded(next.assessments[s.assessment.id]),true);assert.equal(next.assessments[s.assessment.id].revisions.length,2);
});

test('field-presence filtering preserves exported zero without implying completion',()=>{
 const document={raw:{phq9_total:{raw:'0',missing:false},phq9_completed:{raw:'0',missing:false},tmt_a_s:{raw:'',missing:false},tmt_b_s:{raw:'',missing:true},gad7_total:{raw:'unrecognized source value',missing:false}}};
 assert.equal(hasSourceMeasure(document,'phq9_total'),true);assert.equal(hasSourceMeasure(document,'tmt_a_s'),false);assert.equal(hasSourceMeasure(document,'tmt_b_s'),false);assert.equal(hasSourceMeasure(document,'not_exported'),false);assert.equal(hasSourceMeasure(document,'gad7_total'),true);
});
