import { fail, isObject, text, validHash, validId, PARSER_VERSION } from './shared.js';
import { validAssessmentType } from './assessment-types.js';

export const emptyState = () => ({ patients: {}, assessments: {}, unlinked: {}, history: [] });
export function validateAttachment(a) {
  if (!isObject(a) || !validId(a.id) || !validHash(a.hash) || !['csv', 'pdf'].includes(a.kind)
    || !Number.isInteger(a.size) || a.size < 1 || a.size > 32 * 1024 * 1024
    || !text(a.name, 255) || !text(a.method, 200) || !text(a.note, 2000)) fail('Ungültiger Originaldatei-Verweis.');
}
export function objectPath(a) { validateAttachment(a); return `objects/${a.hash.slice(0, 2)}/${a.hash}.${a.kind}`; }
export function validateDocument(doc, sessionId, projected = false) {
  if (!isObject(doc) || doc.parserVersion !== PARSER_VERSION || doc.sessionId !== sessionId
    || !Array.isArray(doc.headers) || doc.headers.length > 2000 || !isObject(doc.raw)
    || !isObject(doc.normalized) || !validHash(doc.semanticHash)) fail('Nicht unterstützter oder ungültiger CSV-Adapter.');
  if (doc.projected && !projected) fail('Eine Suchübersicht darf keine Originaldaten ersetzen.');
  for (const h of doc.headers) {
    const c = doc.raw[h];
    if (!isObject(c) || typeof c.raw !== 'string' || typeof c.quoted !== 'boolean' || typeof c.missing !== 'boolean') fail('Ungültige Rohdaten.');
  }
}
export function applyOperations(previous, operations, meta = {}, options = {}) {
  if (!Array.isArray(operations) || !operations.length || operations.length > 500) fail('Ungültige Transaktion.');
  // Copy only touched entities. Deep-cloning the entire library for every event makes replay quadratic in stored clinical content.
  const state = { patients: { ...previous.patients }, assessments: { ...previous.assessments },
    unlinked: { ...previous.unlinked }, history: [...previous.history] };
  const patientIdentifiers=new Set(Object.values(previous.patients).map(patient=>patient.identifier));
  const touched = new Set();
  const assessment = id => {
    const a = state.assessments[id] || fail('Testung nicht gefunden.');
    if (!touched.has(id)) { state.assessments[id] = { ...a, revisions: [...a.revisions], attachments: [...a.attachments] }; touched.add(id); }
    return state.assessments[id];
  };
  const patient = id => { if (id !== null && !state.patients[id]) fail('Patient nicht gefunden.'); };
  for (const op of operations) {
    if (!isObject(op)) fail('Ungültige Operation.');
    switch (op.type) {
      case 'patient.create': {
        const p = op.patient;
        if (!isObject(p) || !validId(p.id) || typeof p.identifier !== 'string' || !/^[0-9]{1,100}$/.test(p.identifier) || !text(p.label, 200) || state.patients[p.id]) fail('Numerische individuelle Patientenkennung erforderlich.');
        if (patientIdentifiers.has(p.identifier)) fail('Patientenkennung bereits vorhanden. Vorhandenen Patienten wählen.');
        patientIdentifiers.add(p.identifier);
        state.patients[p.id] = p; break;
      }
      case 'assessment.create': {
        const a = op.assessment;
        if (!isObject(a) || !validId(a.id) || typeof a.sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(a.sessionId) || typeof a.stayId !== 'string' || !/^[0-9]{1,100}$/.test(a.stayId) || state.assessments[a.id]) fail('Testungskennung oder numerische Aufenthaltskennung ungültig.');
        patient(a.patientId);
        if (a.assessmentTypeId != null && !validAssessmentType(a.assessmentTypeId)) fail('Untersuchungsart wird nicht unterstützt.');
        state.assessments[a.id] = { ...a, assessmentTypeId:a.assessmentTypeId??null,excluded:false,revisions: [], selectedRevisionId: null, attachments: [] }; break;
      }
      case 'revision.add': {
        const a = assessment(op.assessmentId); const r = op.revision;
        if (!isObject(r) || !validId(r.id) || a.revisions.some(x => x.id === r.id)) fail('Ungültige Revision.');
        validateAttachment(r.original); if (r.original.kind !== 'csv') fail('Revision benötigt CSV.');
        validateDocument(r.document, a.sessionId, options.projected);
        a.revisions.push(r); if (a.selectedRevisionId === null) a.selectedRevisionId = r.id; break;
      }
      case 'revision.select': {
        const a = assessment(op.assessmentId);
        if (!a.revisions.some(r => r.id === op.revisionId)) fail('Revision nicht gefunden.');
        a.selectedRevisionId = op.revisionId; break;
      }
      case 'patient.link': {
        const a = assessment(op.assessmentId); patient(op.patientId);
        if (!text(op.reason, 2000) || !op.reason.trim()) fail('Korrekturgrund erforderlich.');
        a.patientId = op.patientId; break;
      }
      case 'stay.update': {
        const a = assessment(op.assessmentId);
        if (typeof op.stayId !== 'string' || !/^[0-9]{1,100}$/.test(op.stayId) || !text(op.reason, 2000) || !op.reason.trim()) fail('Numerische Aufenthaltskennung und Korrekturgrund erforderlich.');
        a.stayId = op.stayId; break;
      }
      case 'assessment.type.set': {
        const a = assessment(op.assessmentId);
        if (!validAssessmentType(op.assessmentTypeId) || !text(op.reason,2000) || !op.reason.trim()) fail('Untersuchungsart und Änderungsgrund erforderlich.');
        a.assessmentTypeId=op.assessmentTypeId;break;
      }
      case 'assessment.exclusion.set': {
        if (typeof op.excluded !== 'boolean') fail('Einschlussstatus ungültig.');
        assessment(op.assessmentId).excluded=op.excluded;
        break;
      }
      case 'attachment.add': {
        const a = assessment(op.assessmentId); validateAttachment(op.attachment);
        if (a.attachments.some(x => x.id === op.attachment.id)) fail('Anhang bereits vorhanden.');
        if (op.attachment.revisionId !== null && !a.revisions.some(r => r.id === op.attachment.revisionId)) fail('Anhangsrevision fehlt.');
        a.attachments.push(op.attachment); break;
      }
      case 'attachment.unlinked': {
        validateAttachment(op.attachment); if (state.unlinked[op.attachment.id]) fail('Anhang bereits vorhanden.');
        state.unlinked[op.attachment.id] = op.attachment; break;
      }
      case 'attachment.link': {
        const a = assessment(op.assessmentId); const original = state.unlinked[op.attachmentId];
        if (!original || !text(op.note, 2000) || !op.note.trim()) fail('Unzugeordneter Anhang oder Begründung fehlt.');
        a.attachments.push({ ...original, method: 'explicit-later-assignment', note: op.note, revisionId: null });
        delete state.unlinked[op.attachmentId]; break;
      }
      default: fail(`Unbekannte Operation: ${op.type}. Schreibschutz erforderlich.`);
    }
  }
  state.history.push({ ...meta, operations });
  return state;
}
export function originalsOf(operations) {
  return operations.flatMap(op => op.type === 'revision.add' ? [op.revision.original] :
    ['attachment.add', 'attachment.unlinked'].includes(op.type) ? [op.attachment] : []);
}
export function allOriginals(state) {
  return [...Object.values(state.unlinked), ...Object.values(state.assessments).flatMap(a => [...a.revisions.map(r => r.original), ...a.attachments])];
}
export const selectedRevision = a => a?.revisions.find(r => r.id === a.selectedRevisionId);
export const isExcluded = assessment => assessment?.excluded === true;
export const matchesArchiveStatus = (assessment, status = 'included') => status === 'all' ||
  status === 'excluded' && isExcluded(assessment) || status === 'included' && !isExcluded(assessment);
