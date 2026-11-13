import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {emptyClinical,clinicalFromInputs,clinicalForNewAssessment,clinicalOf,parseAgeRange,ageAtAssessment,matchesClinicalFilters} from '../src/clinical.js';
import {applyOperations,emptyState,selectedRevision,objectPath} from '../src/model.js';
import {buildPatientImport,inspectFiles} from '../src/import.js';
import {Archive,copyArchive} from '../src/archive.js';
import {createArchive} from '../src/storage.js';
import {exportArchiveCsv} from '../src/export.js';
import {parseTable} from '../src/csv.js';
import {sampleOperations,DiskStorage,fixture,makeFile,syntheticPdf} from './support.mjs';

const clinical={diagnosis:'SYNTHETIC Diagnose ü',diagnosisStatus:'suspected',dementiaType:'SYNTHETIC Typ',affectedHemisphere:null};
const draft={identifier:'000123',stayId:'0000456',assessmentTypeId:'memory-clinic',actor:'TEST',clinical};
const op=(id,value)=>({type:'assessment.clinical.set',assessmentId:id,clinical:value});
const sourceAge=(value,missing=false)=>({raw:{demographics_patient_age:{raw:value,missing,quoted:true}}});
async function setup(t,compact=true){const root=await mkdtemp(join(tmpdir(),'npt-clinical-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);return{root,storage,archive:await Archive.open(storage,{compact})};}

test('legacy examinations have unrecorded clinical fields; explicit updates and clearing retain immutable history',async()=>{
 const s=await sampleOperations(),before=applyOperations(emptyState(),s.operations),id=s.assessment.id;
 assert.deepEqual(clinicalOf(before.assessments[id]),emptyClinical());
 const updated=applyOperations(before,[op(id,clinical)]);assert.deepEqual(updated.assessments[id].clinical,clinical);assert.deepEqual(before.assessments[id].clinical,emptyClinical());
 const cleared=applyOperations(updated,[op(id,emptyClinical())]);assert.deepEqual(cleared.assessments[id].clinical,emptyClinical());assert.deepEqual(cleared.history[1].operations[0].clinical,clinical);assert.deepEqual(selectedRevision(cleared.assessments[id]).document.raw,s.revision.document.raw);
});

test('clinical validation accepts explicit unknown status but rejects malformed, unsupported and oversized annotations',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),s.operations);
 for(const invalid of [null,{},[],{...clinical,diagnosis:123},{...clinical,diagnosis:' '},{...clinical,diagnosis:'x'.repeat(2001)},{...clinical,dementiaType:'x'.repeat(201)},{...clinical,diagnosis:'bad\u0000text'},{...clinical,diagnosisStatus:'maybe'},{...clinical,affectedHemisphere:'guess'},{...clinical,future:'must use a compatible app'}])assert.throws(()=>applyOperations(state,[op(s.assessment.id,invalid)]),/ungültig/);
 assert.deepEqual(clinicalFromInputs({diagnosis:'',diagnosisStatus:'',dementiaType:'  ',affectedHemisphere:''}),emptyClinical());
 assert.equal(clinicalFromInputs({...clinical,diagnosisStatus:null}).diagnosisStatus,null);
});

test('conditional import annotations apply only to newly created assessments without altering source cells',async()=>{
 for(const type of ['memory-clinic','epilepsy-localisation','epilepsy-medication-screening','general-neurology']){
   const rows=await inspectFiles([makeFile('visit.csv',await fixture())],emptyState(),[]),original=structuredClone(rows[0].document),input={...clinical,affectedHemisphere:'left'};
   const built=buildPatientImport(rows,emptyState(),{...draft,assessmentTypeId:type,clinical:input}),state=applyOperations(emptyState(),built.operations),a=Object.values(state.assessments)[0];
   assert.deepEqual(a.clinical,clinicalForNewAssessment(input,type));assert.equal(a.clinical.dementiaType,type==='memory-clinic'?input.dementiaType:null);assert.equal(a.clinical.affectedHemisphere,type.startsWith('epilepsy-')?'left':null);
   assert.deepEqual(selectedRevision(a).document,original);assert.deepEqual(rows[0].document,original);
 }
 const rows=await inspectFiles([makeFile('visit.csv',await fixture())],emptyState(),[]),built=buildPatientImport(rows,emptyState(),{...draft,clinical:undefined});assert.deepEqual(Object.values(applyOperations(emptyState(),built.operations).assessments)[0].clinical,emptyClinical());
});

