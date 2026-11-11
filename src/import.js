import { MAX_BATCH, MAX_CSV, MAX_FILE, fail, sha256, uid } from './shared.js';
import { parseCsv, changedFields, sourceValue } from './csv.js';
import { allOriginals, selectedRevision } from './model.js';
import { validAssessmentType } from './assessment-types.js';

export async function inspectFiles(files, state, columns, loadDocument = null) {
  if (files.length > 100 || files.reduce((n, f) => n + f.size, 0) > MAX_BATCH) fail('Maximal 100 Dateien / 128 MiB pro Stapel.');
  const rows = [];
  const known = new Set(allOriginals(state).map(a => a.hash));
  for (const file of files) {
    const row = { id: uid(), name: file.name, included: true, patientChoice: 'unresolved', stayId: '', assessmentTypeId:'',action: '', target: '', confirmed: false, note: '' };
    try {
      if (!file.size || file.size > MAX_FILE) fail('Datei leer oder größer als 32 MiB.');
      if (file.name.length > 255) fail('Dateiname zu lang.');
      const data = new Uint8Array(await file.arrayBuffer()); row.data = data; row.hash = await sha256(data); row.size = data.length;
      if (/\.csv$/i.test(file.name)) {
        if (data.length > MAX_CSV) fail('CSV größer als 8 MiB.');
        row.kind = 'csv'; row.document = await parseCsv(data, columns);
        const matches = Object.values(state.assessments).filter(a => a.sessionId === row.document.sessionId);
        row.matches = matches.map(a => a.id);
        row.status = known.has(row.hash) ? 'duplicate' : matches.length ? 'revision' : 'new';
        if (matches.length === 1) {
          row.target = matches[0].id;
          let selected = selectedRevision(matches[0]);
          if(selected?.document.projected&&loadDocument)selected={...selected,document:await loadDocument(matches[0].id,selected.id)};
          if(selected?.document.projected)fail('Zum Vergleich bitte die vollständigen Quelldaten laden.');
          row.comparisonDocument=selected?.document;
          row.changes = selected ? changedFields(selected.document, row.document) : [];
          row.equivalent = matches[0].revisions.some(r => r.document.semanticHash === row.document.semanticHash);
          row.patientChoice = matches[0].patientId ?? 'unresolved';
          row.stayId = matches[0].stayId;
          row.assessmentTypeId=matches[0].assessmentTypeId??'';
          row.contextConflict = selected && ['testing_start_date', 'demographics_patient_initials', 'demographics_patient_gender'].some(k => sourceValue(selected.document, k) !== sourceValue(row.document, k));
        }
      } else if (/\.pdf$/i.test(file.name)) {
        if (new TextDecoder().decode(data.subarray(0, 5)) !== '%PDF-') fail('Keine PDF-Dateisignatur.');
        row.kind = 'pdf'; row.status = known.has(row.hash) ? 'duplicate' : 'attachment';
      } else fail('Diese Version importiert CSV und PDF. Vollbackups bleiben im genehmigten Transferprozess; strukturierter Import folgt nach Klärung.');
      if (rows.some(r => r.hash === row.hash && !r.error)) { row.status = 'duplicate-in-batch'; row.included = false; }
      if (row.status === 'duplicate') row.included = false;
    } catch (e) { row.error = e.message; row.included = false; }
    rows.push(row);
  }
  for (const row of rows.filter(r => r.kind === 'pdf' && !r.error)) {
    const stem = row.name.replace(/\.pdf$/i, '');
    row.suggestions = rows.filter(r => r.kind === 'csv' && !r.error && r.name.replace(/\.csv$/i, '') === stem).map(r => `batch:${r.id}`);
    for (const a of Object.values(state.assessments)) if (a.revisions.some(r => r.original.name.replace(/\.csv$/i, '') === stem)) row.suggestions.push(`existing:${a.id}`);
    row.suggestions = [...new Set(row.suggestions)];
  }
  return rows;
}
export function buildImport(rows, state, newPatients = []) {
  const operations = []; const files = new Map(); const targets = new Map(); const touched = new Map();
  const active = rows.filter(r => r.included && !r.error && !['duplicate', 'duplicate-in-batch'].includes(r.status));
  if (!active.length) fail('Keine neuen gültigen Dateien ausgewählt.');
  for (const p of newPatients) operations.push({ type: 'patient.create', patient: p });
  const attachment = row => ({ id: uid(), hash: row.hash, size: row.size, name: row.name, kind: row.kind,
    method: 'explicit-import-review', note: row.note || '', revisionId: null });
  for (const row of active.filter(r => r.kind === 'csv')) {
    if (!row.confirmed) fail(`${row.name}: Patientenzuordnung und Importentscheidung bestätigen.`);
    if (!validAssessmentType(row.assessmentTypeId)) fail(`${row.name}: Bitte eine Untersuchungsart auswählen.`);
    let id;
    if (row.action === 'new' || row.action === 'separate') {
      if (row.status === 'revision' && (row.action !== 'separate' || !row.note.trim())) fail('Sitzungskollision: getrennte Testung begründen.');
      if (row.status === 'new' && row.action !== 'new') fail('Neue Testung bestätigen.');
      id = uid(); operations.push({ type: 'assessment.create', assessment: { id, sessionId: row.document.sessionId,
        patientId: row.patientChoice === 'unresolved' ? null : row.patientChoice, stayId: row.stayId, assessmentTypeId:row.assessmentTypeId } });
    } else if (['keep', 'select'].includes(row.action) && row.target) {
      const a = state.assessments[row.target]; if (!a || a.sessionId !== row.document.sessionId) fail('Revisionsziel ungültig.');
      if ((a.patientId ?? 'unresolved') !== row.patientChoice) fail('Patientenkonflikt: separat anlegen oder Zuordnung später mit Begründung korrigieren.');
      if (a.stayId !== row.stayId) fail('Aufenthaltskonflikt: separat anlegen oder Kennung später mit Begründung korrigieren.');
      if (!row.note.trim()) fail('Revision benötigt eine Begründung, auch bei Formatgleichheit.');
      id = a.id;
      if(a.assessmentTypeId!==row.assessmentTypeId)operations.push({type:'assessment.type.set',assessmentId:id,assessmentTypeId:row.assessmentTypeId,reason:row.note});
    } else fail(`${row.name}: Neue Testung, Revision oder getrennte Sitzung ausdrücklich wählen.`);
    // Two exports with the same source ID in one batch require independent review against a committed baseline.
    if (touched.has(row.document.sessionId)) fail('Mehrere CSV derselben Sitzung im Stapel: nacheinander importieren, damit die Revision geprüft werden kann.');
    touched.set(row.document.sessionId, id); targets.set(`batch:${row.id}`, id);
    const revision = { id: uid(), document: row.document, original: attachment(row), reason: row.note || 'Neue Testung; explizite Zuordnung geprüft.' };
    operations.push({ type: 'revision.add', assessmentId: id, revision });
    if (row.action === 'select') operations.push({ type: 'revision.select', assessmentId: id, revisionId: revision.id });
    files.set(row.hash, row.data);
  }
  for (const row of active.filter(r => r.kind === 'pdf')) {
    if (!row.confirmed) fail(`${row.name}: PDF-Verknüpfung ausdrücklich bestätigen.`);
    const a = attachment(row);
    if (row.target === 'unlinked') { a.method = 'explicit-unlinked'; operations.push({ type: 'attachment.unlinked', attachment: a }); }
    else {
      let id;
      if (row.target.startsWith('existing:')) id = row.target.slice(9);
      else id = targets.get(row.target);
      if (!id || (!state.assessments[id] && ![...targets.values()].includes(id))) fail('PDF-Ziel fehlt oder CSV wurde nicht ausgewählt.');
      if (!row.note.trim()) fail('PDF-Zuordnung begründen: Dateiname allein beweist weder Sitzung noch Exportzeitpunkt.');
      a.method = 'manual-confirmation';
      operations.push({ type: 'attachment.add', assessmentId: id, attachment: a });
    }
    files.set(row.hash, row.data);
  }
  return { operations, files, count: active.length };
}
