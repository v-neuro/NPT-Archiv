import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {recentChanges,matchesHistoryFilters,validHistoryFilters,editDay} from '../src/history.js';
import {applyOperations,emptyState} from '../src/model.js';
import {sampleOperations,DiskStorage,makeFile,syntheticPdf} from './support.mjs';
import {Archive} from '../src/archive.js';
import {createArchive} from '../src/storage.js';
import {uid} from '../src/shared.js';
import {buildAssessmentPdf} from '../src/import.js';
import {buildAssignment} from '../src/workflow.js';

const meta=(id,day)=>({id,createdAt:day+'T12:00:00Z',actor:'TEST'});

test('recent changes list every accepted operation newest first, with source dates, actors and files',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),s.operations,meta('first','2026-01-20')),pdf=await buildAssessmentPdf(makeFile('synthetic.pdf.pdf',syntheticPdf()),state.assessments[s.assessment.id]);
 const next=applyOperations(state,pdf.operations,meta('pdf','2026-02-01')),before=JSON.stringify(next),rows=recentChanges(next);
 assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.label),['PDF hinzugefügt','CSV-Fassung hinzugefügt','Untersuchung angelegt','Patient angelegt']);
 assert.equal(rows[0].file.name,'synthetic.pdf.pdf');assert.equal(rows[0].assessmentDate,'2026-01-15');assert.equal(rows[0].editDate,editDay('2026-02-01T12:00:00Z'));assert.equal(rows[0].patientLabel,'000123');assert.equal(rows[0].actor,'TEST');assert.equal(rows.at(-1).assessmentDate,'');
 assert.equal(JSON.stringify(next),before,'Building the history never changes records or the snapshot');
 assert.deepEqual(recentChanges(emptyState()),[]);
});

test('patient corrections can be found under old and new identifiers while preserving historical context',async()=>{
 const s=await sampleOperations(),before=applyOperations(emptyState(),s.operations,meta('first','2026-01-20'));
 const operations=buildAssignment(before,s.assessment.id,{identifier:'000999',stayId:'00088',assessmentTypeId:'memory-clinic',reason:'SYNTHETIC correction'}),after=applyOperations(before,operations,meta('correction','2026-02-01')),rows=recentChanges(after);
 const link=rows.find(r=>r.label==='Patientenzuordnung geändert');assert.equal(link.patientLabel,'000123 → 000999');assert.equal(link.assessmentDate,'2026-01-15');assert.equal(link.reason,'SYNTHETIC correction');assert.equal(link.stayId,'0000456');
 for(const patientId of ['000123','000999','999'])assert.equal(matchesHistoryFilters(link,{patientId}),true);
 const imported=rows.find(r=>r.label==='CSV-Fassung hinzugefügt');assert.equal(imported.patientLabel,'000123 (jetzt 000999)');assert.equal(matchesHistoryFilters(imported,{patientId:'000999'}),true);
 assert.equal(rows.find(r=>r.label==='Aufenthalts-ID geändert').stayId,'00088');assert.equal(matchesHistoryFilters(imported,{patientId:'000000'}),false);
});

test('history dates follow the event revision, not a later assessment date or source file',async()=>{
 const s=await sampleOperations(),before=applyOperations(emptyState(),s.operations,meta('first','2026-01-20')),revision=structuredClone(s.revision);revision.id=uid();revision.document.date='2026-02-05';
 let state=applyOperations(before,[{type:'revision.add',assessmentId:s.assessment.id,revision}],meta('new-source','2026-02-10'));
 state=applyOperations(state,[{type:'revision.select',assessmentId:s.assessment.id,revisionId:revision.id}],meta('choose','2026-02-11'));
 const rows=recentChanges(state);assert.equal(rows[0].assessmentDate,'2026-02-05');assert.equal(rows.find(r=>r.id==='new-source:0').assessmentDate,'2026-02-05');assert.equal(rows.find(r=>r.id==='first:2').assessmentDate,'2026-01-15');
 assert.equal(matchesHistoryFilters(rows[0],{editFrom:'2026-02-11',editTo:'2026-02-11',assessmentFrom:'2026-02-05',assessmentTo:'2026-02-05',patientId:'000123'}),true);
 assert.equal(matchesHistoryFilters(rows[0],{assessmentTo:'2026-02-04'}),false);assert.equal(matchesHistoryFilters(rows[0],{editFrom:'2026-02-12'}),false);
});

