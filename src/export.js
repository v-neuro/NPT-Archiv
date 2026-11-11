import { APP_VERSION, encoder, fail } from './shared.js';
import { Archive } from './archive.js';
import { scanLibrary } from './library.js';
import { selectedRevision, isExcluded } from './model.js';
import { sourceFieldsOf, isNumericSourceValue } from './summary.js';
import { assessmentTypeLabel } from './assessment-types.js';

function integrityFailure(message) {const error=new Error(message);error.requiresArchiveCheck=true;throw error;}
const META_COLUMNS=['format','app_version','patient_id','stay_id','assessment_id','assessment_type_id','assessment_type','excluded','date','original_date','source_session_id','selected_revision_id','csv_name','csv_sha256','parser_version','producer_version','imported_at','import_actor','snapshot_head','absent_fields','missing_fields','escaped_fields'].map(key=>'archive.'+key);
export function selectedExportAssessments(state,kind,ids) {
  const selected=new Set(ids);
  if(!selected.size)fail('Zuerst Patienten oder Untersuchungen auswählen.');
  const collection=kind==='patients'?state.patients:kind==='assessments'?state.assessments:null;
  if(!collection)fail('Exportauswahl ungültig.');
  for(const id of selected)if(!collection[id])fail('Ein ausgewählter Eintrag ist nicht mehr verfügbar. Auswahl erneut prüfen.');
  const rows=Object.values(state.assessments).filter(a=>kind==='patients'?selected.has(a.patientId):selected.has(a.id));
  if(!rows.length)fail('Die ausgewählten Patienten haben noch keine Untersuchungen.');
  return rows.sort((a,b)=>String(state.patients[a.patientId]?.identifier??'').localeCompare(String(state.patients[b.patientId]?.identifier??''),undefined,{numeric:true})||String(state.patients[a.patientId]?.identifier??'').localeCompare(String(state.patients[b.patientId]?.identifier??''))||(selectedRevision(a)?.document.date??'').localeCompare(selectedRevision(b)?.document.date??'')||a.id.localeCompare(b.id));
}
export function exportSourceFields(assessments) {
  return [...new Set(assessments.flatMap(a=>sourceFieldsOf(selectedRevision(a)?.document)))].sort((a,b)=>a.localeCompare(b,'de'));
}
function quote(value) { return '"'+String(value).replace(/"/g,'""')+'"'; }
export function exportCell(cell,key,escaped=[]) {
  if(cell==null||cell.missing)return '';
  let raw=typeof cell==='object'?cell.raw:String(cell);
  if(!isNumericSourceValue(raw)&&(/^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(raw)||/^[\t\r\n]/.test(raw))){raw="'"+raw;escaped.push(key);}
  return quote(raw);
}
export function csvExportHeader(sourceFields) { return '\uFEFF'+[...META_COLUMNS,...sourceFields].map(quote).join(';')+'\r\n'; }
export function csvExportRow(assessment,state,sourceFields,head,audit=null) {
  const revision=selectedRevision(assessment);if(!revision||revision.document.projected)fail('Für den Export fehlen geprüfte Originalwerte.');
  const document=revision.document,entry=audit?audit.get(revision.id):state.history.find(h=>h.operations.some(o=>o.type==='revision.add'&&o.revision.id===revision.id)),escaped=[];
  const originalCells=sourceFields.map(key=>exportCell(Object.hasOwn(document.raw,key)?document.raw[key]:null,key,escaped));
  const values=['digitale-npt-tabular-export/1',APP_VERSION,state.patients[assessment.patientId]?.identifier??'',assessment.stayId,assessment.id,assessment.assessmentTypeId??'',assessmentTypeLabel(assessment.assessmentTypeId),isExcluded(assessment)?'1':'0',document.date??'',document.dateText??'',assessment.sessionId,revision.id,revision.original.name,revision.original.hash,document.parserVersion,document.producerVersion??'',entry?.createdAt??'',entry?.actor??'',head??'',JSON.stringify(sourceFields.filter(key=>!Object.hasOwn(document.raw,key))),JSON.stringify(sourceFields.filter(key=>document.raw[key]?.missing)),null];
  const metadata=values.slice(0,-1).map((value,index)=>exportCell(value,META_COLUMNS[index],escaped));metadata.push(quote(JSON.stringify(escaped)));
  return [...metadata,...originalCells].join(';')+'\r\n';
}
export async function exportArchiveCsv(archive,kind,ids,onProgress=()=>{}) {
  if(archive.snapshot.readOnly)fail('Bibliothek vor dem Export prüfen.');
  const originalHead=archive.snapshot.head,memory=new Map();
  let verified;try{verified=await scanLibrary(archive.storage,{verifyRecords:true,memory});}catch{integrityFailure('Die Bibliothek konnte nicht gelesen werden. Ordnerzugriff prüfen und Bibliothek neu öffnen.');}
  if(verified.readOnly)integrityFailure('Die Bibliothek konnte nicht geprüft werden. Kein CSV wurde erstellt.');
  if(verified.head!==originalHead||verified.manifest.archiveId!==archive.snapshot.manifest.archiveId)integrityFailure('Die Bibliothek wurde inzwischen geändert. Neu öffnen und Exportauswahl prüfen.');
  const assessments=selectedExportAssessments(verified.state,kind,ids),fields=exportSourceFields(assessments),reader=new Archive(archive.storage,verified,memory);
  const audit=new Map();for(const entry of verified.state.history)for(const op of entry.operations)if(op.type==='revision.add')audit.set(op.revision.id,entry);
  const chunks=[csvExportHeader(fields)];let size=encoder.encode(chunks[0]).length;
  for(let index=0;index<assessments.length;index++){
    let full;try{full=await reader.assessmentDetail(assessments[index].id);}catch{integrityFailure('Eine ausgewählte CSV-Quelle ist nicht mehr lesbar oder wurde verändert. Kein CSV wurde erstellt. Bibliothek prüfen.');}
    const line=csvExportRow(full,verified.state,fields,verified.head,audit);size+=encoder.encode(line).length;
    if(size>128*1024*1024)fail('CSV-Export ist zu groß. Bitte weniger Einträge auswählen.');
    chunks.push(line);onProgress(index+1,assessments.length);
  }
  let after;try{after=await scanLibrary(archive.storage,{memory});}catch{integrityFailure('Die Bibliothek ist nicht mehr erreichbar. Kein CSV wurde heruntergeladen. Bibliothek neu öffnen.');}
  if(after.readOnly||after.head!==verified.head||after.manifest.archiveId!==verified.manifest.archiveId)integrityFailure('Die Bibliothek hat sich während des Exports geändert. Kein CSV wurde heruntergeladen. Neu öffnen und erneut auswählen.');
  return {chunks,count:assessments.length,patients:new Set(assessments.map(a=>a.patientId)).size,excluded:assessments.filter(isExcluded).length};
}
