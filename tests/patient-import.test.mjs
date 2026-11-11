import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFiles, planPatientImport, buildPatientImport, reportNameKey } from '../src/import.js';
import { emptyState, applyOperations, selectedRevision } from '../src/model.js';
import { uid } from '../src/shared.js';
import { fixture, makeFile, syntheticPdf, sampleOperations, DiskStorage } from './support.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArchive } from '../src/storage.js';
import { Archive } from '../src/archive.js';

const draft = (extra={}) => ({ identifier:'000123',stayId:'0000456',assessmentTypeId:'general-neurology',confirmedPatientId:'',actor:'TEST',...extra });
const csv = async id => new TextEncoder().encode(new TextDecoder().decode(await fixture()).replaceAll('00000000-0000-4000-8000-000000000001',id));
const inspect = (files,state=emptyState()) => inspectFiles(files,state,[]);

test('one patient/stay applies to every examination; identical PDF objects still get separate filename-matched links',async()=>{
 const rows=await inspect([makeFile('first.csv',await csv('session_first')),makeFile('second.csv',await csv('session_second')),makeFile('first.pdf',syntheticPdf(false)),makeFile('second.pdf',syntheticPdf(false))]);
 const before=structuredClone(rows);const built=buildPatientImport(rows,emptyState(),draft());const state=applyOperations(emptyState(),built.operations);
 assert.equal(Object.keys(state.patients).length,1);const patient=Object.values(state.patients)[0];assert.equal(patient.identifier,'000123');assert.equal(patient.label,'');
 assert.equal(built.count,4);assert.equal(built.files.size,3);
 for(const a of Object.values(state.assessments)){assert.equal(a.patientId,patient.id);assert.equal(a.stayId,'0000456');assert.equal(a.assessmentTypeId,'general-neurology');assert.equal(a.attachments.length,1);assert.equal(a.attachments[0].method,'filename-prefix-50');assert.match(a.attachments[0].note,/Automatisch/);}
 assert.deepEqual(rows,before,'Planning/building must not alter source rows or parsed clinical values');
});

test('existing ID exposes patient examination count/dates and cannot be reused without its explicit confirmation',async()=>{
 const s=await sampleOperations();const state=applyOperations(emptyState(),s.operations);
 const rows=await inspect([makeFile('new.csv',await csv('session_new'))],state);
 let plan=planPatientImport(rows,state,draft());assert.equal(plan.patient.id,s.patient.id);assert.equal(plan.previous.length,1);assert.equal(selectedRevision(plan.previous[0]).document.date,'2026-01-15');assert.equal(plan.ready,false);
 assert.throws(()=>buildPatientImport(rows,state,draft()),/bestätigen/);
 assert.throws(()=>buildPatientImport(rows,state,draft({confirmedPatientId:uid()})),/bestätigen/);
 const built=buildPatientImport(rows,state,draft({confirmedPatientId:s.patient.id}));assert.ok(!built.operations.some(o=>o.type==='patient.create'));
 const next=applyOperations(state,built.operations);assert.equal(Object.keys(next.patients).length,1);assert.equal(Object.keys(next.assessments).length,2);assert.ok(Object.values(next.assessments).every(a=>a.patientId===s.patient.id));
});

test('changing the entered ID cannot reuse another existing patient confirmation; digit strings preserve leading zeroes',async()=>{
 const s=await sampleOperations();const other={id:uid(),identifier:'000999',label:''};const state=applyOperations(emptyState(),[...s.operations,{type:'patient.create',patient:other}]);const rows=await inspect([makeFile('new.csv',await csv('new_one'))],state);
 assert.throws(()=>buildPatientImport(rows,state,draft({identifier:other.identifier,confirmedPatientId:s.patient.id})),/bestätigen/);
 for(const bad of ['',123,'-1','1e3','12 34'])assert.equal(planPatientImport(rows,state,draft({identifier:bad})).ready,false);
 for(const bad of ['',456,'-1','4.5'])assert.equal(planPatientImport(rows,state,draft({stayId:bad,confirmedPatientId:s.patient.id})).ready,false);
});

