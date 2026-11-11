import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile,writeFile,utimes } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Archive,seal } from '../src/archive.js';
import { createArchive } from '../src/storage.js';
import { selectedRevision,objectPath } from '../src/model.js';
import { inspectFiles,buildPatientImport } from '../src/import.js';
import { parseTable } from '../src/csv.js';
import { uid,APP_VERSION,FORMAT,SCHEMA } from '../src/shared.js';
import { selectedExportAssessments,exportArchiveCsv,exportCell } from '../src/export.js';
import { DiskStorage,makeFile } from './support.mjs';
const draft={identifier:'000123',stayId:'000456',assessmentTypeId:'memory-clinic',actor:'SYNTH'};
const encode=s=>new TextEncoder().encode(s);
const source=(session='source_a',value='-2.0000000000000000001')=>encode(`session_uuid;testing_start_date;future_score;future_notes;empty_field;missing_field;dangerous_text;negative_zero;comma_decimal\r\n"${session}";"15.1.2026";"${value}";"SYNTHETIC ü; note with ""quotes""\nsecond line";"";;"=1+1";"-0";"0,25"`);
async function setup(t){const root=await mkdtemp(join(tmpdir(),'npt-export-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);const archive=await Archive.open(storage,{compact:true});return{storage,archive};}
async function save(archive,data,name='visit.csv',d=draft){const rows=await inspectFiles([makeFile(name,data)],archive.snapshot.state,[],async(id,rev)=>{const full=await archive.assessmentDetail(id);return full.revisions.find(r=>r.id===rev).document;});const built=buildPatientImport(rows,archive.snapshot.state,d);await archive.commit(built.operations,built.files,built.actor);return Object.values(archive.snapshot.state.assessments).find(a=>a.sessionId===rows[0].document.sessionId);}
function decodeExport(result){return result.chunks.slice(1).map(line=>{const [headers,cells]=parseTable(result.chunks[0]+line);return Object.fromEntries(headers.map((h,i)=>[h.raw,cells[i]]));});}

test('CSV export uses explicit examination selection, all original fields and exact raw precision with source provenance',async t=>{
 const {storage,archive}=await setup(t);const a=await save(archive,source());const before=await readFile(storage.path(objectPath(selectedRevision(a).original)));storage.calls=[];
 const progress=[],result=await exportArchiveCsv(archive,'assessments',[a.id],(done,total)=>progress.push([done,total])),[row]=decodeExport(result);
 assert.equal(result.count,1);assert.equal(result.excluded,0);assert.equal(result.chunks[0][0],'\uFEFF');assert.deepEqual(progress,[[1,1]]);
 for(const [key,value] of Object.entries({'archive.app_version':APP_VERSION,'archive.patient_id':'000123','archive.stay_id':'000456','archive.assessment_type_id':'memory-clinic','archive.date':'2026-01-15','archive.original_date':'15.1.2026','archive.excluded':'0','archive.csv_name':'visit.csv','archive.csv_sha256':selectedRevision(a).original.hash,'archive.import_actor':'SYNTH','archive.producer_version':'','archive.parser_version':'npt-semicolon/1','archive.snapshot_head':archive.snapshot.head,session_uuid:'source_a',future_score:'-2.0000000000000000001',negative_zero:'-0',comma_decimal:'0,25'}))assert.equal(row[key].raw,value,key);
 assert.equal(row.future_notes.raw,'SYNTHETIC ü; note with "quotes"\nsecond line');assert.equal(row.empty_field.missing,false);assert.equal(row.empty_field.quoted,true);assert.equal(row.missing_field.missing,true);assert.deepEqual(JSON.parse(row['archive.absent_fields'].raw),[]);assert.deepEqual(JSON.parse(row['archive.missing_fields'].raw),['missing_field']);assert.deepEqual(JSON.parse(row['archive.escaped_fields'].raw),['dangerous_text']);assert.equal(row.dangerous_text.raw,"'=1+1");
 assert.ok(!storage.calls.some(c=>['cache','before-write','after-close'].includes(c.phase)),'Export never changes archive files, including indexes');assert.deepEqual(await readFile(storage.path(objectPath(selectedRevision(a).original))),before);
});

test('patient CSV includes every examination, excluded status and other assessment types; session selection stays exact',async t=>{
 const {archive}=await setup(t);const a=await save(archive,source());const b=await save(archive,encode('session_uuid;future_other\n"source_b";"0"'),'other.csv',{...draft,stayId:'000999',confirmedPatientId:a.patientId,assessmentTypeId:'suspected-nph'});const c=await save(archive,source('source_c'),'third.csv',{...draft,identifier:'000124'});
 await archive.commit([{type:'assessment.exclusion.set',assessmentId:b.id,excluded:true}]);
 const result=await exportArchiveCsv(archive,'patients',[a.patientId]),rows=decodeExport(result);assert.equal(result.count,2);assert.equal(result.excluded,1);assert.deepEqual(rows.map(r=>r['archive.assessment_id'].raw).sort(),[a.id,b.id].sort());const excluded=rows.find(r=>r['archive.excluded'].raw==='1');assert.equal(excluded['archive.assessment_type_id'].raw,'suspected-nph');assert.equal(excluded.future_other.raw,'0');assert.ok(JSON.parse(excluded['archive.absent_fields'].raw).includes('future_score'));assert.equal(excluded.future_score.missing,true);assert.ok(!JSON.parse(excluded['archive.missing_fields'].raw).includes('future_score'));
 const selected=await exportArchiveCsv(archive,'assessments',[b.id,c.id]);assert.equal(selected.count,2);assert.equal(selected.excluded,1);assert.deepEqual(decodeExport(selected).map(r=>r['archive.assessment_id'].raw).sort(),[b.id,c.id].sort());
 assert.equal(selectedExportAssessments(archive.snapshot.state,'assessments',[b.id,b.id]).length,1);
});

test('absent future column names cannot read inherited JavaScript properties',async t=>{
 const {archive}=await setup(t);const a=await save(archive,source());const b=await save(archive,encode('session_uuid;toString;valueOf\n"inherited_name_session";"SYNTHETIC literal";"0"'),'future.csv',{...draft,confirmedPatientId:a.patientId});const result=await exportArchiveCsv(archive,'patients',[a.patientId]),rows=decodeExport(result),first=rows.find(row=>row['archive.assessment_id'].raw===a.id),second=rows.find(row=>row['archive.assessment_id'].raw===b.id);assert.equal(first.toString.missing,true);assert.equal(first.valueOf.missing,true);assert.equal(second.toString.raw,'SYNTHETIC literal');assert.equal(second.valueOf.raw,'0');
});

test('CSV exports the selected source revision, retaining old revisions in storage',async t=>{
 const {archive}=await setup(t);const a=await save(archive,source());const data=encode('session_uuid;new_metric;future_notes\n"source_a";"1.25000000000000000001";"SYNTHETIC new source"');const rows=await inspectFiles([makeFile('revised.csv',data)],archive.snapshot.state,[],async()=>selectedRevision(await archive.assessmentDetail(a.id)).document);Object.assign(rows[0],{action:'select',note:'Synthetic revised-source review'});const built=buildPatientImport(rows,archive.snapshot.state,{...draft,confirmedPatientId:a.patientId});await archive.commit(built.operations,built.files,'REVIEW');
 const current=archive.snapshot.state.assessments[a.id],result=await exportArchiveCsv(archive,'assessments',[a.id]),[row]=decodeExport(result);assert.equal(result.count,1);assert.equal(row.new_metric.raw,'1.25000000000000000001');assert.equal(row.future_score,undefined);assert.equal(row['archive.csv_name'].raw,'revised.csv');assert.equal(row['archive.import_actor'].raw,'REVIEW');assert.equal(row['archive.selected_revision_id'].raw,current.revisions[1].id);assert.equal(current.revisions.length,2);
});

test('spreadsheet formula protection is recorded without altering ordinary numeric source strings',()=>{
 for(const value of ['=HYPERLINK("x")','+sum(1)','-1+2','@cmd',' \t=cmd','\nplain','＝cmd']){const escaped=[];assert.ok(exportCell(value,'field',escaped).startsWith('"\''));assert.deepEqual(escaped,['field']);}
 for(const value of ['-2','+2','1e3','0,25','-0','ordinary text',"'=already protected",'']){const escaped=[];assert.equal(exportCell(value,'field',escaped),'"'+value+'"');assert.deepEqual(escaped,[]);}
});

test('invalid/empty selections and damaged recovery snapshots never produce partial exports',async t=>{
 const {archive}=await setup(t);const a=await save(archive,source());await assert.rejects(exportArchiveCsv(archive,'assessments',[]),/auswählen/);await assert.rejects(exportArchiveCsv(archive,'assessments',['missing']),/nicht mehr verfügbar/);await assert.rejects(exportArchiveCsv(archive,'other',[a.id]),/ungültig/);
 const id=uid();await archive.commit([{type:'patient.create',patient:{id,identifier:'00999',label:''}}]);await assert.rejects(exportArchiveCsv(archive,'patients',[id]),/keine Untersuchungen/);archive.snapshot.readOnly=true;await assert.rejects(exportArchiveCsv(archive,'assessments',[a.id]),/prüfen/);
});

test('export refuses stale heads before reading values and detects new commits during generation',async t=>{
 const {storage,archive}=await setup(t);const a=await save(archive,source());const stale=await Archive.open(storage,{compact:true});await archive.commit([{type:'assessment.exclusion.set',assessmentId:a.id,excluded:true}]);await assert.rejects(exportArchiveCsv(stale,'assessments',[a.id]),e=>e.requiresArchiveCheck&&/geändert/.test(e.message));
 const payload={format:FORMAT+'-commit',schemaVersion:SCHEMA,archiveId:archive.snapshot.manifest.archiveId,id:uid(),parent:archive.snapshot.head,createdAt:new Date().toISOString(),actor:'SYNTH',operations:[{type:'assessment.exclusion.set',assessmentId:a.id,excluded:false}]};const record=await seal(payload);
 await assert.rejects(exportArchiveCsv(archive,'assessments',[a.id],()=>writeFileSync(storage.path('records/'+payload.id+'.json'),JSON.stringify(record))),e=>e.requiresArchiveCheck&&/während des Exports geändert/.test(e.message));
});

test('export verifies authoritative records despite a warm cache and unchanged source fingerprints',async t=>{
 const {storage,archive}=await setup(t);const a=await save(archive,source());const record=archive.snapshot.records[0],path='records/'+record.payload.id+'.json',data=await storage.read(path),changed=Buffer.from(data).toString().replace('"actor":"SYNTH"','"actor":"OTHER"');assert.equal(Buffer.byteLength(changed),data.length);await writeFile(storage.path(path),changed);const time=new Date(record.source.lastModified);await utimes(storage.path(path),time,time);
 const warm=await Archive.open(storage,{compact:true});assert.equal(warm.snapshot.metrics.sourceRecordsRead,0);await assert.rejects(exportArchiveCsv(warm,'assessments',[a.id]),e=>e.requiresArchiveCheck&&/nicht geprüft/.test(e.message));
});

test('missing or corrupted selected CSV originals prevent export; read permission is sufficient for valid sources',async t=>{
 const {storage,archive}=await setup(t);const a=await save(archive,source());storage.fault=phase=>['cache','before-write'].includes(phase);assert.equal((await exportArchiveCsv(archive,'assessments',[a.id])).count,1);storage.fault=null;
 await writeFile(storage.path(objectPath(selectedRevision(a).original)),'SYNTHETIC damaged source');await assert.rejects(exportArchiveCsv(archive,'assessments',[a.id]),e=>e.requiresArchiveCheck&&/CSV-Quelle/.test(e.message));
});
