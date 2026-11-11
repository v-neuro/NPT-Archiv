import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFiles, buildImport } from '../src/import.js';
import { applyOperations, emptyState } from '../src/model.js';
import { fixture, makeFile, sampleOperations, syntheticPdf } from './support.mjs';
import { uid } from '../src/shared.js';
test('batch preview handles bad files individually, PDF hints never auto-link, reviewed patient/stay explicit',async()=>{
 const data=await fixture(),pdf=syntheticPdf();const rows=await inspectFiles([makeFile('synthetic.csv',data),makeFile('synthetic.pdf',pdf),makeFile('bad.csv',new TextEncoder().encode('bad'))],emptyState(),[]);
 assert.equal(rows[0].status,'new');assert.equal(rows[1].suggestions.length,1);assert.equal(rows[1].target,'');assert.ok(rows[2].error);assert.equal(rows[2].included,false);
 assert.throws(()=>buildImport(rows,emptyState()),/bestätigen/);
 const p={id:uid(),identifier:'00123',label:'SYNTHETIC'};
 Object.assign(rows[0],{action:'new',assessmentTypeId:'general-neurology',stayId:'0009',patientChoice:p.id,confirmed:true});
 Object.assign(rows[1],{target:'batch:'+rows[0].id,note:'Synthetic title and session confirmed',confirmed:true});
 const built=buildImport(rows,emptyState(),[p]);const state=applyOperations(emptyState(),built.operations);const a=Object.values(state.assessments)[0];assert.equal(a.patientId,p.id);assert.equal(a.stayId,'0009');assert.equal(a.attachments.length,1);assert.equal(built.count,2);
});
test('duplicates do not multiply assessments; changed session becomes retained revision until explicit selection',async()=>{
 const s=await sampleOperations();const state=applyOperations(emptyState(),s.operations);
 let rows=await inspectFiles([makeFile('again.csv',s.csv)],state,[]);assert.equal(rows[0].status,'duplicate');assert.equal(rows[0].included,false);
 rows=await inspectFiles([makeFile('revised.csv',await fixture('revised-same-session.csv'))],state,[]);const r=rows[0];assert.equal(r.status,'revision');assert.ok(r.changes.includes('tmt_a_s'));
 Object.assign(r,{action:'keep',assessmentTypeId:'general-neurology',confirmed:true,note:'Changed source export reviewed'});let built=buildImport(rows,state);let updated=applyOperations(state,built.operations);let a=updated.assessments[s.assessment.id];assert.equal(a.revisions.length,2);assert.equal(a.selectedRevisionId,s.revision.id);
 r.action='select';built=buildImport(rows,state);updated=applyOperations(state,built.operations);a=updated.assessments[s.assessment.id];assert.equal(a.selectedRevisionId,a.revisions[1].id);
 r.patientChoice='unresolved';assert.throws(()=>buildImport(rows,state),/Patientenkonflikt/);
});
test('session collision can be explicitly separated, IDs never enter internal paths; no patient demographic merge',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),s.operations);const rows=await inspectFiles([makeFile('collision.csv',await fixture('revised-same-session.csv'))],state,[]);
 Object.assign(rows[0],{action:'separate',assessmentTypeId:'general-neurology',confirmed:true,patientChoice:'unresolved',stayId:'008',note:'Restored/copied session ID collision explicitly reviewed'});
 const next=applyOperations(state,buildImport(rows,state).operations);assert.equal(Object.keys(next.assessments).length,2);assert.equal(Object.values(next.assessments).filter(a=>a.patientId===null).length,1);assert.equal(Object.keys(next.patients).length,1);
});
test('ambiguous PDF names stay unresolved, unlinked originals can be assigned later with history',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),s.operations);const rows=await inspectFiles([makeFile('renamed.pdf',syntheticPdf())],state,[]);assert.deepEqual(rows[0].suggestions,[]);assert.throws(()=>buildImport(rows,state),/bestätigen/);
 Object.assign(rows[0],{confirmed:true,target:'unlinked'});const next=applyOperations(state,buildImport(rows,state).operations);const id=Object.keys(next.unlinked)[0];assert.ok(id);
 const assigned=applyOperations(next,[{type:'attachment.link',attachmentId:id,assessmentId:s.assessment.id,note:'Confirmed from original synthetic report'}]);assert.equal(Object.keys(assigned.unlinked).length,0);assert.equal(assigned.assessments[s.assessment.id].attachments[0].method,'explicit-later-assignment');assert.equal(assigned.history.length,3);
});
test('equivalent formatting is preserved as a reviewed original revision; same-session batch conflicts require sequential review',async()=>{
 const data=new TextEncoder().encode('session_uuid;tmt_a_s\n"sess_old";"12"');const rows=await inspectFiles([makeFile('a.csv',data),makeFile('b.csv',new TextEncoder().encode('tmt_a_s;session_uuid\n"12.00";"sess_old"'))],emptyState(),[]);
 for(const r of rows)Object.assign(r,{action:'new',assessmentTypeId:'general-neurology',confirmed:true,stayId:'1'});assert.throws(()=>buildImport(rows,emptyState()),/nacheinander/);
 const built=buildImport([rows[0]],emptyState());const state=applyOperations(emptyState(),built.operations);const revision=await inspectFiles([makeFile('b.csv',rows[1].data)],state,[]);assert.equal(revision[0].equivalent,true);assert.equal(revision[0].status,'revision');
});
test('new CSV imports require an explicitly selected supported assessment type',async()=>{
 const rows=await inspectFiles([makeFile('new.csv',await fixture())],emptyState(),[]);
 Object.assign(rows[0],{action:'new',confirmed:true,stayId:'0009'});
 assert.throws(()=>buildImport(rows,emptyState()),/Untersuchungsart/);
 rows[0].assessmentTypeId='invented-type';assert.throws(()=>buildImport(rows,emptyState()),/Untersuchungsart/);
 rows[0].assessmentTypeId='epilepsy-localisation';const next=applyOperations(emptyState(),buildImport(rows,emptyState()).operations);assert.equal(Object.values(next.assessments)[0].assessmentTypeId,'epilepsy-localisation');
});
