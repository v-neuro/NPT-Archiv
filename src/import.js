import { MAX_BATCH, MAX_CSV, MAX_FILE, fail, sha256, uid, text } from './shared.js';
import { parseCsv, changedFields, sourceValue } from './csv.js';
import { allOriginals, selectedRevision } from './model.js';
import { validAssessmentType } from './assessment-types.js';
import { clinicalForNewAssessment } from './clinical.js';

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
    const key = reportNameKey(row.name);
    row.suggestions = rows.filter(r => r.kind === 'csv' && !r.error && key && reportNameKey(r.name) === key).map(r => `batch:${r.id}`);
    for (const a of Object.values(state.assessments)) if (key && a.revisions.some(r => reportNameKey(r.original.name) === key)) row.suggestions.push(`existing:${a.id}`);
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

const duplicate = row => ['duplicate', 'duplicate-in-batch'].includes(row.status);
export function reportNameKey(name) {
  const stem=name.replace(/(?:\.(?:csv|pdf))+$/i,'').normalize('NFC');
  return [...stem].filter(character=>/[\p{L}\p{N}]/u.test(character)).slice(0,50).join('');
}

export async function buildAssessmentPdf(file,assessment) {
  if(!assessment)fail('Untersuchung nicht gefunden.');
  if(!file||typeof file.name!=='string'||!/\.pdf$/i.test(file.name)||file.name.length>255||!file.size||file.size>MAX_FILE)fail('Eine PDF-Datei bis 32 MiB auswählen.');
  const key=reportNameKey(file.name);
  if(!key||!assessment.revisions.some(r=>reportNameKey(r.original.name)===key))fail('Der PDF-Dateiname passt nicht zur CSV dieser Untersuchung. Bitte die passende PDF auswählen.');
  const data=new Uint8Array(await file.arrayBuffer());
  if(data.length!==file.size||new TextDecoder().decode(data.subarray(0,5))!=='%PDF-')fail('Keine gültige PDF-Dateisignatur. Bitte eine andere PDF auswählen.');
  const hash=await sha256(data);
  if(assessment.attachments.some(a=>a.kind==='pdf'&&a.hash===hash))return {duplicate:true,operations:[],files:new Map()};
  const attachment={id:uid(),hash,size:data.length,name:file.name,kind:'pdf',method:'filename-prefix-50',note:'Im Untersuchungsdetail hinzugefügt; die ersten bis zu 50 Buchstaben/Ziffern passen zu einer gespeicherten CSV.',revisionId:null};
  return {duplicate:false,operations:[{type:'attachment.add',assessmentId:assessment.id,attachment}],files:new Map([[hash,data]])};
}

