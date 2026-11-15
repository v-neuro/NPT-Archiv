import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCsv, changedFields } from '../src/csv.js';
import { NUMERIC_FIELDS, BOOLEAN_FIELDS } from '../src/field-types.js';
import { missingReason, assessmentStatus, matchesSourceFilters } from '../src/source-contract.js';
import { hasPerformanceValue, performanceFields } from '../src/summary.js';
import { aggregateMeasure, aggregateStatistics, newStatisticsSettings } from '../src/statistics.js';
import { importedFieldGroups, importedFieldDisplay } from '../src/imported-fields.js';
import { inspectFiles, buildImport } from '../src/import.js';
import { Archive, copyArchive } from '../src/archive.js';
import { selectedRevision, emptyState, objectPath } from '../src/model.js';
import { createArchive } from '../src/storage.js';
import { sha256, uid } from '../src/shared.js';
import { seal } from '../src/record.js';
import { DiskStorage, makeFile } from './support.mjs';

const encode = value => new TextEncoder().encode(value);
import { sourceV2 } from './v2-support.mjs';

const assessment=document=>({id:uid(),selectedRevisionId:'revision',revisions:[{id:'revision',document}]});
async function setup(t){const root=await mkdtemp(join(tmpdir(),'archive-v2-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);return {root,storage,archive:await Archive.open(storage,{compact:true})};}
async function importSource(archive,source,action='new') {
  const rows=await inspectFiles([makeFile('examination.csv',encode(source))],archive.snapshot.state,[],async(id,revisionId)=> (await archive.assessmentDetail(id)).revisions.find(r=>r.id===revisionId).document);
  assert.equal(rows[0].error,undefined);
  Object.assign(rows[0],{action,confirmed:true,assessmentTypeId:'memory-clinic',stayId:'1',note:'Synthetic revision review'});
  const built=buildImport(rows,archive.snapshot.state);await archive.commit(built.operations,built.files,'TEST');return rows[0];
}

test('v2 separates real zero, boolean false, fractions, NULL and exact source precision for all typed fields',async()=>{
  const d=await parseCsv(sourceV2({dcsr_dg1_hits:'0',dcsr_aborted:'0',tmt_a_s:'0.5',rey_copy_subtotal:'1.234567890123456789',phq9_total:'',future_metric:'0008'}, {phq9_total:'not-performed'}));
  assert.equal(d.exportSchemaVersion,'2');assert.equal(d.normalized.dcsr_dg1_hits,0);assert.equal(d.normalized.dcsr_aborted,false);
  assert.equal(d.missingReasons.dcsr_dg1_hits,null);assert.equal(d.missingReasons.dcsr_aborted,null);
  assert.equal(d.normalized.tmt_a_s,0.5);assert.equal(d.raw.rey_copy_subtotal.raw,'1.234567890123456789');
  assert.equal(d.normalized.phq9_total,null);assert.equal(d.missingReasons.phq9_total,'not-performed');assert.equal(d.normalized.future_metric,'0008');
  for(const key of NUMERIC_FIELDS) {const doc=await parseCsv(sourceV2({[key]:'0.5'}));assert.equal(doc.normalized[key],0.5,key);}
  for(const key of BOOLEAN_FIELDS) {const doc=await parseCsv(sourceV2({[key]:'0'}));assert.equal(doc.normalized[key],false,key);}
});

test('legacy blanks including quoted blanks get unknown, historical zeros stay values and status is never guessed',async()=>{
  const d=await parseCsv('session_uuid;vlmt_sum_dg1_5;moca_total;phq9_total;phq9_aborted;phq9_version\nlegacy;0;;"";0;selected');
  assert.equal(d.exportSchemaVersion,null);assert.equal(d.normalized.vlmt_sum_dg1_5,0);
  for(const key of ['moca_total','phq9_total']){assert.equal(d.normalized[key],null);assert.equal(missingReason(d,key),'unknown');}
  assert.equal(assessmentStatus(d,'phq9'),'unknown');assert.equal(assessmentStatus(d,'vlmt'),'unknown');
  const untouched=await parseCsv(sourceV2({moca_total:''},{moca_total:'not-performed'},{moca:'not-performed'}));
  assert.equal(missingReason(untouched,'moca_total'),'not-performed');assert.equal(assessmentStatus(untouched,'moca'),'not-performed');
});

test('partial/aborted results, missing totals, timed cutoffs and the naming-test status stay independent',async()=>{
  const d=await parseCsv(sourceV2({vlmt_dg5_hits:'0',vlmt_sum_dg1_5:'',dcsr_dg1_hits:'0',dcsr_sum_dg1_5:'',tmt_a_s:'',tmt_a_aborted:'1',cerad_bnt_correct:'',cerad_benennen_aborted:'1',rey_copy_subtotal:'0.5',rey_copy_total:'',rey_copy_completed:'0',qolie31_overall:'42.125',qolie31_overall_partial:'1',qolie31_scored_answered_count:'12'}, {}, {vlmt:'recorded',dcsr:'recorded',tmt:'aborted',cerad_bnt:'aborted',rey_copy:'recorded',qolie31:'recorded'}));
  assert.equal(d.normalized.vlmt_dg5_hits,0);assert.equal(d.normalized.dcsr_dg1_hits,0);
  for(const key of ['vlmt_sum_dg1_5','dcsr_sum_dg1_5','tmt_a_s','cerad_bnt_correct','rey_copy_total'])assert.equal(d.normalized[key],null);
  assert.equal(d.normalized.tmt_a_aborted,true);assert.equal(assessmentStatus(d,'cerad_bnt'),'aborted');
  assert.equal(d.normalized.rey_copy_subtotal,0.5);assert.equal(d.normalized.qolie31_overall,42.125);assert.equal(d.normalized.qolie31_scored_answered_count,12);
});

test('v2 violations retain raw diagnostics and both sides of contradictions; unknown reasons/statuses survive',async()=>{
  const d=await parseCsv(sourceV2({phq9_total:'0',gad7_total:'',gds_total:'',moca_total:'',qolie31_validation_errors:'Problem; "quoted"\nsecond line'}, {phq9_total:'not-performed',gds_total:'future-reason'}, {moca:'future-status'}, {override:{gad7_total_missing_reason:'',moca_total_missing_reason:'__proto__'}}));
  assert.equal(d.normalized.phq9_total,0);assert.equal(d.missingReasons.phq9_total,'not-performed');
  assert.equal(d.missingReasons.gad7_total,'unknown');assert.equal(d.missingReasons.gds_total,'future-reason');assert.equal(d.missingReasons.moca_total,'__proto__');
  assert.equal(assessmentStatus(d,'moca'),'future-status');assert.match(d.raw.qolie31_validation_errors.raw,/second line/);
  for(const code of ['contradictory-reason','missing-reason','unknown-reason','assessment-status'])assert.ok(d.issues.some(issue=>issue.code===code),code);
  const missing=await parseCsv(sourceV2({phq9_total:''},{},{},{override:{export_missing_reason_system:'other'}}).replace(';phq9_total_missing_reason','').replace(';"unknown"',''));
  assert.ok(missing.issues.some(issue=>issue.code==='reason-system'));
  assert.ok(missing.issues.some(issue=>issue.code==='missing-reason'));
  for(const invalid of ['NaN','Infinity','-999x','NULL','12,5',' 12','false','1e999']) {
    const doc=await parseCsv(sourceV2({tmt_a_s:invalid}));assert.equal(doc.normalized.tmt_a_s,null,invalid);assert.equal(doc.missingReasons.tmt_a_s,'error');assert.equal(doc.raw.tmt_a_s.raw,invalid);assert.equal(hasPerformanceValue(doc,'tmt_a_s'),false);
  }
  const flag=await parseCsv(sourceV2({tmt_aborted:'false'}));assert.equal(flag.normalized.tmt_aborted,null);assert.equal(flag.missingReasons.tmt_aborted,'error');
});

test('explicit unsupported versions are rejected individually without silently importing legacy',async()=>{
  for(const version of ['3','1','02',''])await assert.rejects(parseCsv(sourceV2({},{},{},{override:{export_schema_version:version}})),/export_schema_version/);
  const rows=await inspectFiles([makeFile('bad.csv',encode(sourceV2({},{},{},{override:{export_schema_version:'99'}}))),makeFile('good.csv',encode(sourceV2()))],emptyState(),[]);
  assert.match(rows[0].error,/99/);assert.equal(rows[0].included,false);assert.equal(rows[1].error,undefined);
});

test('manual questionnaires, unsupported MoCA correction and all standard missing reasons stay nullable',async()=>{
  const values={phq9_entry_mode:'manual',phq9_manual_total:'0',phq9_total:'0',phq9_item_a:'',moca_education_years:'',moca_education_correction:''};
  const reasons={phq9_item_a:'not-applicable',moca_education_years:'unsupported',moca_education_correction:'unsupported'};
  const d=await parseCsv(sourceV2(values,reasons,{phq9:'completed'}));assert.equal(d.normalized.phq9_total,0);assert.equal(d.normalized.phq9_item_a,null);assert.equal(d.missingReasons.phq9_item_a,'not-applicable');
  for(const key of ['moca_education_years','moca_education_correction']){assert.equal(d.normalized[key],null);assert.equal(d.missingReasons[key],'unsupported');}
  for(const reason of ['not-performed','unknown','not-applicable','unsupported','error']){const doc=await parseCsv(sourceV2({moca_total:''},{moca_total:reason}));assert.equal(doc.normalized.moca_total,null);assert.equal(doc.missingReasons.moca_total,reason);}
});

test('header mapping accepts BOM, reordered/future columns and CSV delimiters, quotes and newlines',async()=>{
  const values={vlmt_sum_dg1_5:'12.500',vlmt_notes:'Ä;"quoted"\r\nnew line',future_field:'00001'};
  const a=await parseCsv(sourceV2(values)),b=await parseCsv(sourceV2(values,{},{},{reverse:true,bom:true}));
  assert.equal(a.semanticHash,b.semanticHash);assert.deepEqual(changedFields(a,b),[]);assert.equal(b.normalized.vlmt_sum_dg1_5,12.5);assert.equal(b.raw.vlmt_notes.raw,values.vlmt_notes);assert.equal(b.normalized.future_field,'00001');
});

test('revision comparison preserves decimal precision and malformed-value differences without breaking format equivalence',async()=>{
  const a=await parseCsv(sourceV2({tmt_a_s:'1.00000000000000000001'})),b=await parseCsv(sourceV2({tmt_a_s:'1'}));
  assert.equal(a.normalized.tmt_a_s,b.normalized.tmt_a_s);assert.notEqual(a.semanticHash,b.semanticHash);assert.deepEqual(changedFields(a,b),['tmt_a_s']);
  const c=await parseCsv(sourceV2({tmt_a_s:'12.00'})),d=await parseCsv(sourceV2({tmt_a_s:'1.2e1'}));assert.equal(c.semanticHash,d.semanticHash);assert.deepEqual(changedFields(c,d),[]);
  const badA=await parseCsv(sourceV2({tmt_a_s:'bad-a'})),badB=await parseCsv(sourceV2({tmt_a_s:'bad-b'}));assert.notEqual(badA.semanticHash,badB.semanticHash);assert.deepEqual(changedFields(badA,badB),['tmt_a_s']);
});

test('cohort denominators exclude NULL/invalid values and include zeros without hiding empty examinations',async()=>{
  const docs=await Promise.all(['0','0.5','','bad'].map(value=>parseCsv(sourceV2({tmt_a_s:value},{},{tmt:value===''?'not-performed':'recorded'}))));
  const assessments=docs.map(assessment),state={assessments:Object.fromEntries(assessments.map(a=>[a.id,a]))};
  assert.deepEqual(aggregateMeasure(assessments,'tmt_a_s'),{total:4,count:2,missing:2,mean:0.25,min:0,max:0.5});
  assert.equal(aggregateStatistics(state,{...newStatisticsSettings(),preset:'custom',from:'2026-01-01',to:'2026-01-31'}).total,4);
  assert.equal(aggregateMeasure(assessments,'tmt_a_s',{sourceFilters:{group:'tmt',status:'not-performed'}}).count,0);
  const empty=aggregateMeasure([assessment(docs[2])],'tmt_a_s');assert.equal(empty.mean,null);assert.equal(empty.min,null);assert.equal(empty.max,null);
});

test('read-only presentation grays missing sections and cells while zero/false and interrupted results remain visible',async()=>{
  const d=await parseCsv(sourceV2({moca_version:'8.1',moca_aborted:'0',moca_total:'',phq9_total:'0',phq9_aborted:'0',vlmt_dg5_hits:'2',vlmt_sum_dg1_5:''}, {moca_total:'not-performed'}, {moca:'not-performed',phq9:'recorded',vlmt:'aborted'}));
  const groups=importedFieldGroups(d);assert.equal(groups.find(g=>g.id==='moca').subdued,true);assert.equal(groups.find(g=>g.id==='phq9').subdued,false);assert.equal(groups.find(g=>g.id==='vlmt').subdued,false);
  assert.deepEqual(importedFieldDisplay(d,'phq9_total'),{missing:false,text:'0'});assert.deepEqual(importedFieldDisplay(d,'phq9_aborted'),{missing:false,text:'0'});
  assert.deepEqual(importedFieldDisplay(d,'moca_total'),{missing:true,text:'Nicht durchgeführt'});assert.equal(groups.find(g=>g.id==='vlmt').status,'aborted');
});

test('reason/status changes are reviewed revisions; exact duplicates and cross-session isolation remain intact',async t=>{
  const {archive,storage}=await setup(t),original=sourceV2({moca_total:''},{moca_total:'unknown'},{moca:'unknown'});
  await importSource(archive,original);const id=Object.keys(archive.snapshot.state.assessments)[0];
  let rows=await inspectFiles([makeFile('renamed.csv',encode(original))],archive.snapshot.state,[]);assert.equal(rows[0].status,'duplicate');
  const revised=sourceV2({moca_total:''},{moca_total:'not-performed'},{moca:'not-performed'}),row=await importSource(archive,revised,'keep');
  assert.ok(row.changes.includes('moca_total_missing_reason'));assert.ok(row.changes.includes('moca_assessment_status'));assert.equal(row.equivalent,false);
  assert.equal(missingReason(selectedRevision(archive.snapshot.state.assessments[id]).document,'moca_total'),'unknown');
  const updated=archive.snapshot.state.assessments[id];await archive.commit([{type:'revision.select',assessmentId:id,revisionId:updated.revisions[1].id}]);
  await importSource(archive,sourceV2({session_uuid:'other_examination',moca_total:'0'},{},{moca:'recorded'}));
  const reopened=await Archive.open(storage,{compact:true});assert.equal(Object.keys(reopened.snapshot.state.assessments).length,2);
  assert.equal(missingReason(selectedRevision(reopened.snapshot.state.assessments[id]).document,'moca_total'),'not-performed');
  const full=await reopened.assessmentDetail(id);assert.equal(full.revisions.length,2);assert.equal(selectedRevision(full).document.normalized.moca_total,null);
});

test('legacy schema-1 records migrate as a derived view through full/cold/warm reads and verified backup without rewriting sources',async t=>{
  const {archive,root,storage}=await setup(t),csv=encode('session_uuid;vlmt_sum_dg1_5;moca_total;phq9_total;phq9_aborted\nold-session;0;;"";0');
  const document=await parseCsv(csv);for(const key of ['contractVersion','exportSchemaVersion','missingReasonSystem','missingReasons','assessmentStatuses','issues'])delete document[key];
  document.parserVersion='npt-semicolon/1';document.normalized.phq9_total='';document.normalized.phq9_aborted='0';
  const id=uid(),revision={id:uid(),document,reason:'Historical',original:{id:uid(),hash:await sha256(csv),size:csv.length,name:'old.csv',kind:'csv',method:'legacy',note:'',revisionId:null}};
  const operations=[{type:'assessment.create',assessment:{id,sessionId:'old-session',patientId:null,stayId:'1'}},{type:'revision.add',assessmentId:id,revision}];
  // Emulate an archive written by the previous adapter, rather than persisting a migrated view.
  const commit=await seal({format:'digitale-npt-folder-archive-commit',schemaVersion:1,archiveId:archive.snapshot.manifest.archiveId,id:uid(),parent:null,actor:'OLD',createdAt:'2026-01-15T00:00:00Z',operations});
  const recordPath='records/'+commit.payload.id+'.json';await storage.writeNew(objectPath(revision.original),csv);await storage.writeNew(recordPath,encode(JSON.stringify(commit)));
  const saved=await storage.read(recordPath);assert.equal(document.normalized.phq9_total,'');
  for(const compact of [false,true]){
    const opened=await Archive.open(storage,{compact});assert.equal(opened.snapshot.readOnly,false);const d=selectedRevision(await opened.assessmentDetail(id)).document;
    assert.equal(d.parserVersion,'npt-semicolon/1');assert.equal(d.exportSchemaVersion,null);assert.equal(d.normalized.vlmt_sum_dg1_5,0);assert.equal(d.normalized.phq9_total,null);assert.equal(d.missingReasons.phq9_total,'unknown');assert.equal(d.assessmentStatuses.vlmt,'unknown');
    if(compact)await opened.rebuildIndex();
  }
  const warm=await Archive.open(storage,{compact:true});assert.equal(warm.snapshot.metrics.sourceRecordsRead,0);assert.equal(missingReason(selectedRevision(warm.snapshot.state.assessments[id]).document,'moca_total'),'unknown');
  const duplicate=await inspectFiles([makeFile('formatted.csv',encode('phq9_aborted;phq9_total;moca_total;vlmt_sum_dg1_5;session_uuid\n0;;;0.00;old-session'))],warm.snapshot.state,[],async()=>selectedRevision(await warm.assessmentDetail(id)).document);assert.equal(duplicate[0].equivalent,true);
  const targetRoot=await mkdtemp(join(tmpdir(),'archive-v2-backup-'));t.after(()=>rm(targetRoot,{recursive:true,force:true}));const target=new DiskStorage(targetRoot);await copyArchive(storage,target);
  assert.deepEqual(await storage.read(recordPath),saved);assert.deepEqual(await target.read(recordPath),saved);assert.deepEqual(await target.read(objectPath(revision.original)),csv);
  assert.equal((await Archive.open(target,{compact:true})).snapshot.readOnly,false);
});

test('v2 missingness/status filters survive warm indexes, cache rebuild and unknown reason strings safely',async t=>{
  const {archive,storage}=await setup(t);await importSource(archive,sourceV2({moca_total:'',phq9_total:'',dcsr_dg1_hits:'0'},{moca_total:'not-performed',phq9_total:'__proto__'},{moca:'not-performed',dcsr:'recorded'}));
  for(const deep of [false,true,false]){
    const opened=await Archive.open(storage,{compact:true});if(deep)await opened.rebuildIndex();
    assert.equal(opened.snapshot.readOnly,false);const a=Object.values(opened.snapshot.state.assessments)[0],doc=selectedRevision(a).document;
    assert.equal(matchesSourceFilters(doc,{group:'moca',status:'not-performed',field:'moca_total',reason:'not-performed'}),true);
    assert.equal(matchesSourceFilters(doc,{field:'phq9_total',reason:'__proto__'}),true);assert.equal(matchesSourceFilters(doc,{group:'dcsr',status:'completed'}),false);
    assert.ok(performanceFields([a]).includes('dcsr_dg1_hits'));assert.equal(hasPerformanceValue(doc,'moca_total'),false);
  }
});

test('equivalence still recognizes a formatted re-export of an older unselected adapter-1 revision',async t=>{
  const {archive,storage}=await setup(t),source='session_uuid;tmt_a_s\nlegacy_revision;12.00';
  const rows=await inspectFiles([makeFile('old.csv',encode(source))],archive.snapshot.state,[]);
  const doc=rows[0].document;doc.parserVersion='npt-semicolon/1';doc.semanticHash=await sha256('old-adapter-semantic');delete doc.contractVersion;
  Object.assign(rows[0],{action:'new',confirmed:true,assessmentTypeId:'memory-clinic',stayId:'1'});
  const built=buildImport(rows,archive.snapshot.state);await archive.commit(built.operations,built.files,'TEST');
  await importSource(archive,'session_uuid;tmt_a_s\nlegacy_revision;13','select');
  const reopened=await Archive.open(storage,{compact:true});
  const preview=await inspectFiles([makeFile('reformatted.csv',encode('tmt_a_s;session_uuid\r\n1.2e1;legacy_revision\r\n'))],reopened.snapshot.state,[],async(id,revisionId)=>(await reopened.assessmentDetail(id)).revisions.find(r=>r.id===revisionId).document);
  assert.equal(preview[0].status,'revision');assert.equal(preview[0].equivalent,true);assert.ok(preview[0].changes.includes('tmt_a_s'));
});

test('raw structured backups remain explicitly unsupported and are never flattened or zero-filled',async()=>{
  const data=encode(JSON.stringify({snapshot:{sessionData:{collection_version:2,cerad_mmst:{assessment_complete:true},trials:[{assessed:true}]}}}));
  const rows=await inspectFiles(['json','txt'].map(ext=>makeFile('source.npt-backup.'+ext,data)),emptyState(),[]);
  for(const row of rows){assert.match(row.error,/Vollbackups/);assert.equal(row.included,false);assert.deepEqual(row.data,data);}
});