test('CSV revisions and PDF-only imports preserve existing clinical metadata; explicit separate examinations get new annotations',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),[...s.operations,op(s.assessment.id,clinical)]),nextClinical={...clinical,diagnosis:'SYNTHETIC new annotation'};
 const rows=await inspectFiles([makeFile('revised.csv',await fixture('revised-same-session.csv'))],state,[]);Object.assign(rows[0],{action:'select',note:'Synthetic source review'});
 const built=buildPatientImport(rows,state,{...draft,confirmedPatientId:s.patient.id,clinical:nextClinical});assert.ok(!built.operations.some(o=>o.type==='assessment.clinical.set'));const next=applyOperations(state,built.operations);assert.deepEqual(next.assessments[s.assessment.id].clinical,clinical);
 const pdfs=await inspectFiles([makeFile('synthetic.pdf',syntheticPdf())],next,[]),pdfImport=buildPatientImport(pdfs,next,{...draft,confirmedPatientId:s.patient.id,clinical:nextClinical});assert.ok(!pdfImport.operations.some(o=>o.type==='assessment.clinical.set'));assert.deepEqual(applyOperations(next,pdfImport.operations).assessments[s.assessment.id].clinical,clinical);
 rows[0].action='separate';const separate=applyOperations(state,buildPatientImport(rows,state,{...draft,confirmedPatientId:s.patient.id,clinical:nextClinical}).operations);assert.deepEqual(Object.values(separate.assessments).find(a=>a.id!==s.assessment.id).clinical,nextClinical);
});

for(const compact of [true,false])test(`annotations survive cold/warm folder reopen, cache deletion, source replay and verified backup (compact=${compact})`,async t=>{
 const {root,storage,archive}=await setup(t,compact),s=await sampleOperations();await archive.commit(s.operations,s.files,'TEST');await archive.commit([op(s.assessment.id,clinical)],new Map(),'EDIT');
 const originalPath=objectPath(s.revision.original),original=await readFile(storage.path(originalPath));
 const beforeType=await archive.assessmentDetail(s.assessment.id);assert.deepEqual(beforeType.clinical,clinical);
 await archive.commit([{type:'assessment.type.set',assessmentId:s.assessment.id,assessmentTypeId:'general-neurology',reason:'Synthetic type correction'}]);
 for(let index=0;index<2;index++){const reopened=await Archive.open(new DiskStorage(root),{compact:true});assert.equal(reopened.snapshot.readOnly,false);assert.deepEqual(reopened.snapshot.state.assessments[s.assessment.id].clinical,clinical);assert.deepEqual((await reopened.assessmentDetail(s.assessment.id)).clinical,clinical);}
 await rm(join(root,'indexes'),{recursive:true,force:true});const cold=await Archive.open(storage,{compact:true});await cold.rebuildIndex();assert.deepEqual(cold.snapshot.state.assessments[s.assessment.id].clinical,clinical);
 const targetRoot=await mkdtemp(join(tmpdir(),'npt-clinical-copy-'));t.after(()=>rm(targetRoot,{recursive:true,force:true}));const target=new DiskStorage(targetRoot);await copyArchive(storage,target);
 const restored=await Archive.open(target);assert.equal(restored.snapshot.readOnly,false);assert.deepEqual(restored.snapshot.state.assessments[s.assessment.id].clinical,clinical);assert.equal(restored.snapshot.state.history.find(h=>h.actor==='EDIT').operations[0].type,'assessment.clinical.set');assert.deepEqual(await readFile(storage.path(originalPath)),original);
 await restored.commit([op(s.assessment.id,emptyClinical())]);assert.deepEqual((await Archive.open(target,{compact:true})).snapshot.state.assessments[s.assessment.id].clinical,emptyClinical());
});

test('invalid annotations fail transaction preflight before any objects or records are written',async t=>{
 const {storage,archive}=await setup(t),s=await sampleOperations();storage.calls=[];
 await assert.rejects(archive.commit([...s.operations,op(s.assessment.id,{...clinical,diagnosisStatus:'unsupported'})],s.files,'TEST'),/ungültig/);
 assert.equal(storage.calls.some(call=>['before-write','after-close'].includes(call.phase)),false);
});

