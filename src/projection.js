import { SUMMARY_MEASURES, hasSourceMeasure, hasPerformanceValue, isPerformanceField } from './summary.js';
import { validateDocument } from './model.js';
export const PROJECTION_VERSION = 3;
const fields = new Set(['session_uuid','demographics_patient_initials','demographics_patient_age','demographics_patient_gender','demographics_examiner_initials',...SUMMARY_MEASURES.map(m=>m[0])]);
export function projectDocument(document, sourceFieldLayout = 0) {
  validateDocument(document,document.sessionId);
  const headers = document.headers.filter(key => fields.has(key) || /_(aborted|completed|scored_completed|overall_partial|entry_mode|version|scoring|scoring_version|overall_policy|answered_count)$/.test(key));
  const raw = Object.fromEntries(headers.map(key => [key,document.raw[key]]));
  const normalized = Object.fromEntries(headers.map(key => [key,document.normalized[key]]));
  const {parserVersion,producerVersion,sessionId,date,dateText,timeText,timezone,signature,semanticHash} = document;
  return {projected:true,projectionVersion:PROJECTION_VERSION,parserVersion,producerVersion,sessionId,date,dateText,timeText,timezone,signature,semanticHash,
    headers,raw,normalized,sourceFieldLayout,presentFieldIndices:document.headers.flatMap((key,index)=>hasSourceMeasure(document,key)?[index]:[]),
    numericPerformanceFieldIndices:document.headers.flatMap((key,index)=>hasPerformanceValue(document,key)?[index]:[]),
    sourceHeaderCount:document.headers.length,unknownFieldCount:document.unknownFields.length,warnings:[]};
}
export function projectRecord(record, source) {
  const fieldLayouts=[],layouts=new Map();
  function layout(document){const signature=JSON.stringify(document.headers);if(!layouts.has(signature)){layouts.set(signature,fieldLayouts.length);fieldLayouts.push([...document.headers]);}return layouts.get(signature);}
  const operations = record.payload.operations.map(op => op.type === 'revision.add' ? {...op,revision:{...op.revision,
    sourceRecordId:record.payload.id,sourceChecksum:record.checksum,document:projectDocument(op.revision.document,layout(op.revision.document))}} : op);
  return hydrateFieldInventory({checksum:record.checksum,payload:{...record.payload,operations},source,fieldLayouts});
}
export function hydrateFieldInventory(record) {
  if(!Array.isArray(record.fieldLayouts))throw Error('Feldübersicht fehlt.');
  for(const fields of record.fieldLayouts)if(!Array.isArray(fields)||fields.length>2000||fields.some(key=>typeof key!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,149}$/.test(key)||['constructor','prototype'].includes(key))||new Set(fields).size!==fields.length)throw Error('Feldübersicht ungültig.');
  for(const op of record.payload.operations)if(op.type==='revision.add'){
    const doc=op.revision.document,fields=record.fieldLayouts[doc.sourceFieldLayout];
    if(!Number.isInteger(doc.sourceFieldLayout)||!fields||doc.sourceHeaderCount!==fields.length||!Array.isArray(doc.presentFieldIndices)||doc.presentFieldIndices.some((index,i)=>!Number.isInteger(index)||index<0||index>=fields.length||i>0&&index<=doc.presentFieldIndices[i-1])||doc.headers.some(key=>!fields.includes(key)))throw Error('Feldübersicht passt nicht zur Untersuchung.');
    if(!Array.isArray(doc.numericPerformanceFieldIndices)||doc.numericPerformanceFieldIndices.some((index,i)=>!Number.isInteger(index)||index<0||index>=fields.length||!doc.presentFieldIndices.includes(index)||!isPerformanceField(fields[index])||i>0&&index<=doc.numericPerformanceFieldIndices[i-1]))throw Error('Numerische Messwertübersicht ungültig.');
    // Share names within each record instead of duplicating hundreds of strings
    // in every revision. The reference is runtime-only; JSON keeps the dictionary once.
    Object.defineProperty(doc,'sourceFields',{value:fields,enumerable:false,configurable:true});
  }
  return record;
}
