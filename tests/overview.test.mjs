import test from 'node:test';
import assert from 'node:assert/strict';
import {patientLabel,patientInitials,matchesOverview} from '../src/overview.js';
import {applyOperations,emptyState,selectedRevision} from '../src/model.js';
import {projectDocument} from '../src/projection.js';
import {sampleOperations} from './support.mjs';

test('CSV initials appear beside the ID in full and compact archives, keeping leading zeros',async()=>{
  const sample=await sampleOperations(),state=applyOperations(emptyState(),sample.operations);
  const a=state.assessments[sample.assessment.id],p=state.patients[a.patientId];
  assert.equal(patientLabel(p,patientInitials([a]).get(p.id)),'000123 (SYNTH) · SYNTHETISCH');
  const compact=structuredClone(a);selectedRevision(compact).document=projectDocument(selectedRevision(a).document);
  assert.equal(patientLabel(p,patientInitials([compact]).get(p.id)),'000123 (SYNTH) · SYNTHETISCH');
  assert.equal(patientLabel({...p,label:'Hinweis'},' SYNTH '),'000123 (SYNTH) · Hinweis');
  assert.equal(patientLabel(p),'000123 · SYNTHETISCH');assert.equal(patientLabel(null),'Nicht zugeordnet');
});

test('patient initials follow selected source revisions and the latest examination date',async()=>{
  const sample=await sampleOperations(),state=applyOperations(emptyState(),sample.operations),a=state.assessments[sample.assessment.id];
  const later=structuredClone(a),doc=selectedRevision(later).document;
  doc.date='2026-05-01';doc.raw.demographics_patient_initials.raw='NEW';
  assert.equal(patientInitials([later,a]).get(a.patientId),'NEW');
  doc.raw.demographics_patient_initials.raw='';assert.equal(patientInitials([a,later]).get(a.patientId),'SYNTH');
  const revision=structuredClone(later.revisions[0]);revision.id='new-revision';revision.document.raw.demographics_patient_initials.raw='REV';
  later.revisions.push(revision);later.selectedRevisionId=revision.id;
  assert.equal(patientInitials([a,later]).get(a.patientId),'REV');
});

test('both overview menus match gender, initials and clinical filters against the same examination',async()=>{
  const sample=await sampleOperations(),state=applyOperations(emptyState(),sample.operations),a=state.assessments[sample.assessment.id],p=state.patients[a.patientId];
  a.clinical={diagnosis:'Synthetische Diagnose',diagnosisStatus:'confirmed',dementiaType:null,affectedHemisphere:null};
  for(const compact of [false,true]){
    const entry=structuredClone(a);if(compact){selectedRevision(entry).document=projectDocument(selectedRevision(a).document);selectedRevision(entry).document.sourceFields=selectedRevision(a).document.headers;}
    for(const query of ['sYnTh','DIVERS','000123','0000456','2026-01-15'])assert.equal(matchesOverview(entry,p,{query}),true,query);
    const filters={type:a.assessmentTypeId,status:'included',measure:'tmt_a_s',clinical:{gender:'divers',age:'50',diagnosis:'Diagnose',diagnosisStatus:'confirmed'}};
    assert.equal(matchesOverview(entry,p,filters),true);
    for(const clinical of [{gender:'weiblich'},{age:'>50'},{diagnosisStatus:'suspected'}])assert.equal(matchesOverview(entry,p,{...filters,clinical:{...filters.clinical,...clinical}}),false);
    assert.equal(matchesOverview(entry,p,{...filters,type:'memory-clinic'}),false);
    entry.excluded=true;assert.equal(matchesOverview(entry,p,filters),false);assert.equal(matchesOverview(entry,p,{...filters,status:'excluded'}),true);
    assert.equal(matchesOverview(entry,p,{...filters,status:'all'}),true);
  }
});

test('missing demographics do not match an active gender or age filter',()=>{
  const a={stayId:'0001',assessmentTypeId:null,revisions:[],selectedRevisionId:null};
  assert.equal(matchesOverview(a,null,{}),true);
  assert.equal(matchesOverview(a,null,{clinical:{gender:'divers'}}),false);
  assert.equal(matchesOverview(a,null,{clinical:{age:'50'}}),false);
});
