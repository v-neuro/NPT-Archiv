import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Archive } from '../src/archive.js';
import { createArchive } from '../src/storage.js';
import { saveOutcome } from '../src/save-status.js';
import { importReceipt,recheckConnection } from '../src/workflow.js';
import { inspectFiles,buildPatientImport,planPatientImport } from '../src/import.js';
import { objectPath } from '../src/model.js';
import { DiskStorage,sampleOperations,makeFile,fixture } from './support.mjs';
import { isPerformanceField } from '../src/summary.js';
import { measurementGroup,measurementLabel,groupedMeasurementFields } from '../src/measurement-labels.js';
import { readFile } from 'node:fs/promises';
async function setup(t,compact=true){const root=await mkdtemp(join(tmpdir(),'npt-workflow-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);const archive=await Archive.open(storage,{compact});return{storage,archive};}
for(const compact of [true,false]){
 test(`save evidence distinguishes pre-commit failure and uncertain record write (compact=${compact})`,async t=>{
  const {storage,archive}=await setup(t,compact),sample=await sampleOperations();storage.fault=(phase,path)=>phase==='before-write'&&path.startsWith('objects/');await assert.rejects(archive.commit(sample.operations,sample.files));assert.equal(archive.lastAttempt.outcome,'not-saved');assert.equal(archive.lastAttempt.recordWriteStarted,false);storage.fault=null;const result=await recheckConnection(archive,archive.lastAttempt);assert.equal(result.outcome,'not-saved');assert.equal(result.archive.snapshot.readOnly,false);
  storage.fault=(phase,path)=>phase==='before-write'&&path.startsWith('records/');await assert.rejects(result.archive.commit(sample.operations,sample.files));assert.equal(result.archive.lastAttempt.outcome,'uncertain');storage.fault=null;const checked=await recheckConnection(result.archive,result.archive.lastAttempt);assert.equal(checked.outcome,'not-saved');assert.equal(Object.keys(checked.archive.snapshot.state.assessments).length,0);
 });
 test(`save completed before close acknowledgement is recovered once, without replay (compact=${compact})`,async t=>{
  const {storage,archive}=await setup(t,compact),sample=await sampleOperations();storage.fault=(phase,path)=>phase==='after-close'&&path.startsWith('records/');await assert.rejects(archive.commit(sample.operations,sample.files));const attempt=archive.lastAttempt;assert.equal(attempt.outcome,'uncertain');assert.equal(attempt.recordWriteStarted,true);storage.fault=null;storage.calls=[];
  const result=await recheckConnection(archive,attempt);assert.equal(result.outcome,'saved');assert.equal(result.archive.snapshot.records.length,1);assert.equal(result.archive.snapshot.state.assessments[sample.assessment.id].patientId,sample.patient.id);assert.ok(!storage.calls.some(call=>['before-write','cache'].includes(call.phase)),'Connection recheck is read-only');
  await result.archive.commit([{type:'assessment.exclusion.set',assessmentId:sample.assessment.id,excluded:true}]);const later=await recheckConnection(result.archive,attempt);assert.equal(later.outcome,'saved','A later valid commit does not erase evidence of the attempted save');assert.equal(later.archive.snapshot.records.length,2);
 });
}
test('truncated record or corrupt original cannot be declared saved after reconnect',async t=>{
 const {storage,archive}=await setup(t),sample=await sampleOperations();storage.fault=(phase,path)=>phase==='partial-write'&&path.startsWith('records/');await assert.rejects(archive.commit(sample.operations,sample.files));storage.fault=null;const result=await recheckConnection(archive,archive.lastAttempt);assert.equal(result.outcome,'uncertain');assert.equal(result.archive.snapshot.readOnly,true);
 await rm(storage.path('records/'+archive.lastAttempt.recordId+'.json'));const clean=await Archive.open(storage,{compact:true});await clean.commit(sample.operations,sample.files);const attempt=clean.lastAttempt;assert.equal(attempt.outcome,'saved');await writeFile(storage.path(objectPath(sample.revision.original)),'SYNTHETIC corrupt');assert.equal((await recheckConnection(clean,attempt)).outcome,'uncertain');
});
test('reconnect rejects a different archive and refuses to infer failure from a rolled-back parent',async t=>{
 const {archive,storage}=await setup(t),sample=await sampleOperations();await archive.commit(sample.operations,sample.files);const attempt={...archive.lastAttempt};attempt.parent='f'.repeat(64);attempt.recordId='missing';assert.equal(saveOutcome(archive.snapshot,attempt),'uncertain');
 const other=await setup(t);const substituted=new Archive(other.storage,archive.snapshot);await assert.rejects(recheckConnection(substituted,archive.lastAttempt),/anderen Bibliothek/);
 storage.fault=phase=>phase==='list';await assert.rejects(recheckConnection(archive,archive.lastAttempt));assert.equal(archive.lastAttempt.outcome,'saved','Loss of access does not rewrite previous verified evidence');
});
test('receipt counts saved revisions, links and skipped duplicates without counting newly created patients as examinations',async t=>{
 const {archive}=await setup(t);const csv=await fixture(),draft={identifier:'00012',stayId:'00034',assessmentTypeId:'general-neurology',actor:'SYNTH'};const rows=await inspectFiles([makeFile('a.csv',csv),makeFile('duplicate.csv',csv)],archive.snapshot.state,[]),plan=planPatientImport(rows,archive.snapshot.state,draft),built=buildPatientImport(rows,archive.snapshot.state,draft),receipt=importReceipt(built,plan,draft);
 assert.equal(receipt.identifier,'00012');assert.equal(receipt.stayId,'00034');assert.equal(receipt.csvCount,1);assert.equal(receipt.pdfCount,0);assert.equal(receipt.newCount,1);assert.equal(receipt.skippedCount,1);assert.equal(receipt.assessmentIds.length,1);await archive.commit(built.operations,built.files,built.actor);assert.ok(archive.snapshot.state.assessments[receipt.assessmentIds[0]]);
});
test('friendly labels cover every eligible handed-over producer field, retain keys and group unknowns without inventing meanings',async()=>{
 const {columns}=JSON.parse(await readFile(new URL('../src/export-columns.json',import.meta.url)));const eligible=columns.filter(isPerformanceField);for(const key of eligible){const label=measurementLabel(key);assert.ok(label.endsWith(key),key);assert.notEqual(label,key,'Known numeric producer field needs a readable label: '+key);}
 const groups=groupedMeasurementFields(['future_metric','tmt_a_s','tmt_b_s','vlmt_dg5_hits','qolie31_item_10_score','qolie31_item_2_score']);assert.deepEqual(groups.flatMap(group=>group.fields).sort(),['future_metric','tmt_a_s','tmt_b_s','vlmt_dg5_hits','qolie31_item_10_score','qolie31_item_2_score'].sort());assert.equal(groups.at(-1).label,'Weitere Felder');assert.equal(measurementLabel('future_metric'),'future_metric');assert.equal(measurementGroup('cerad_tmt_a_s'),'CERAD');assert.equal(measurementGroup('rey_copy_total'),'Rey/Taylor · Kopie');assert.deepEqual(groups.find(g=>g.label==='QOLIE-31').fields,['qolie31_item_2_score','qolie31_item_10_score']);
});
