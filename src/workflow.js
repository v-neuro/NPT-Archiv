import { Archive } from './archive.js';
import { scanLibrary } from './library.js';
import { saveOutcome } from './save-status.js';
import { fail, uid, text } from './shared.js';
import { validAssessmentType } from './assessment-types.js';

export function buildAssignment(state,assessmentId,{identifier,stayId,assessmentTypeId,reason}) {
  const assessment=state.assessments[assessmentId];if(!assessment)fail('Untersuchung nicht gefunden.');
  if(typeof identifier!=='string'||identifier!==''&&!/^[0-9]{1,100}$/.test(identifier))fail('iMed Patienten-ID: nur Ziffern eingeben.');
  if(typeof stayId!=='string'||!/^[0-9]{1,100}$/.test(stayId))fail('Numerische Aufenthalts-ID erforderlich.');
  if(!text(reason,2000)||!reason.trim())fail('Grund für die Änderung erforderlich.');
  if(assessmentTypeId&&!validAssessmentType(assessmentTypeId))fail('Untersuchungsart wird nicht unterstützt.');
  const operations=[];
  let patient=Object.values(state.patients).find(p=>p.identifier===identifier);
  if(identifier&&!patient){patient={id:uid(),identifier,label:''};operations.push({type:'patient.create',patient});}
  if(assessment.patientId!==(patient?.id??null))operations.push({type:'patient.link',assessmentId,patientId:patient?.id??null,reason});
  if(assessment.stayId!==stayId)operations.push({type:'stay.update',assessmentId,stayId,reason});
  if(assessmentTypeId&&assessment.assessmentTypeId!==assessmentTypeId)operations.push({type:'assessment.type.set',assessmentId,assessmentTypeId,reason});
  if(!operations.length)fail('Keine Änderungen zu speichern.');
  return operations;
}

export function importReceipt(built,plan,draft) {
  const ops=built.operations;
  return {identifier:draft.identifier,stayId:draft.stayId,actor:built.actor,
    assessmentIds:[...new Set(ops.map(op=>op.assessmentId??op.assessment?.id).filter(Boolean))],
    csvCount:ops.filter(op=>op.type==='revision.add').length,pdfCount:ops.filter(op=>op.type==='attachment.add').length,
    newCount:ops.filter(op=>op.type==='assessment.create').length,skippedCount:plan.duplicateCount,
    files:built.count};
}
export async function recheckConnection(archive,attempt=null,onProgress=()=>{}) {
  const memory=new Map(),snapshot=await scanLibrary(archive.storage,{deep:true,memory,onProgress});
  if(snapshot.manifest.archiveId!==archive.snapshot.manifest.archiveId)fail('Dieser Ordner gehört zu einer anderen Bibliothek. Bitte die bisherige Bibliothek erneut auswählen.');
  return {archive:new Archive(archive.storage,snapshot,memory),outcome:saveOutcome(snapshot,attempt)};
}
