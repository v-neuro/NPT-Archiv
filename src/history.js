// Read-only history derived from accepted folder records; never from browser storage.
export function editDay(timestamp) {
  if(typeof timestamp!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(timestamp))return '';
  const date=new Date(timestamp);if(!Number.isFinite(date.getTime()))return '';
  return [String(date.getFullYear()).padStart(4,'0'),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function validHistoryFilters(filters={}) {
  return [['editFrom','editTo'],['assessmentFrom','assessmentTo']].every(([from,to])=>(!filters[from]||validDay(filters[from]))&&(!filters[to]||validDay(filters[to]))&&(!filters[from]||!filters[to]||filters[from]<=filters[to]));
}
export function matchesHistoryFilters(row,filters={}) {
  if(!validHistoryFilters(filters))return false;
  const within=(day,from,to)=>(!from&&!to)||Boolean(day)&&(!from||day>=from)&&(!to||day<=to);
  const needle=filters.patientId?.trim()??'';
  return within(row.editDate,filters.editFrom,filters.editTo)&&within(row.assessmentDate,filters.assessmentFrom,filters.assessmentTo)&&(!needle||row.patientIdentifiers.some(id=>id.includes(needle)));
}
export function recentChanges(state) {
  const contexts=new Map(),looseFiles=new Map(),rows=[];
  const identifier=id=>state.patients[id]?.identifier??'';
  for(const [commitIndex,entry] of state.history.entries()){
    const firstDates=new Map();for(const op of entry.operations)if(op.type==='revision.add'&&!firstDates.has(op.assessmentId))firstDates.set(op.assessmentId,op.revision.document.date??'');
    for(const [index,op] of entry.operations.entries()){
      const assessmentId=op.assessmentId??op.assessment?.id??null;
      let context=contexts.get(assessmentId),previousPatient=context?.patientId,label,reason=op.reason??op.revision?.reason??op.note??'',file=null,patientId;
      switch(op.type){
        case 'patient.create':patientId=op.patient.id;label='Patient angelegt';break;
        case 'assessment.create':
          context={patientId:op.assessment.patientId,stayId:op.assessment.stayId,date:firstDates.get(assessmentId)??'',selected:null,revisions:new Map()};contexts.set(assessmentId,context);label='Untersuchung angelegt';break;
        case 'revision.add':
          context.revisions.set(op.revision.id,{date:op.revision.document.date??'',original:op.revision.original});
          if(!context.selected){context.selected=op.revision.id;context.date=op.revision.document.date??'';}
          file=op.revision.original;label='CSV-Fassung hinzugefügt';break;
        case 'revision.select':context.selected=op.revisionId;context.date=context.revisions.get(op.revisionId)?.date??'';file=context.revisions.get(op.revisionId)?.original;label='Anzeigefassung ausgewählt';break;
        case 'patient.link':context.patientId=op.patientId;label='Patientenzuordnung geändert';break;
        case 'stay.update':context.stayId=op.stayId;label='Aufenthalts-ID geändert';break;
        case 'assessment.type.set':label='Untersuchungsart geändert';break;
        case 'assessment.clinical.set':label='Klinische Angaben gespeichert';break;
        case 'assessment.exclusion.set':label=op.excluded?'Datensatz ausgeschlossen':'Datensatz wieder eingeschlossen';break;
        case 'attachment.add':file=op.attachment;label=file.kind==='pdf'?'PDF hinzugefügt':'Datei hinzugefügt';break;
        case 'attachment.unlinked':file=op.attachment;looseFiles.set(file.id,file);label='Bericht ohne Zuordnung abgelegt';break;
        case 'attachment.link':file=looseFiles.get(op.attachmentId);looseFiles.delete(op.attachmentId);label='Bericht zugeordnet';break;
        default:label=op.type;
      }
      patientId??=context?.patientId;
      const currentAssessment=state.assessments[assessmentId],historical=identifier(patientId),before=op.type==='patient.link'?identifier(previousPatient):'',current=identifier(currentAssessment?.patientId);
      const patientIdentifiers=[...new Set([historical,before,current].filter(Boolean))];
      let patientLabel=historical||'Nicht zugeordnet';
      if(op.type==='patient.link')patientLabel=`${before||'Nicht zugeordnet'} → ${historical||'Nicht zugeordnet'}`;
      else if(currentAssessment&&current!==historical)patientLabel+=` (jetzt ${current||'nicht zugeordnet'})`;
      rows.push({id:`${entry.id??commitIndex}:${index}`,createdAt:entry.createdAt??'',editDate:editDay(entry.createdAt),actor:entry.actor??'',
        assessmentId,patientId:patientId??null,patientIdentifiers,patientLabel,assessmentDate:op.type==='revision.add'?op.revision.document.date??'':context?.date??'',
        stayId:context?.stayId??'',label,reason,file:file?{id:file.id,name:file.name,kind:file.kind}:null});
    }
  }
  return rows.reverse();
}