test('age filters use selected raw age, inclusive ranges and explicit bounds without treating blanks as zero',()=>{
 const assessment={clinical},matches=(value,age)=>matchesClinicalFilters(assessment,sourceAge(String(value)),{age});
 for(const range of ['18-65','18 – 65','>=65','≥65','65+','<=65','≤65','65','=65'])assert.equal(matches(65,range),true,range);
 assert.equal(matches(65,'>65'),false);assert.equal(matches(65,'<65'),false);assert.equal(matches('65,5','65-66'),true);assert.equal(matches('0','0-18'),true);assert.equal(matches('66','18-65'),false);
 for(const raw of ['', ' ', '-1','65 Jahre','NaN','Infinity','1e2'])assert.equal(ageAtAssessment(sourceAge(raw)),null,raw);
 for(const doc of [null,{raw:{}},sourceAge('0',true),sourceAge('')])assert.equal(matchesClinicalFilters(assessment,doc,{age:'0-18'}),false);
 assert.equal(matchesClinicalFilters(assessment,null,{}),true);
 for(const range of ['65-18','abc','18-','-18','>=65+','1e2','18,65,70','18/65']){assert.equal(parseAgeRange(range).valid,false,range);assert.equal(matches(65,range),false);}
 assert.equal(matchesClinicalFilters(assessment,sourceAge('65'),{diagnosis:'diagnose Ü',diagnosisStatus:'suspected',dementiaType:'typ',age:'60-70'}),true);
 assert.equal(matchesClinicalFilters(assessment,sourceAge('65'),{diagnosisStatus:'confirmed'}),false);assert.equal(matchesClinicalFilters(assessment,sourceAge('65'),{affectedHemisphere:'left'}),false);
 assert.equal(matchesClinicalFilters({clinical:{...clinical,affectedHemisphere:'bilateral'}},sourceAge('65'),{affectedHemisphere:'bilateral'}),true);
});

test('CSV export includes latest annotations separately, escaping formula text and preserving original fields',async t=>{
 const {archive}=await setup(t),s=await sampleOperations();await archive.commit(s.operations,s.files,'TEST');await archive.commit([op(s.assessment.id,{...clinical,diagnosis:'=SYNTHETIC FORMULA',affectedHemisphere:'unclear'})],new Map(),'EDIT');
 const result=await exportArchiveCsv(archive,'patients',[s.patient.id]),[headers,cells]=parseTable(result.chunks.join('')),row=Object.fromEntries(headers.map((h,i)=>[h.raw,cells[i]]));
 assert.equal(row['archive.diagnosis'].raw,"'=SYNTHETIC FORMULA");assert.equal(row['archive.diagnosis_status'].raw,'suspected');assert.equal(row['archive.dementia_type'].raw,clinical.dementiaType);assert.equal(row['archive.affected_hemisphere'].raw,'unclear');assert.ok(JSON.parse(row['archive.escaped_fields'].raw).includes('archive.diagnosis'));
 assert.equal(row.demographics_patient_age.raw,s.revision.document.raw.demographics_patient_age.raw);assert.equal(row['archive.import_actor'].raw,'TEST');assert.equal(row['archive.parser_version'].raw,s.revision.document.parserVersion);
});

test('age filtering follows selected revisions in both compact and verified full views',async t=>{
 const {storage,archive}=await setup(t),s=await sampleOperations();await archive.commit(s.operations,s.files,'TEST');
 const original=selectedRevision(await archive.assessmentDetail(s.assessment.id)).document,age=ageAtAssessment(original);assert.notEqual(age,null);
 const data=new TextEncoder().encode(`session_uuid;demographics_patient_age;future_score\n"${s.assessment.sessionId}";"${age+20}";"0"`),rows=await inspectFiles([makeFile('revised.csv',data)],archive.snapshot.state,[],async()=>original);Object.assign(rows[0],{action:'select',note:'SYNTHETIC revised exported age'});
 const built=buildPatientImport(rows,archive.snapshot.state,{...draft,confirmedPatientId:s.patient.id});await archive.commit(built.operations,built.files,'TEST');
 const reopened=await Archive.open(storage,{compact:true}),a=reopened.snapshot.state.assessments[s.assessment.id],full=await reopened.assessmentDetail(a.id);
 for(const assessment of [a,full]){assert.equal(matchesClinicalFilters(assessment,selectedRevision(assessment).document,{age:String(age+20)}),true);assert.equal(matchesClinicalFilters(assessment,selectedRevision(assessment).document,{age:String(age)}),false);}
 await reopened.commit([{type:'revision.select',assessmentId:a.id,revisionId:a.revisions[0].id}]);assert.equal(matchesClinicalFilters(reopened.snapshot.state.assessments[a.id],selectedRevision(reopened.snapshot.state.assessments[a.id]).document,{age:String(age)}),true);
});
