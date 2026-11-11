import { SUMMARY_MEASURES } from './summary.js';
import { validateDocument } from './model.js';
export const PROJECTION_VERSION = 1;
const fields = new Set(['session_uuid','demographics_patient_initials','demographics_patient_age','demographics_patient_gender','demographics_examiner_initials',...SUMMARY_MEASURES.map(m=>m[0])]);
export function projectDocument(document) {
  validateDocument(document,document.sessionId);
  const headers = document.headers.filter(key => fields.has(key) || /_(aborted|completed|scored_completed|overall_partial|entry_mode|version|scoring|scoring_version|overall_policy|answered_count)$/.test(key));
  const raw = Object.fromEntries(headers.map(key => [key,document.raw[key]]));
  const normalized = Object.fromEntries(headers.map(key => [key,document.normalized[key]]));
  const {parserVersion,producerVersion,sessionId,date,dateText,timeText,timezone,signature,semanticHash} = document;
  return {projected:true,projectionVersion:PROJECTION_VERSION,parserVersion,producerVersion,sessionId,date,dateText,timeText,timezone,signature,semanticHash,
    headers,raw,normalized,sourceHeaderCount:document.headers.length,unknownFieldCount:document.unknownFields.length,warnings:[]};
}
export function projectRecord(record, source) {
  const operations = record.payload.operations.map(op => op.type === 'revision.add' ? {...op,revision:{...op.revision,
    sourceRecordId:record.payload.id,sourceChecksum:record.checksum,document:projectDocument(op.revision.document)}} : op);
  return {checksum:record.checksum,payload:{...record.payload,operations},source};
}
