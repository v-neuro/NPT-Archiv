import { measurementLabel } from './measurement-labels.js';
export const SUMMARY_MEASURES = Object.freeze([
  ['tmt_a_s','TMT A','Sekunden','tmt_a'],['tmt_b_s','TMT B','Sekunden','tmt_b'],
  ['vlmt_sum_dg1_5','VLMT · Lerndurchgänge 1–5','Quellwert','vlmt'],
  ['moca_total','MoCA · Gesamtwert','Punkte','moca'],['ace_total','ACE-III · Gesamtwert','Punkte','ace'],
  ['phq9_total','PHQ-9','Punkte','phq9'],['gad7_total','GAD-7','Punkte','gad7'],['gds_total','GDS','Punkte','gds'],
  ['rey_copy_total','Rey/Taylor · Gesamtwert','Punkte','rey_copy'],
  ['rey_copy_subtotal','Rey/Taylor · Zwischensumme','Punkte','rey_copy'],
  ['qolie31_overall','QOLIE-31 · Gesamtwert','Quellwert','qolie31'],
]);
export function hasSourceMeasure(document, key) {
  if(document?.projected){
    const index=document.sourceFields?.indexOf(key)??-1;
    return index>=0 && document.presentFieldIndices.includes(index);
  }
  const cell=document?.raw?.[key];
  return Boolean(cell && !cell.missing && cell.raw !== '');
}
export function sourceFieldsOf(document) {
  return document?.projected ? document.sourceFields ?? [] : document?.headers ?? [];
}
export function archiveFields(assessments) {
  const fields=new Set();
  for(const assessment of assessments)for(const revision of assessment.revisions)for(const key of sourceFieldsOf(revision.document))fields.add(key);
  return [...fields].sort((a,b)=>a.localeCompare(b,'de'));
}
export const fieldLabel = measurementLabel;
// Eligibility for display/filter choices only. Never converts saved source values
// or infers administration from a default numeric value.
export function isNumericSourceValue(value) {
  return typeof value==='string' && /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value.replace(',','.')));
}
export function isPerformanceField(key) {
  if(/^(?:(?:session|demographics|testing)(?:_|$)|sessionUUID$|assessment_session_uuid$)/i.test(key))return false;
  if(/(?:^|_)(?:id|uuid|identifier|note|notes|comment|comments|transcript|transcription|version|scoring|policy|aborted|abort|completed|complete|partial|answered|entry|mode|validation|flag|status|selected)(?:_|$)/i.test(key))return false;
  return !/(?:_(?:answered|scored)_count|_health_answered|_education_years|_education_correction|_(?:age|gender|sex|date|timestamp|dom_hand))$/i.test(key);
}
export function hasPerformanceValue(document,key) {
  if(!isPerformanceField(key))return false;
  if(document?.projected){const index=document.sourceFields?.indexOf(key)??-1;return index>=0&&document.numericPerformanceFieldIndices.includes(index);}
  return hasSourceMeasure(document,key)&&isNumericSourceValue(document.raw[key].raw);
}
export function performanceFields(assessments) {
  const keys=new Set();
  for(const a of assessments){const doc=a.revisions.find(r=>r.id===a.selectedRevisionId)?.document;if(!doc)continue;if(doc.projected){for(const index of doc.numericPerformanceFieldIndices)keys.add(doc.sourceFields[index]);}else for(const key of sourceFieldsOf(doc))if(hasPerformanceValue(doc,key))keys.add(key);}
  return [...keys].sort((a,b)=>a.localeCompare(b,'de'));
}
export function performanceContext(document,key) {
  const parts=key.split('_'),hints=[];
  for(let n=1;n<parts.length;n++){
    const prefix=parts.slice(0,n).join('_');
    const context=measureContext(document,prefix).filter(value=>value!=='Durchführung/Vollständigkeit aus diesem Wert allein nicht gesichert');
    for(const value of context)hints.push(`${prefix}: ${value}`);
  }
  return hints.length?[...new Set(hints)]:['Durchführung/Vollständigkeit aus diesem Wert allein nicht gesichert'];
}
export function measureContext(document, family) {
  const raw = document?.raw ?? {};
  const value = key => raw[key]?.raw;
  const context = [];
  if (value(`${family}_aborted`) === '1' || (family.startsWith('tmt_') && value('tmt_aborted') === '1')) context.push('Abgebrochen laut Export');
  if (value(`${family}_entry_mode`) === 'manual') context.push('Manuell eingegeben');
  if (value(`${family}_completed`) === '0' || value(`${family}_scored_completed`) === '0' || value(`${family}_overall_partial`) === '1') context.push('Unvollständig laut Export');
  if (value(`${family}_completed`) === '1') context.push('Als vollständig exportiert');
  for (const [suffix,label] of [['version','Variante'],['scoring','Bewertung'],['scoring_version','Bewertungsversion']]) {
    if (value(`${family}_${suffix}`)) context.push(`${label}: ${value(`${family}_${suffix}`)}`);
  }
  if (value(`${family}_overall_policy`)) context.push(`Berechnung laut Quelle: ${value(`${family}_overall_policy`)}`);
  return context.length ? context : ['Durchführung/Vollständigkeit aus diesem Wert allein nicht gesichert'];
}