test('patient-only and undated events never match active date filters; invalid dates are refused',()=>{
 const row={editDate:'',assessmentDate:'',patientIdentifiers:['00001']};assert.equal(matchesHistoryFilters(row,{}),true);assert.equal(matchesHistoryFilters(row,{assessmentFrom:'2026-01-01'}),false);assert.equal(matchesHistoryFilters(row,{editTo:'2026-12-31'}),false);
 for(const filters of [{editFrom:'2026-02-30'},{editTo:'junk'},{assessmentFrom:'2026-02-02',assessmentTo:'2026-02-01'},{editFrom:'2026-01-02',editTo:'2026-01-01'}]){assert.equal(validHistoryFilters(filters),false);assert.equal(matchesHistoryFilters(row,filters),false);}
 assert.equal(editDay('unknown'), '');assert.equal(editDay(null),'');
 const timestamp='2026-01-31T23:30:00Z',local=new Date(timestamp);assert.equal(editDay(timestamp),[local.getFullYear(),String(local.getMonth()+1).padStart(2,'0'),String(local.getDate()).padStart(2,'0')].join('-'));
});

test('recent changes survive compact indexes and source-only reopening, including late links and all statuses',async t=>{
 const root=await mkdtemp(join(tmpdir(),'npt-history-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);const archive=await Archive.open(storage,{compact:true}),s=await sampleOperations();await archive.commit(s.operations,s.files,'IMPORT');
 const built=await buildAssessmentPdf(makeFile('synthetic.pdf',syntheticPdf()),archive.snapshot.state.assessments[s.assessment.id]);await archive.commit(built.operations,built.files,'PDF');await archive.commit([{type:'assessment.exclusion.set',assessmentId:s.assessment.id,excluded:true}],new Map(),'EDIT');
 const expected=recentChanges(archive.snapshot.state);assert.equal(expected[0].label,'Datensatz ausgeschlossen');for(let i=0;i<2;i++)assert.deepEqual(recentChanges((await Archive.open(storage,{compact:true})).snapshot.state),expected);
 await rm(join(root,'indexes'),{recursive:true,force:true});assert.deepEqual(recentChanges((await Archive.open(storage)).snapshot.state),expected);
});

test('legacy loose reports and later links retain the file in history; unlinking keeps past patient context visible',async()=>{
 const s=await sampleOperations(),before=applyOperations(emptyState(),s.operations,meta('import','2026-01-20')),pdf=await buildAssessmentPdf(makeFile('synthetic.pdf',syntheticPdf()),before.assessments[s.assessment.id]),attachment=pdf.operations[0].attachment;
 let state=applyOperations(before,[{type:'attachment.unlinked',attachment}],meta('loose','2026-02-01'));
 state=applyOperations(state,[{type:'attachment.link',assessmentId:s.assessment.id,attachmentId:attachment.id,note:'SYNTHETIC later link'}],meta('link','2026-02-02'));
 state=applyOperations(state,[{type:'patient.link',assessmentId:s.assessment.id,patientId:null,reason:'SYNTHETIC explicit unlink'}],meta('unlink','2026-02-03'));
 const rows=recentChanges(state),loose=rows.find(row=>row.label==='Bericht ohne Zuordnung abgelegt'),linked=rows.find(row=>row.label==='Bericht zugeordnet');assert.equal(loose.file.id,attachment.id);assert.equal(loose.assessmentId,null);assert.equal(loose.assessmentDate,'');assert.equal(linked.file.id,attachment.id);assert.equal(linked.assessmentDate,'2026-01-15');assert.match(linked.patientLabel,/000123.*jetzt nicht zugeordnet/);assert.equal(rows[0].patientLabel,'000123 → Nicht zugeordnet');
});
