// Runtime-only save evidence. Authoritative recovery always comes from folder files.
export function newSaveAttempt(snapshot) {
  return {archiveId:snapshot.manifest.archiveId,parent:snapshot.head,recordId:null,checksum:null,recordWriteStarted:false,outcome:'not-saved'};
}
export const saveFeedbackExpired = (feedback,now=Date.now()) => feedback?.outcome==='saved'&&!feedback.needsCheck&&Number.isFinite(feedback.dismissAt)&&now>=feedback.dismissAt;
export function saveOutcome(snapshot,attempt) {
  if(snapshot.readOnly)return 'uncertain';
  if(!attempt)return 'not-saved';
  if(snapshot.manifest.archiveId!==attempt.archiveId)return 'uncertain';
  if(attempt.recordId){
    const found=snapshot.records.find(record=>record.payload.id===attempt.recordId);
    if(found)return found.checksum===attempt.checksum?'saved':'uncertain';
  }
  // A rolled-back/replaced folder is not evidence that the attempted save failed.
  if(attempt.parent&&!snapshot.records.some(record=>record.checksum===attempt.parent))return 'uncertain';
  return 'not-saved';
}
