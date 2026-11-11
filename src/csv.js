import { PARSER_VERSION, MAX_CSV, bytes, decode, fail, sha256 } from './shared.js';

// Deliberately small typed registry. All other fields remain strings, including future fields.
export const NUMERIC_FIELDS = new Set([
  'demographics_patient_age', 'demographics_education_years', 'demographics_education_school_years',
  'demographics_education_training_years', 'demographics_education_dissertation_years',
  'tmt_a_s', 'tmt_b_s', 'cerad_tmt_a_s', 'cerad_tmt_b_s', 'vlmt_sum_dg1_5',
  'vlmt_loss_dg5_to_dg7', 'vlmt_rekog_correct_minus_fp', 'moca_total', 'moca_raw_total',
  'ace_total', 'cerad_mmst_total', 'phq9_total', 'phq9_manual_total', 'gad7_total', 'gds_total',
  'rey_copy_total', 'rey_copy_subtotal', 'qolie31_overall', 'qolie31_general_health',
]);
export function parseTable(input) {
  if (bytes(input).length > MAX_CSV) fail('CSV größer als 8 MiB.');
  const s = input.replace(/^\uFEFF/, '');
  const rows = []; let row = []; let value = ''; let quoted = false; let state = 'start';
  const cell = () => { row.push({ raw: value, quoted, missing: !quoted && value === '' }); value = ''; quoted = false; state = 'start'; };
  const record = () => { cell(); rows.push(row); row = []; if (rows.length > 2) fail('Erwartet: Kopfzeile und genau eine Testung pro CSV.'); };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (state === 'quoted') {
      if (c === '"') { if (s[i + 1] === '"') { value += '"'; i++; } else state = 'closed'; }
      else value += c;
    } else if (c === ';') cell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; record(); }
    else if (c === '"' && state === 'start') { quoted = true; state = 'quoted'; }
    else { if (state === 'closed' || c === '"') fail('Ungültige CSV-Anführungszeichen.'); value += c; state = 'plain'; }
    if (value.length > 1024 * 1024 || row.length > 2000) fail('CSV-Feld oder Spaltenzahl zu groß.');
  }
  if (state === 'quoted') fail('Nicht geschlossenes CSV-Feld.');
  if (row.length || value || state !== 'start' || s.endsWith(';')) record();
  if (rows.length !== 2) fail('CSV benötigt Kopfzeile und genau eine Datenzeile.');
  return rows;
}
export function germanDate(raw) {
  if (!raw) return null;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (!m) return null;
  const [, d, month, y] = m.map(Number);
  if (y < 1900 || y > 2200 || month < 1 || month > 12 || d < 1 || d > new Date(Date.UTC(y, month, 0)).getUTCDate()) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export async function parseCsv(data, knownColumns = []) {
  const original = typeof data === 'string' ? data : decode(data);
  const [header, cells] = parseTable(original);
  const headers = header.map(c => c.raw);
  if (headers.length !== cells.length) fail('CSV-Zeilen haben unterschiedliche Spaltenzahlen.');
  if (headers.some(h => !/^[A-Za-z][A-Za-z0-9_]{0,149}$/.test(h) || ['constructor', 'prototype'].includes(h))) fail('Ungültiger Spaltenname.');
  if (new Set(headers).size !== headers.length) fail('Doppelte CSV-Spaltennamen müssen vor dem Import geklärt werden.');
  const raw = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  const sessionId = raw.session_uuid?.raw;
  if (!sessionId || !/^[A-Za-z0-9_-]{1,100}$/.test(sessionId)) fail('session_uuid fehlt oder ist ungültig (Legacy-Kennungen sind erlaubt).');
  for (const alias of ['sessionUUID', 'sessionUuid', 'session_id', 'assessment_session_uuid']) {
    if (raw[alias]?.raw && raw[alias].raw !== sessionId) fail('Widersprüchliche Sitzungskennungen. Vor dem Import ausdrücklich klären.');
  }
  const warnings = ['CSV-Erzeugerversion unbekannt; kein Versionsfeld im Export.'];
  const normalized = Object.fromEntries(headers.map(h => {
    const c = raw[h];
    if (c.missing) return [h, null];
    if (NUMERIC_FIELDS.has(h) && c.raw !== '') {
      if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(c.raw) && Number.isFinite(Number(c.raw))) return [h, Number(c.raw)];
      warnings.push(`${h}: unbekanntes Zahlenformat, Text erhalten.`);
    }
    return [h, c.raw];
  }));
  const dateText = raw.testing_start_date?.raw ?? '';
  const date = germanDate(dateText);
  if (dateText && !date) warnings.push('Unbekanntes Untersuchungsdatum; Originaltext erhalten.');
  const timeText = raw.testing_start_time?.raw ?? '';
  if (timeText && !/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(timeText)) warnings.push('Unbekannte Uhrzeit; keine Zeitzone angenommen.');
  const unknownFields = knownColumns.length ? headers.filter(h => !knownColumns.includes(h)) : [];
  if (unknownFields.length) warnings.push(`${unknownFields.length} unbekannte Felder unverändert erhalten.`);
  // Quoted numeric/blank distinctions stay in raw. Equivalence ignores header order and numeric formatting only for registered fields.
  const semantic = headers.slice().sort().map(h => [h, normalized[h]]);
  return { parserVersion: PARSER_VERSION, producerVersion: null, sessionId, headers, raw, normalized,
    date, dateText, timeText, timezone: null, unknownFields, warnings,
    signature: await sha256(JSON.stringify(headers.slice().sort())),
    semanticHash: await sha256(JSON.stringify(semantic)) };
}
export function sourceValue(doc, key) { return doc?.raw?.[key]?.raw ?? ''; }
export function changedFields(a, b) {
  return [...new Set([...a.headers, ...b.headers])].sort().filter(k =>
    !Object.hasOwn(a.normalized, k) || !Object.hasOwn(b.normalized, k) || a.normalized[k] !== b.normalized[k]);
}
