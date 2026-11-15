import { NUMERIC_FIELDS, BOOLEAN_FIELDS } from './field-types.js';
import { fail } from './shared.js';

export const CONTRACT_VERSION = 1;
export const MISSING_REASON_SYSTEM = 'http://terminology.hl7.org/CodeSystem/data-absent-reason';
export const MISSING_REASONS = Object.freeze({
  'not-performed':'Nicht durchgeführt', unknown:'Unbekannt / nicht dokumentiert',
  'not-applicable':'Nicht zutreffend', unsupported:'Nicht unterstützt', error:'Ergebnis nicht verfügbar',
});
export const ASSESSMENT_STATUSES = Object.freeze({
  'not-performed':'Nicht durchgeführt', unknown:'Unbekannt', recorded:'Daten erfasst', completed:'Abgeschlossen', aborted:'Abgebrochen',
});
export const TEST_GROUPS = Object.freeze(['vlmt','dcsr','epi','tmt','stroop','gp','cerad_mmst','cerad_wl','cerad_bnt','cerad_wf','cerad_tmt','cerad_fig','uhr','rwt','zahl_fwd','zahl_rev','block_fwd','block_rev','ace','moca','phq9','gad7','gds','rey_copy','qolie31']);
export const TEST_GROUP_LABELS = Object.freeze({vlmt:'VLMT',dcsr:'DCS-R',epi:'EpiTrack',tmt:'Trail Making Test (TMT)',stroop:'Stroop',gp:'Grooved Pegboard',cerad_mmst:'CERAD · MMST',cerad_wl:'CERAD · Wortliste',cerad_bnt:'CERAD · Benennen',cerad_wf:'CERAD · Wortflüssigkeit',cerad_tmt:'CERAD · TMT',cerad_fig:'CERAD · Figuren',uhr:'Uhrentest',rwt:'RWT',zahl_fwd:'Zahlenspanne · Vorwärts',zahl_rev:'Zahlenspanne · Rückwärts',block_fwd:'Blockspanne · Vorwärts',block_rev:'Blockspanne · Rückwärts',ace:'ACE-III',moca:'MoCA',phq9:'PHQ-9',gad7:'GAD-7',gds:'GDS',rey_copy:'Rey/Taylor · Kopie',qolie31:'QOLIE-31'});
export function testGroupForField(key) {
  if(key.startsWith('cerad_benennen_')||key.startsWith('notes_benennen'))return 'cerad_bnt';
  for(const [prefix,group] of [['notes_mmst','cerad_mmst'],['notes_cerad_wf','cerad_wf'],['notes_cerad_fig','cerad_fig'],['notes_tmt_','tmt']])if(key.startsWith(prefix))return group;
  return TEST_GROUPS.find(group=>key===group||key.startsWith(group+'_')) ?? null;
}
export const isContractMetadata = key => key === 'export_schema_version' || key === 'export_missing_reason_system' || key.endsWith('_missing_reason') || key.endsWith('_assessment_status');
export const isDecimal = value => typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));

// Compare decimal source values without first rounding them to IEEE-754 numbers.
// Keep equivalent formatting (12, 12.00, 1.2e1) equivalent, but retain differences
// beyond JavaScript's numeric precision and differences between malformed inputs.
export function semanticValue(document,key) {
  const raw = document.raw[key]?.raw, value = document.normalized[key];
  if (!NUMERIC_FIELDS.has(key)) return value === null && raw !== '' && raw !== undefined ? ['invalid',raw] : value;
  if (typeof value !== 'number') return raw === '' ? null : ['invalid',raw];
  const [coefficient,exponent='0'] = raw.toLowerCase().replace(/^\+/,'').split('e');
  const negative=coefficient.startsWith('-'),unsigned=negative?coefficient.slice(1):coefficient;
  let digits=unsigned.replace('.','').replace(/^0+/,'');
  if (!digits) return ['decimal','0'];
  let power=BigInt(exponent)-BigInt(unsigned.includes('.')?unsigned.length-unsigned.indexOf('.')-1:0);
  const trailing=digits.length-digits.replace(/0+$/,'').length;
  digits=digits.slice(0,digits.length-trailing);power+=BigInt(trailing);
  return ['decimal',(negative?'-':'')+digits+'e'+power];
}