test('unmatched PDF blocks the import, ignores forged targets and permits replacement only when the exact stem matches',async()=>{
 let rows=await inspect([makeFile('visit.csv',await fixture()),makeFile('wrong.pdf',syntheticPdf(false))]);
 rows[1].target='batch:'+rows[0].id;rows[1].suggestions=[rows[1].target];rows[1].confirmed=true;rows[1].note='forged';assert.throws(()=>buildPatientImport(rows,emptyState(),draft()),/PDF-Dateiname/);
 rows=await inspect([makeFile('visit.csv',await fixture()),makeFile('Visit.pdf',syntheticPdf(false))]);assert.equal(planPatientImport(rows,emptyState(),draft()).ready,false,'No fuzzy/case-folded stem match');
 rows=await inspect([makeFile('visit.csv',await fixture()),makeFile('visit.PDF',syntheticPdf(false))]);const next=applyOperations(emptyState(),buildPatientImport(rows,emptyState(),draft()).operations);assert.equal(Object.values(next.assessments)[0].attachments.length,1);
});

test('two different CSVs sharing the same filename cannot ambiguously claim one PDF',async()=>{
 const rows=await inspect([makeFile('visit.csv',await csv('first')),makeFile('visit.csv',await csv('second')),makeFile('visit.pdf',syntheticPdf(false))]);
 assert.throws(()=>buildPatientImport(rows,emptyState(),draft()),/mehreren Untersuchungen/);
});

test('late PDF can match an archived CSV, but only for the confirmed patient and exact stay',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),s.operations);const rows=await inspect([makeFile('synthetic.pdf',syntheticPdf(false))],state);
 const d=draft({confirmedPatientId:s.patient.id});const built=buildPatientImport(rows,state,d);const next=applyOperations(state,built.operations);assert.equal(next.assessments[s.assessment.id].attachments.length,1);assert.equal(built.count,1);
 assert.throws(()=>buildPatientImport(rows,state,draft({identifier:'000999'})),/PDF-Dateiname/);
 assert.throws(()=>buildPatientImport(rows,state,{...d,stayId:'000000'}),/PDF-Dateiname/);
});

test('a renamed but byte-identical CSV can identify its existing assessment for an exact-named PDF',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),s.operations);const rows=await inspect([makeFile('renamed.csv',s.csv),makeFile('renamed.pdf',syntheticPdf(false))],state);
 const next=applyOperations(state,buildPatientImport(rows,state,draft({confirmedPatientId:s.patient.id})).operations);assert.equal(Object.keys(next.assessments).length,1);assert.equal(next.assessments[s.assessment.id].attachments.length,1);
});

test('duplicates are skipped by assessment relationship, and known CSV ownership conflicts are not hidden',async()=>{
 const files=[makeFile('visit.csv',await fixture()),makeFile('visit.pdf',syntheticPdf(false))];const built=buildPatientImport(await inspect(files),emptyState(),draft());const state=applyOperations(emptyState(),built.operations);const patient=Object.values(state.patients)[0];const rows=await inspect(files,state);
 const plan=planPatientImport(rows,state,draft({confirmedPatientId:patient.id}));assert.equal(plan.ready,false);assert.equal(plan.duplicateCount,2);assert.equal(plan.rows.length,0);
 assert.throws(()=>buildPatientImport(rows,state,draft({identifier:'999'})),/anderen Patienten/);
 const renamed=await inspect([makeFile('wrong-name.pdf',syntheticPdf(false))],state);assert.throws(()=>buildPatientImport(renamed,state,draft({confirmedPatientId:patient.id})),/PDF-Dateiname/,'Already-known PDF bytes must not bypass the filename check');
});

test('an invalid file blocks the complete one-patient import instead of silently dropping it',async()=>{
 const rows=await inspect([makeFile('visit.csv',await fixture()),makeFile('visit.pdf',new TextEncoder().encode('invalid PDF'))]);assert.throws(()=>buildPatientImport(rows,emptyState(),draft()),/PDF-Dateisignatur/);
 assert.equal(planPatientImport([rows[0]],emptyState(),draft()).ready,true);
});

test('changed CSVs still need an explicit revision decision; a different patient/stay needs explicit separation',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),s.operations);const rows=await inspect([makeFile('revised.csv',await fixture('revised-same-session.csv')),makeFile('revised.pdf',syntheticPdf(false))],state);const d=draft({confirmedPatientId:s.patient.id});
 assert.throws(()=>buildPatientImport(rows,state,d),/Entscheidung/);rows[0].action='select';rows[0].note='Reviewed changed source';const next=applyOperations(state,buildPatientImport(rows,state,d).operations);const a=next.assessments[s.assessment.id];assert.equal(a.revisions.length,2);assert.equal(a.selectedRevisionId,a.revisions[1].id);assert.equal(a.attachments.length,1);
 assert.throws(()=>buildPatientImport(rows,state,{...d,stayId:'987'}),/anderen Patienten/);
 rows[0].action='separate';const separated=applyOperations(state,buildPatientImport(rows,state,draft({identifier:'999',stayId:'987'})).operations);assert.equal(Object.keys(separated.patients).length,2);assert.equal(Object.keys(separated.assessments).length,2);const added=Object.values(separated.assessments).find(a=>a.id!==s.assessment.id);assert.equal(added.stayId,'987');assert.equal(added.attachments.length,1);
});

