export const SUMMARY_MEASURES = Object.freeze([
  ['tmt_a_s','TMT A','Sekunden','tmt_a'],['tmt_b_s','TMT B','Sekunden','tmt_b'],
  ['vlmt_sum_dg1_5','VLMT · Lerndurchgänge 1–5','Quellwert','vlmt'],
  ['moca_total','MoCA · Gesamtwert','Punkte','moca'],['ace_total','ACE-III · Gesamtwert','Punkte','ace'],
  ['phq9_total','PHQ-9','Punkte','phq9'],['gad7_total','GAD-7','Punkte','gad7'],['gds_total','GDS','Punkte','gds'],
  ['rey_copy_total','Rey/Taylor · Gesamtwert','Punkte','rey_copy'],
  ['rey_copy_subtotal','Rey/Taylor · Zwischensumme','Punkte','rey_copy'],
  ['qolie31_overall','QOLIE-31 · Gesamtwert','Quellwert','qolie31'],
]);
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
