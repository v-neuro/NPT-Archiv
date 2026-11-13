import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildAssignment} from '../src/workflow.js';
import {saveFeedbackExpired} from '../src/save-status.js';
import {buildAssessmentPdf} from '../src/import.js';
import {applyOperations,emptyState,objectPath} from '../src/model.js';
import {sampleOperations,makeFile,syntheticPdf,DiskStorage} from './support.mjs';
import {Archive} from '../src/archive.js';
import {createArchive} from '../src/storage.js';
import {uid,MAX_FILE} from '../src/shared.js';

test('typed reassignment finds exact identifiers among many patients and atomically creates a new ID only when needed',async()=>{
 const s=await sampleOperations(),operations=Array.from({length:600},(_,index)=>({type:'patient.create',patient:{id:uid(),identifier:String(index+1000).padStart(8,'0'),label:''}}));
 const initial=applyOperations(emptyState(),s.operations),before=applyOperations(applyOperations(initial,operations.slice(0,300)),operations.slice(300)),values={identifier:'00001599',stayId:'000004',assessmentTypeId:'memory-clinic',reason:'SYNTHETIC typed correction'};
 const found=buildAssignment(before,s.assessment.id,values);assert.ok(!found.some(o=>o.type==='patient.create'));assert.equal(applyOperations(before,found).assessments[s.assessment.id].patientId,operations.at(-1).patient.id);
 const created=buildAssignment(before,s.assessment.id,{...values,identifier:'00000007'}),after=applyOperations(before,created),patient=Object.values(after.patients).find(p=>p.identifier==='00000007');assert.equal(after.assessments[s.assessment.id].patientId,patient.id);assert.equal(after.assessments[s.assessment.id].stayId,'000004');assert.equal(Object.keys(after.patients).length,602);assert.equal(Object.keys(before.patients).length,601);
 assert.equal(applyOperations(before,buildAssignment(before,s.assessment.id,{...values,identifier:''})).assessments[s.assessment.id].patientId,null);
 for(const identifier of ['1e3','-1','12 34',123,'9'.repeat(101)])assert.throws(()=>buildAssignment(before,s.assessment.id,{...values,identifier}),/Ziffern/);
 assert.throws(()=>buildAssignment(before,s.assessment.id,{...values,reason:''}),/Grund/);
 assert.throws(()=>buildAssignment(before,s.assessment.id,{...values,identifier:s.patient.identifier,stayId:s.assessment.stayId,assessmentTypeId:''}),/Keine Änderungen/);
 const patientOnly=buildAssignment(before,s.assessment.id,{...values,stayId:s.assessment.stayId,assessmentTypeId:''});assert.deepEqual(patientOnly.map(o=>o.type),['patient.link']);
});

test('assessment PDF additions enforce names/signatures/limits and reuse bytes without duplicating the same link',async()=>{
 const s=await sampleOperations(),state=applyOperations(emptyState(),s.operations),a=state.assessments[s.assessment.id],data=syntheticPdf();
 const built=await buildAssessmentPdf(makeFile('synthetic.pdf.pdf',data),a),next=applyOperations(state,built.operations),attachment=next.assessments[a.id].attachments[0];assert.equal(attachment.method,'filename-prefix-50');assert.equal(attachment.name,'synthetic.pdf.pdf');assert.equal(built.files.get(attachment.hash).length,data.length);assert.equal(a.attachments.length,0);
 const duplicate=await buildAssessmentPdf(makeFile('synthetic.pdf',data),next.assessments[a.id]);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.operations.length,0);assert.equal(duplicate.files.size,0);
 await assert.rejects(buildAssessmentPdf(makeFile('wrong.pdf',data),a),/Dateiname/);await assert.rejects(buildAssessmentPdf(makeFile('synthetic.csv',data),a),/PDF-Datei/);await assert.rejects(buildAssessmentPdf(makeFile('synthetic.pdf',new TextEncoder().encode('not a pdf')),a),/Dateisignatur/);await assert.rejects(buildAssessmentPdf({name:'synthetic.pdf',size:MAX_FILE+1},a),/32 MiB/);
 const prefix='A'.repeat(50),long={...a,revisions:[{...a.revisions[0],original:{...a.revisions[0].original,name:prefix+'csv-end.csv'}}]};assert.equal((await buildAssessmentPdf(makeFile(prefix+'other-end.pdf.pdf',data),long)).duplicate,false);
});

test('direct PDF and typed patient assignment survive folder-only reopen while source CSV bytes stay intact',async t=>{
 const root=await mkdtemp(join(tmpdir(),'npt-details-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);const archive=await Archive.open(storage,{compact:true}),s=await sampleOperations();await archive.commit(s.operations,s.files,'TEST');
 const pdf=await buildAssessmentPdf(makeFile('synthetic.pdf.pdf',syntheticPdf()),archive.snapshot.state.assessments[s.assessment.id]);await archive.commit(pdf.operations,pdf.files,'PDF');await archive.commit(buildAssignment(archive.snapshot.state,s.assessment.id,{identifier:'000777',stayId:'000888',assessmentTypeId:'memory-clinic',reason:'SYNTHETIC typed edit'}));
 const reopened=await Archive.open(storage,{compact:true}),a=await reopened.assessmentDetail(s.assessment.id);assert.equal(reopened.snapshot.state.patients[a.patientId].identifier,'000777');assert.equal(a.stayId,'000888');assert.equal(a.attachments.length,1);assert.deepEqual(await readFile(storage.path(objectPath(s.revision.original))),Buffer.from(s.csv));
});

test('only successful settled verification feedback expires at five seconds; errors and unresolved saves remain',()=>{
 const feedback={outcome:'saved',needsCheck:false,dismissAt:6000};assert.equal(saveFeedbackExpired(feedback,5999),false);assert.equal(saveFeedbackExpired(feedback,6000),true);assert.equal(saveFeedbackExpired(feedback,10000),true);
 for(const other of [{...feedback,needsCheck:true},{...feedback,outcome:'uncertain'},{...feedback,outcome:'not-saved'},{...feedback,dismissAt:null},null])assert.equal(saveFeedbackExpired(other,10000),false);
});
