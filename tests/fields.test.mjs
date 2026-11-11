import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Archive,seal } from '../src/archive.js';
import { createArchive } from '../src/storage.js';
import { selectedRevision } from '../src/model.js';
import { inspectFiles,buildPatientImport } from '../src/import.js';
import { PROJECTION_VERSION } from '../src/projection.js';
import { archiveFields,hasSourceMeasure,fieldLabel,performanceFields,hasPerformanceValue,isPerformanceField,isNumericSourceValue,performanceContext } from '../src/summary.js';
import { DiskStorage,makeFile } from './support.mjs';
const draft={identifier:'0001',stayId:'0002',assessmentTypeId:'memory-clinic',actor:'TEST'};
const source=(session='field_session')=>new TextEncoder().encode(`session_uuid;future_metric;future_notes;empty_field;missing_field\n"${session}";"0";"SYNTHETIC private long note";"";`);
async function setup(t){const root=await mkdtemp(join(tmpdir(),'npt-field-catalogue-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);const archive=await Archive.open(storage,{compact:true});return{storage,archive};}
async function save(archive,files,d=draft){const rows=await inspectFiles(files,archive.snapshot.state,[]);const built=buildPatientImport(rows,archive.snapshot.state,d);await archive.commit(built.operations,built.files,built.actor);return rows;}

test('every observed field, including unknown/text/empty columns, is available from a warm compact index',async t=>{
 const {storage,archive}=await setup(t);const rows=await save(archive,[makeFile('visit.csv',source())]);
 const reopened=await Archive.open(storage,{compact:true});assert.equal(reopened.snapshot.metrics.sourceRecordsRead,0);
 const assessments=Object.values(reopened.snapshot.state.assessments),doc=selectedRevision(assessments[0]).document;
 assert.deepEqual(archiveFields(assessments),[...rows[0].document.headers].sort((a,b)=>a.localeCompare(b,'de')));
 assert.equal(doc.raw.future_notes,undefined,'Free text stays in the source, not the compact index');assert.equal(hasSourceMeasure(doc,'future_notes'),true);assert.equal(hasSourceMeasure(doc,'future_metric'),true);assert.equal(hasSourceMeasure(doc,'empty_field'),false);assert.equal(hasSourceMeasure(doc,'missing_field'),false);
 assert.equal(fieldLabel('future_notes'),'future_notes');assert.match(fieldLabel('tmt_a_s'),/TMT A/);
});

test('field choices span historical versions and excluded examinations; filtering uses the selected version',async t=>{
 const {archive}=await setup(t);await save(archive,[makeFile('visit.csv',source())]);const a=Object.values(archive.snapshot.state.assessments)[0],patient=archive.snapshot.state.patients[a.patientId];
 const revised=new TextEncoder().encode('session_uuid;new_source_field\n"field_session";"12"');const rows=await inspectFiles([makeFile('visit.csv',revised)],archive.snapshot.state,[],async()=>selectedRevision(await archive.assessmentDetail(a.id)).document);Object.assign(rows[0],{action:'keep',note:'Synthetic source version review'});const built=buildPatientImport(rows,archive.snapshot.state,{...draft,confirmedPatientId:patient.id});await archive.commit(built.operations,built.files,built.actor);
 let current=archive.snapshot.state.assessments[a.id];assert.ok(archiveFields([current]).includes('new_source_field'));assert.equal(hasSourceMeasure(selectedRevision(current).document,'new_source_field'),false);assert.equal(hasSourceMeasure(selectedRevision(current).document,'future_metric'),true);
 await archive.commit([{type:'revision.select',assessmentId:a.id,revisionId:current.revisions[1].id},{type:'assessment.exclusion.set',assessmentId:a.id,excluded:true}]);current=archive.snapshot.state.assessments[a.id];assert.equal(hasSourceMeasure(selectedRevision(current).document,'new_source_field'),true);assert.equal(hasSourceMeasure(selectedRevision(current).document,'future_metric'),false);assert.ok(archiveFields([current]).includes('future_notes'));
});

test('identical header layouts share a record dictionary; cached JSON never duplicates the runtime reference',async t=>{
 const {storage,archive}=await setup(t);await save(archive,[makeFile('a.csv',source('session_a')),makeFile('b.csv',source('session_b'))]);
 const record=archive.snapshot.records[0],docs=record.payload.operations.filter(o=>o.type==='revision.add').map(o=>o.revision.document);assert.equal(record.fieldLayouts.length,1);assert.equal(docs[0].sourceFields,docs[1].sourceFields);
 const persisted=await readFile(storage.path(record.cachePath),'utf8');assert.equal(persisted.includes('"sourceFields"'),false);assert.equal(persisted.includes('SYNTHETIC private long note'),false);assert.equal(JSON.parse(persisted).payload.version,PROJECTION_VERSION);
});

test('invalid or outdated field inventories rebuild from source; deleting indexes cannot lose future field choices',async t=>{
 const {storage,archive}=await setup(t);await save(archive,[makeFile('visit.csv',source())]);const path=archive.snapshot.records[0].cachePath;
 const envelope=JSON.parse(await readFile(storage.path(path),'utf8'));envelope.payload.record.payload.operations.find(o=>o.type==='revision.add').revision.document.presentFieldIndices.push(9999);await writeFile(storage.path(path),JSON.stringify(await seal(envelope.payload)));
 let reopened=await Archive.open(storage,{compact:true});assert.equal(reopened.snapshot.readOnly,false);assert.equal(reopened.snapshot.metrics.sourceRecordsRead,1);assert.ok(archiveFields(Object.values(reopened.snapshot.state.assessments)).includes('future_notes'));
 const old=JSON.parse(await readFile(storage.path(path),'utf8'));old.payload.version=1;await writeFile(storage.path(path),JSON.stringify(await seal(old.payload)));reopened=await Archive.open(storage,{compact:true});assert.equal(reopened.snapshot.metrics.sourceRecordsRead,1);
 await rm(storage.path('indexes'),{recursive:true});reopened=await Archive.open(storage,{compact:true});assert.equal(hasSourceMeasure(selectedRevision(Object.values(reopened.snapshot.state.assessments)[0]).document,'future_metric'),true);
});


test('numeric performance choices accept raw numeric forms and exclude notes, demographics and administration flags',()=>{
 for(const value of ['0','-2','+3','1.2300000000000000001','0,25','.5','1e-3','-0'])assert.equal(isNumericSourceValue(value),true,value);
 for(const value of ['',null,'NaN','Infinity','1e999','1,000.5','12 seconds',' 12 ','=1+1'])assert.equal(isNumericSourceValue(value),false,String(value));
 for(const key of ['session_uuid','sessionUUID','assessment_session_uuid','demographics_patient_age','testing_start_time','future_notes','stroop_notes_woerter','notes','future_comment','moca_education_correction','gds_answered_count','rey_copy_scored_count','qolie31_health_answered','qolie31_overall_partial','tmt_aborted','phq9_completed','future_version','future_patient_id','phq9_entry_mode'])assert.equal(isPerformanceField(key),false,key);
 for(const key of ['stroop_interferenz_corrected','future_metric','cerad_mmst_total','gad7_item_a','moca_raw_total','qolie31_item_1_raw','tmt_a_s'])assert.equal(isPerformanceField(key),true,key);
});

test('numeric performance inventory is rebuilt from selected raw sources and warm indexes without storing unknown values',async t=>{
 const {storage,archive}=await setup(t);const data=new TextEncoder().encode('session_uuid;future_metric;future_notes;future_text;demographics_patient_age;future_completed;empty_field;future_decimal;future_precision\n"numeric_session";"0";"123";"text";"42";"1";"";"0,25";"1.00000000000000000001"');
 await save(archive,[makeFile('numeric.csv',data)]);const full=await archive.assessmentDetail(Object.keys(archive.snapshot.state.assessments)[0]),expected=['future_decimal','future_metric','future_precision'];
 assert.deepEqual(performanceFields([full]),expected);assert.equal(selectedRevision(full).document.normalized.future_precision,'1.00000000000000000001','Eligibility never extends clinical normalization');
 let warm=await Archive.open(storage,{compact:true});assert.equal(warm.snapshot.metrics.sourceRecordsRead,0);assert.deepEqual(performanceFields(Object.values(warm.snapshot.state.assessments)),expected);const doc=selectedRevision(Object.values(warm.snapshot.state.assessments)[0]).document;assert.equal(doc.raw.future_metric,undefined);assert.equal(hasPerformanceValue(doc,'future_metric'),true);assert.equal(hasPerformanceValue(doc,'future_notes'),false);
 const record=warm.snapshot.records[0],path=record.cachePath,envelope=JSON.parse(await readFile(storage.path(path),'utf8'));envelope.payload.record.payload.operations.find(op=>op.type==='revision.add').revision.document.numericPerformanceFieldIndices=[9999];await writeFile(storage.path(path),JSON.stringify(await seal(envelope.payload)));
 warm=await Archive.open(storage,{compact:true});assert.equal(warm.snapshot.metrics.sourceRecordsRead,1);assert.deepEqual(performanceFields(Object.values(warm.snapshot.state.assessments)),expected);
});

test('performance choices follow selected revisions and the caller’s patient/type/exclusion scope',async t=>{
 const {archive}=await setup(t);await save(archive,[makeFile('visit.csv',source())]);const a=Object.values(archive.snapshot.state.assessments)[0];
 const rows=await inspectFiles([makeFile('revised.csv',new TextEncoder().encode('session_uuid;new_score\n"field_session";"-5"'))],archive.snapshot.state,[],async()=>selectedRevision(await archive.assessmentDetail(a.id)).document);Object.assign(rows[0],{action:'keep',note:'Synthetic review'});const built=buildPatientImport(rows,archive.snapshot.state,{...draft,confirmedPatientId:a.patientId});await archive.commit(built.operations,built.files,built.actor);
 assert.deepEqual(performanceFields(Object.values(archive.snapshot.state.assessments)),['future_metric']);const current=archive.snapshot.state.assessments[a.id];await archive.commit([{type:'revision.select',assessmentId:a.id,revisionId:current.revisions[1].id},{type:'assessment.exclusion.set',assessmentId:a.id,excluded:true}]);
 assert.deepEqual(performanceFields(Object.values(archive.snapshot.state.assessments)),['new_score']);assert.deepEqual(performanceFields(Object.values(archive.snapshot.state.assessments).filter(a=>!a.excluded)),[]);
 assert.deepEqual(performanceFields([]),[]);
});

test('dynamic comparison context carries exported mode/variant/completion evidence',()=>{
 const raw=Object.fromEntries(Object.entries({cerad_version:'test variant',cerad_tmt_a_entry_mode:'manual',cerad_tmt_a_completed:'0'}).map(([k,raw])=>[k,{raw}]));const hints=performanceContext({raw},'cerad_tmt_a_s').join(' ');assert.match(hints,/test variant/);assert.match(hints,/Manuell eingegeben/);assert.match(hints,/Unvollständig/);
});
