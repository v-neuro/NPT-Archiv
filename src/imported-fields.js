import { measurementGroup,measurementLabel } from './measurement-labels.js';

const metadataLabels={
  session_uuid:'Quellsitzung',sessionUUID:'Quellsitzung',sessionUuid:'Quellsitzung',session_id:'Quellsitzung',assessment_session_uuid:'Quellsitzung',
  demographics_patient_initials:'Patientenkürzel aus dem Export',demographics_patient_age:'Alter',demographics_patient_gender:'Geschlecht',demographics_examiner_initials:'Untersucherkürzel',
  demographics_education_school_years:'Schulbildung · Jahre',demographics_education_school_label:'Schulabschluss',demographics_education_training_label:'Ausbildung / Studium',demographics_education_dissertation_years:'Promotion · Jahre',demographics_education_training_years:'Ausbildung / Studium · Jahre',demographics_education_years:'Bildungsjahre gesamt',
  testing_start_date:'Untersuchungsdatum',testing_start_time:'Uhrzeit',
  rwt_phon_simple_version:'Phonemisch einfach · Version',rwt_phon_complex_version:'Phonemisch komplex · Version',rwt_sem_simple_version:'Semantisch einfach · Version',rwt_sem_complex_version:'Semantisch komplex · Version',
};
const suffixLabels=[['scoring_version','Bewertungsversion'],['entry_mode','Eingabemodus'],['overall_policy','Berechnungsregel laut Quelle'],['version','Version / Variante'],['scoring','Bewertungssystem'],['scored_completed','Bewertung vollständig · Quellkennzeichen'],['overall_partial','Teilweise Auswertung · Quellkennzeichen'],['completed','Vollständigkeit · Quellkennzeichen'],['complete','Vollständigkeit · Quellkennzeichen'],['scored_answered_count','Anzahl beantworteter, bewerteter Items'],['answered_count','Anzahl beantworteter Items'],['scored_count','Anzahl bewerteter Elemente'],['validation_errors','Prüfhinweise aus dem Export'],['abort_reason','Abbruchgrund'],['abort_note','Abbruchnotiz'],['aborted','Abbruch · Quellkennzeichen'],['notes','Notizen'],['note','Notiz'],['transcript','Transkript'],['education_years','Bildungsjahre'],['education_correction','Bildungskorrektur'],['dom_hand','Dominante Hand']];
export function importedFieldLabel(key){
  if(Object.hasOwn(metadataLabels,key))return metadataLabels[key];
  const label=measurementLabel(key),group=measurementGroup(key);
  if(label!==key)return label.slice(0,-(' · '+key).length).replace(group+' · ','');
  for(const [suffix,label] of suffixLabels)if(key.endsWith('_'+suffix))return label;
  return key;
}
export function importedCellState(document,key){
  if(!document?.raw||!Object.hasOwn(document.raw,key))return 'absent';
  const cell=document.raw[key];return cell.missing?'missing':cell.raw===''?'empty':'value';
}
export function isSourceVersionField(key){return /_(?:version|scoring|scoring_version|entry_mode|overall_policy)$/.test(key);}
// Group every observed header exactly once; a populated default is not evidence of administration.
export function importedFieldGroups(document){
  const groups=new Map();
  for(const key of document?.headers??[]){
    let id,label;
    if(key.startsWith('demographics_')&&key!=='demographics_examiner_initials'){id='demographics';label='Demografische Angaben';}
    else if(key.startsWith('testing_')||['session_uuid','sessionUUID','sessionUuid','session_id','assessment_session_uuid','demographics_examiner_initials'].includes(key)){id='examination';label='Angaben zur Untersuchung';}
    else{label=measurementGroup(key);id=label==='Weitere Felder'?'other':key.split('_')[0];if(id==='other')label='Weitere importierte Felder';}
    if(!groups.has(id))groups.set(id,{id,label,keys:[]});groups.get(id).keys.push(key);
  }
  const priority=group=>group.id==='demographics'?0:group.id==='examination'?1:group.id==='other'?3:2;
  return [...groups.values()].sort((a,b)=>priority(a)-priority(b)||a.label.localeCompare(b.label,'de')).map(group=>{
    const versionKeys=group.keys.filter(isSourceVersionField),keys=[...versionKeys,...group.keys.filter(key=>!isSourceVersionField(key))];
    return {...group,keys,versionKeys,presentCount:keys.filter(key=>importedCellState(document,key)==='value').length};
  });
}