// One shared patient/stay assignment. Recompute matches from the original filename prefixes,
// never from caller-provided suggestions or a previously selected PDF target.
export function planPatientImport(rows, state, draft) {
  const identifier = draft.identifier ?? '', stayId = draft.stayId ?? '';
  const patient = Object.values(state.patients).find(p => p.identifier === identifier) ?? null;
  const previous = patient ? Object.values(state.assessments).filter(a => a.patientId === patient.id)
    .sort((a,b) => (selectedRevision(b)?.document.date ?? '').localeCompare(selectedRevision(a)?.document.date ?? '') || a.id.localeCompare(b.id)) : [];
  const issues = [];
  const issue = (code, message, row = null) => issues.push({ code, message, rowId: row?.id ?? null });
  const active = rows.filter(r => !r.error && (r.kind === 'pdf' || !duplicate(r)));
  if (typeof identifier !== 'string' || !/^[0-9]{1,100}$/.test(identifier)) issue('identifier', 'iMed Patienten-ID eingeben (nur Ziffern).');
  if (typeof stayId !== 'string' || !/^[0-9]{1,100}$/.test(stayId)) issue('stay', 'Aufenthalts-ID eingeben (nur Ziffern).');
  if (patient && draft.confirmedPatientId !== patient.id) issue('patient-confirmation', 'Das Hinzufügen zum vorhandenen Patienten bestätigen.');
  const needsType = active.some(r => r.kind === 'csv' && (r.status === 'new' || r.action === 'separate' || !validAssessmentType(r.assessmentTypeId)));
  if ((needsType || draft.assessmentTypeId && active.some(r=>r.kind==='csv')) && !validAssessmentType(draft.assessmentTypeId)) issue('assessment-type', 'Untersuchungsart auswählen.');
  for (const row of rows) if (row.error) issue('invalid-file', row.error, row);
  const prepared = active.map(row => ({ ...row, included: true, patientChoice: patient?.id ?? null, stayId,
    assessmentTypeId: draft.assessmentTypeId || row.assessmentTypeId, confirmed: true,
    status: row.kind === 'pdf' ? 'attachment' : row.status,
    action: row.status === 'new' ? 'new' : row.action }));
  const touched = new Set();
  for (const row of prepared.filter(r => r.kind === 'csv')) {
    if (touched.has(row.document.sessionId)) issue('session-duplicate', 'Mehrere Fassungen derselben Untersuchung: bitte nacheinander importieren.', row);
    touched.add(row.document.sessionId);
    if (row.status !== 'revision') continue;
    if (!['keep','select','separate'].includes(row.action)) issue('revision-decision', 'Für die geänderte CSV eine Entscheidung auswählen.', row);
    if (!row.note.trim()) issue('revision-reason', 'Grund für die geänderte Fassung angeben.', row);
    if (row.action !== 'separate') {
      const target = state.assessments[row.target];
      if (!target || target.sessionId !== row.document.sessionId) issue('revision-target', 'Die bisherige Untersuchung auswählen.', row);
      else if (target.patientId !== patient?.id || target.stayId !== stayId) issue('assignment-conflict', 'Die bisherige Untersuchung gehört zu einer anderen Patienten- oder Aufenthalts-ID. IDs korrigieren oder ausdrücklich eine getrennte Untersuchung anlegen.', row);
    }
  }
  // Even a skipped duplicate CSV must not conceal a known conflicting owner.
  for (const row of rows.filter(r => r.kind === 'csv' && !r.error && duplicate(r))) {
    const owners = Object.values(state.assessments).filter(a => a.revisions.some(r => r.original.hash === row.hash));
    if (owners.length && !owners.some(a => a.patientId === patient?.id && a.stayId === stayId)) issue('duplicate-owner', 'Diese CSV ist bereits unter einer anderen Patienten- oder Aufenthalts-ID gespeichert.', row);
  }
  const seenPdfLinks = new Set();
  let duplicateCount = rows.filter(r=>r.kind!=='pdf'&&duplicate(r)).length;
  for (const row of prepared.filter(r => r.kind === 'pdf')) {
    const key=reportNameKey(row.name);
    const csvs = rows.filter(r => r.kind === 'csv' && !r.error && key && reportNameKey(r.name) === key);
    const candidates = new Set();
    if (csvs.length) {
      for (const csv of csvs) {
        if (duplicate(csv)) {
          const primary = prepared.find(r => r.kind === 'csv' && r.hash === csv.hash);
          if (primary) candidates.add(primary.status === 'revision' && primary.action !== 'separate' ? `existing:${primary.target}` : `batch:${primary.id}`);
          else for (const a of Object.values(state.assessments)) if (a.patientId === patient?.id && a.stayId === stayId && a.revisions.some(r => r.original.hash === csv.hash)) candidates.add(`existing:${a.id}`);
        } else candidates.add(csv.status === 'revision' && csv.action !== 'separate' ? `existing:${csv.target}` : `batch:${csv.id}`);
      }
    } else {
      for (const a of Object.values(state.assessments)) if (key && a.patientId === patient?.id && a.stayId === stayId && a.revisions.some(r => reportNameKey(r.original.name) === key)) candidates.add(`existing:${a.id}`);
    }
    if (candidates.size !== 1) {
      issue(candidates.size ? 'pdf-ambiguous' : 'pdf-unmatched', candidates.size ? 'Der PDF-Dateiname passt zu mehreren Untersuchungen. Bitte CSV und PDF einzeln importieren.' : 'Der PDF-Dateiname passt zu keiner CSV für diesen Patienten und Aufenthalt. Bitte die passende PDF auswählen oder die zugehörige CSV hinzufügen.', row);
      row.target = '';
    } else {
      row.target = [...candidates][0];
      row.note = 'Automatisch zugeordnet: Die ersten bis zu 50 Buchstaben/Ziffern der Dateinamen stimmen überein; Trennzeichen und Dateiendungen wurden ausgelassen.';
      // Deduplicate stored bytes separately from patient/assessment links. Identical
      // PDF bytes for two examinations still need two durable attachment links.
      const link = `${row.target}:${row.hash}`;
      const target = row.target.startsWith('existing:') ? state.assessments[row.target.slice(9)] : null;
      if (seenPdfLinks.has(link) || target?.attachments.some(a=>a.hash===row.hash)) { row.included=false; duplicateCount++; }
      seenPdfLinks.add(link);
    }
  }
  const included = prepared.filter(r=>r.included);
  if (!included.length) issue('empty', 'Keine neuen Dateien zum Importieren.');
  return { patient, previous, issues, rows: included, ready: issues.length === 0, needsType,
    duplicateCount, csvCount: included.filter(r => r.kind === 'csv').length,
    pdfCount: included.filter(r => r.kind === 'pdf').length };
}

export const validImportActor = actor => text(actor,100) && Boolean(actor.trim());
export function buildPatientImport(rows, state, draft) {
  const plan = planPatientImport(rows, state, draft);
  if (!plan.ready) fail(plan.issues[0].message);
  if (!validImportActor(draft.actor)) fail('Bearbeiterkürzel erforderlich (1–100 Zeichen).');
  const patient = plan.patient ?? { id: uid(), identifier: draft.identifier, label: '' };
  // PDF-only imports may extend an existing examination, never create an orphan patient.
  if (!plan.patient && !plan.csvCount) fail('Für einen neuen Patienten die zugehörige CSV hinzufügen.');
  const assigned = plan.rows.map(row => ({ ...row, patientChoice: patient.id }));
  const built = buildImport(assigned, state, plan.patient ? [] : [patient]);
  // An additional CSV revision or PDF must never overwrite an existing annotation.
  const annotations=built.operations.filter(op=>op.type==='assessment.create').map(op=>({type:'assessment.clinical.set',assessmentId:op.assessment.id,clinical:clinicalForNewAssessment(draft.clinical,op.assessment.assessmentTypeId)}));
  built.operations.push(...annotations);
  for (const op of built.operations) {
    if (op.type === 'revision.add') {
      op.revision.original.method = 'single-patient-import';
      if (op.revision.reason === 'Neue Testung; explizite Zuordnung geprüft.') op.revision.reason = 'Neue Untersuchung im Ein-Patienten-Import.';
    }
    if (op.type === 'attachment.add') op.attachment.method = 'filename-prefix-50';
  }
  return { ...built, actor:draft.actor.trim() };
}