// A derived view only: never mutate a checksummed commit, its raw cells or a saved semantic hash.
export function upgradeDocument(document) {
  if (document.contractVersion === CONTRACT_VERSION || document.projected) return document;
  const raw = document.raw, version = Object.hasOwn(raw,'export_schema_version') ? raw.export_schema_version.raw : null;
  if (version !== null && version !== '2') fail(`Nicht unterstützte export_schema_version „${version}“. Unterstützt: 2 oder Legacy ohne Version.`);
  const warnings = [...(document.warnings ?? [])], issues = [], normalized = {}, missingReasons = {};
  const issue = (code, field, message, severity = 'warning') => { issues.push({code,field,severity,message}); warnings.push(message); };
  if (version === '2' && raw.export_missing_reason_system?.raw !== MISSING_REASON_SYSTEM)
    issue('reason-system','export_missing_reason_system','v2: export_missing_reason_system fehlt oder ist unbekannt; Quellangabe erhalten.');
  for (const key of document.headers) {
    const value = raw[key].raw;
    if (isContractMetadata(key)) { normalized[key] = value === '' ? null : value; continue; }
    let reason = version === '2' ? raw[key + '_missing_reason']?.raw || null : null;
    if(version === '2' && !Object.hasOwn(raw,key + '_missing_reason') && value !== '')
      issue('missing-companion',key,`${key}: v2-Fehlgrundspalte fehlt; Quellwert erhalten.`);
    if (reason && !Object.hasOwn(MISSING_REASONS,reason)) issue('unknown-reason',key,`${key}: unbekannter Fehlgrund „${reason}“ erhalten.`);
    if (value !== '' && reason) issue('contradictory-reason',key,`${key}: Wert und Fehlgrund gleichzeitig exportiert; beide erhalten.`, 'error');
    if (value === '') {
      normalized[key] = null;
      if (version === '2' && !reason) issue('missing-reason',key,`${key}: leerer v2-Wert ohne Fehlgrund; als unknown übernommen.`);
      missingReasons[key] = reason ?? 'unknown';
    } else {
      normalized[key] = value;
      if (NUMERIC_FIELDS.has(key) || BOOLEAN_FIELDS.has(key)) {
        const valid = BOOLEAN_FIELDS.has(key) ? /^(?:0|1)$/.test(value) : isDecimal(value);
        if (valid) normalized[key] = BOOLEAN_FIELDS.has(key) ? value === '1' : Number(value);
        else {
          normalized[key] = null;
          issue('invalid-number',key,`${key}: ungültiger ${BOOLEAN_FIELDS.has(key)?'0/1-Kennwert':'Zahlenwert'} „${value}“; Original erhalten, Ergebnis NULL.`, 'error');
          reason ??= 'error';
        }
      }
      missingReasons[key] = reason;
    }
  }
  if (!version && document.headers.some(key=>key.endsWith('_missing_reason')))
    issue('unversioned-reasons','export_schema_version','Fehlgrundspalten ohne v2-Version; als Legacy behandelt, Quellspalten erhalten.');
  const assessmentStatuses = {};
  for (const group of TEST_GROUPS) {
    const key = group + '_assessment_status', status = raw[key]?.raw;
    assessmentStatuses[group] = version === '2' && status ? status : 'unknown';
    if (version === '2' && (!status || !Object.hasOwn(ASSESSMENT_STATUSES,status)))
      issue('assessment-status',key,`${key}: ${status?'unbekannter Status erhalten':'Status fehlt; unknown verwendet'}.`);
  }
  // Future status groups remain in raw/normalized metadata without guessed semantics.
  return {...document,contractVersion:CONTRACT_VERSION,exportSchemaVersion:version,
    missingReasonSystem:raw.export_missing_reason_system?.raw || null,normalized,missingReasons,assessmentStatuses,issues,warnings};
}

export function missingReason(document,key) {
  if (!document) return 'unknown';
  if (document.projected) {
    const index = document.sourceFields?.indexOf(key) ?? -1;
    if (index < 0) return 'unknown';
    for (const [reason,indices] of Object.entries(document.missingReasonIndices ?? {})) if (indices.includes(index)) return reason.slice(7);
    return document.presentFieldIndices.includes(index) ? null : 'unknown';
  }
  const reasons=upgradeDocument(document).missingReasons;
  return Object.hasOwn(reasons,key) ? reasons[key] : (document.raw?.[key]?.raw === '' || !Object.hasOwn(document.raw??{},key) ? 'unknown' : null);
}
export const missingReasonLabel = reason => Object.hasOwn(MISSING_REASONS,reason) ? MISSING_REASONS[reason] : `Unbekannter Fehlgrund (${reason})`;
export function assessmentStatus(document,group) {
  const statuses=document?.assessmentStatuses ?? (document&&!document.projected?upgradeDocument(document).assessmentStatuses:{});
  return Object.hasOwn(statuses,group) ? statuses[group] : 'unknown';
}
export const assessmentStatusLabel = status => Object.hasOwn(ASSESSMENT_STATUSES,status) ? ASSESSMENT_STATUSES[status] : `Unbekannter Status (${status})`;
export function matchesSourceFilters(document,{group='',status='',field='',reason=''} = {}) {
  if (status && !(group ? assessmentStatus(document,group) === status : TEST_GROUPS.some(key=>assessmentStatus(document,key) === status))) return false;
  if (reason && !(field ? missingReason(document,field) === reason : (document?.sourceFields ?? document?.headers ?? []).some(key=>!isContractMetadata(key)&&missingReason(document,key) === reason))) return false;
  return true;
}
