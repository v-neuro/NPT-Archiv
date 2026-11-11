import { Archive } from './archive.js';
import { scanLibrary } from './library.js';
import { saveOutcome } from './save-status.js';
import { fail } from './shared.js';

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