test('new examinations still require an allowed assessment type and repeated source sessions need sequential imports',async()=>{
 const rows=await inspect([makeFile('one.csv',await fixture())]);assert.throws(()=>buildPatientImport(rows,emptyState(),draft({assessmentTypeId:''})),/Untersuchungsart/);assert.throws(()=>buildPatientImport(rows,emptyState(),draft({assessmentTypeId:'invented'})),/Untersuchungsart/);
 const batch=await inspect([makeFile('one.csv',await fixture()),makeFile('two.csv',await fixture('revised-same-session.csv'))]);assert.throws(()=>buildPatientImport(batch,emptyState(),draft()),/nacheinander/);
});

test('one-patient assignments and automatic PDF provenance survive a disk-only reopen',async t=>{
 const root=await mkdtemp(join(tmpdir(),'npt-patient-import-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);const archive=await Archive.open(storage,{compact:true});
 const rows=await inspect([makeFile('visit.csv',await fixture()),makeFile('visit.pdf',syntheticPdf(false))]);const built=buildPatientImport(rows,archive.snapshot.state,draft());await archive.commit(built.operations,built.files,built.actor);
 const reopened=await Archive.open(new DiskStorage(root),{compact:true});const p=Object.values(reopened.snapshot.state.patients)[0],a=Object.values(reopened.snapshot.state.assessments)[0];assert.equal(p.identifier,'000123');assert.equal(a.patientId,p.id);assert.equal(a.stayId,'0000456');assert.equal(a.attachments[0].method,'filename-prefix-50');assert.equal(a.attachments[0].name,'visit.pdf');
 const full=await reopened.assessmentDetail(a.id);assert.deepEqual(selectedRevision(full).document.raw,rows[0].document.raw);
 assert.equal(reopened.snapshot.state.history[0].actor,'TEST');
});

test('new imports require an operator abbreviation before building any writes; older optional-actor records stay readable',async()=>{
 const rows=await inspect([makeFile('visit.csv',await fixture())]);
 for(const actor of [undefined,'','   ','\t\n','A'.repeat(101),'A\u0000B'])assert.throws(()=>buildPatientImport(rows,emptyState(),draft({actor})),/Bearbeiterkürzel erforderlich/);
 const built=buildPatientImport(rows,emptyState(),draft({actor:'  AB  '}));assert.equal(built.actor,'AB');assert.equal(Object.keys(applyOperations(emptyState(),built.operations).assessments).length,1);
});

test('PDF matching uses 50 letters/numbers, ignores separators/repeated endings and retains the original filename',async()=>{
 const prefix='A'.repeat(50),pdfName=prefix+'different-ending.pdf.pdf';
 const rows=await inspect([makeFile(prefix+'source-ending.csv',await fixture()),makeFile(pdfName,syntheticPdf(false))]);const next=applyOperations(emptyState(),buildPatientImport(rows,emptyState(),draft()).operations);const report=Object.values(next.assessments)[0].attachments[0];assert.equal(report.name,pdfName);assert.equal(report.method,'filename-prefix-50');
 assert.equal(reportNameKey('2026-01-15_ÜBUNG_01.csv'),reportNameKey('20260115 U\u0308BUNG01.PDF.PDF'));assert.equal(reportNameKey('---.pdf.pdf'),'');assert.notEqual(reportNameKey('visit.csv'),reportNameKey('Visit.pdf'));
});

test('matching prefixes that identify more than one examination are rejected, including PDF-only imports',async()=>{
 const prefix='B'.repeat(50);const rows=await inspect([makeFile(prefix+'one.csv',await csv('one')),makeFile(prefix+'two.csv',await csv('two')),makeFile(prefix+'report.pdf.pdf',syntheticPdf(false))]);assert.throws(()=>buildPatientImport(rows,emptyState(),draft()),/mehreren Untersuchungen/);
 const stored=applyOperations(emptyState(),buildPatientImport(rows.slice(0,2),emptyState(),draft()).operations),patient=Object.values(stored.patients)[0];const pdf=await inspect([makeFile(prefix+'late.pdf.pdf',syntheticPdf(false))],stored);assert.throws(()=>buildPatientImport(pdf,stored,draft({confirmedPatientId:patient.id})),/mehreren Untersuchungen/);
});
