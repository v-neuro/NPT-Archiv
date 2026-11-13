import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv } from '../src/csv.js';
import { importedFieldGroups, importedFieldLabel, importedCellState } from '../src/imported-fields.js';
import { fixture } from './support.mjs';

test('complete assessment sections contain every source header exactly once, including demographics, versions, flags and notes',async()=>{
 const document=await parseCsv(await fixture()),before=JSON.stringify(document),groups=importedFieldGroups(document),keys=groups.flatMap(g=>g.keys);
 assert.equal(keys.length,388);assert.equal(new Set(keys).size,388);assert.deepEqual([...keys].sort(),[...document.headers].sort());
 assert.equal(groups[0].id,'demographics');assert.ok(groups[0].keys.includes('demographics_patient_age'));assert.ok(groups[0].keys.includes('demographics_education_years'));
 const examination=groups.find(g=>g.id==='examination');assert.ok(examination.keys.includes('demographics_examiner_initials'));assert.ok(examination.keys.includes('testing_start_date'));assert.ok(examination.keys.includes('session_uuid'));
 for(const [id,version,result] of [['vlmt','vlmt_version','vlmt_dg5_hits'],['rey','rey_copy_scoring','rey_copy_element_1'],['moca','moca_version','moca_attention_digit_span'],['qolie31','qolie31_scoring_version','qolie31_item_1_raw']]){const group=groups.find(g=>g.id===id);assert.ok(group.versionKeys.includes(version));assert.ok(group.keys.includes(result));assert.ok(group.keys.indexOf(version)<group.keys.indexOf(result));}
 assert.ok(groups.find(g=>g.id==='stroop').keys.includes('stroop_notes_woerter'));assert.ok(groups.find(g=>g.id==='phq9').keys.includes('phq9_completed'));assert.equal(JSON.stringify(document),before,'Display grouping cannot mutate source data');
});

test('blank/default-only assessments retain all fields without claiming tests were performed',async()=>{
 const document=await parseCsv(await readFile(new URL('../fixtures/empty-assessment.csv',import.meta.url))),groups=importedFieldGroups(document);
 assert.equal(groups.flatMap(g=>g.keys).length,388);assert.equal(importedCellState(document,'phq9_total'),'missing');assert.ok(groups.find(g=>g.id==='phq9').keys.includes('phq9_total'));
 assert.ok(!groups.some(g=>Object.hasOwn(g,'completed')||Object.hasOwn(g,'administered')));
});

test('unknown text, numeric precision and missing/quoted-empty fields stay distinguishable in the complete view',async()=>{
 const document=await parseCsv('session_uuid;future_notes;future_metric;future_decimal;missing_value;empty_value;toString\n"unknown_session";"<img src=https://example.invalid/synthetic>";"-0.0000000000000000001";"0,25";;"";"SYNTHETIC"'),groups=importedFieldGroups(document),other=groups.find(g=>g.id==='other');
 assert.equal(other.label,'Weitere importierte Felder');assert.deepEqual([...other.keys].sort(),['future_notes','future_metric','future_decimal','missing_value','empty_value','toString'].sort());assert.equal(other.presentCount,4);
 assert.equal(importedCellState(document,'toString'),'value');assert.equal(importedCellState(document,'valueOf'),'absent');assert.equal(importedCellState(document,'missing_value'),'missing');assert.equal(importedCellState(document,'empty_value'),'empty');assert.equal(document.raw.future_metric.raw,'-0.0000000000000000001');assert.equal(document.raw.future_decimal.raw,'0,25');assert.equal(importedFieldLabel('future_metric'),'future_metric');
});

test('labels keep demographic, item/manual totals and multiple test versions distinct',()=>{
 assert.equal(importedFieldLabel('demographics_patient_age'),'Alter');assert.match(importedFieldLabel('vlmt_dg5_hits'),/Durchgang 5.*Treffer/);assert.notEqual(importedFieldLabel('phq9_manual_total'),importedFieldLabel('phq9_total'));assert.notEqual(importedFieldLabel('rwt_phon_simple_version'),importedFieldLabel('rwt_sem_simple_version'));assert.equal(importedFieldLabel('qolie31_scoring_version'),'Bewertungsversion');assert.equal(importedFieldLabel('rey_copy_notes'),'Notizen');
});
