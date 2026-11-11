import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv, parseTable, germanDate, changedFields } from '../src/csv.js';
import { capabilities, canOpen } from '../src/storage.js';
import { fixture } from './support.mjs';
const columns=JSON.parse(await readFile(new URL('../src/export-columns.json',import.meta.url))).columns;
test('actual producer fixture: 388 columns, negative score, manual zero, partial and escaped multiline notes remain intact',async()=>{
 const d=await parseCsv(await fixture(),columns);
 assert.equal(d.headers.length,388);assert.equal(d.unknownFields.length,0);assert.equal(d.producerVersion,null);
 assert.equal(d.date,'2026-01-15');assert.equal(d.timezone,null);
 assert.equal(d.normalized.phq9_manual_total,0);assert.equal(d.normalized.phq9_total,0);assert.equal(d.raw.phq9_entry_mode.raw,'manual');
 assert.ok(d.normalized.vlmt_loss_dg5_to_dg7<0);assert.equal(d.normalized.rey_copy_total,null);
 assert.ok(Object.values(d.raw).some(c=>c.raw.includes('\n')&&c.raw.includes('"')));
 assert.ok(Object.values(d.raw).some(c=>c.raw.startsWith("'=")));
});
test('BOM/CRLF, quoted semicolons, quotes, empty versus missing, zero, decimal and unknown fields',async()=>{
 const d=await parseCsv('\uFEFFunknown;phq9_total;session_uuid;empty;missing;notes;tmt_a_s\r\n"007";"0";"sess_legacy-a_b";"";;"Ä;""ß""\nline";"-1.5"\r\n',columns);
 assert.equal(d.raw.empty.missing,false);assert.equal(d.raw.missing.missing,true);assert.equal(d.normalized.missing,null);assert.equal(d.normalized.empty,'');
 assert.equal(d.normalized.phq9_total,0);assert.equal(d.normalized.tmt_a_s,-1.5);assert.equal(d.normalized.unknown,'007');assert.equal(d.raw.notes.raw,'Ä;"ß"\nline');assert.ok(d.unknownFields.includes('unknown'));
});
test('fewer/reordered columns preserve absent values and semantic equivalence, known typing only',async()=>{
 const a=await parseCsv('session_uuid;tmt_a_s;new_field\n"sess_a";"12.00";"0008"');
 const b=await parseCsv('new_field;tmt_a_s;session_uuid\r\n"0008";"12";"sess_a"\r\n');
 assert.equal(a.semanticHash,b.semanticHash);assert.equal(a.normalized.new_field,'0008');assert.equal(a.normalized.moca_total,undefined);assert.deepEqual(changedFields(a,b),[]);
 const c=await parseCsv('session_uuid;tmt_a_s;new_field\n"sess_a";"13";"0008"');assert.deepEqual(changedFields(a,c),['tmt_a_s']);
});
test('invalid quoting, headers, rows, identity and large input are rejected',async()=>{
 for(const s of ['session_uuid;x;x\n"a";1;2','session_uuid;x\n"a"','session_uuid\n"a"\n"b"','session_uuid\n"a"junk','session_uuid\n"a','session_uuid\na"b','x\n1','session_uuid\n"bad space"','session_uuid;constructor\na;b','session_uuid;sessionUUID\na;b'])await assert.rejects(parseCsv(s));
 assert.throws(()=>parseTable('x'.repeat(8*1024*1024+1)),/8 MiB/);
});
test('dates validated explicitly without inventing timezone; invalid numeric source preserved',async()=>{
 assert.equal(germanDate('29.2.2024'),'2024-02-29');assert.equal(germanDate('29.2.2025'),null);assert.equal(germanDate('12/31/2026'),null);
 const d=await parseCsv('session_uuid;testing_start_date;tmt_a_s\n"a";"31.2.2026";"12,5"');assert.equal(d.date,null);assert.equal(d.normalized.tmt_a_s,'12,5');assert.ok(d.warnings.length>1);
});
test('empty producer assessment never fills scores with zero',async()=>{
 const d=await parseCsv(await fixture('empty-assessment.csv'),columns);assert.equal(d.normalized.tmt_a_s,null);assert.equal(d.normalized.phq9_total,null);assert.equal(d.normalized.rey_copy_total,null);
});
test('capability gate rejects file launch, insecure context and missing picker; locks do not impersonate folder capability',()=>{
 const env={isSecureContext:true,location:{protocol:'https:'},showDirectoryPicker(){},crypto:{subtle:{}},FileSystemFileHandle:{prototype:{createWritable(){}}},navigator:{locks:{}}};
 assert.equal(canOpen(capabilities(env)),true);
 for(const override of [{isSecureContext:false},{location:{protocol:'file:'}},{showDirectoryPicker:undefined},{FileSystemFileHandle:undefined},{crypto:{}}])assert.equal(canOpen(capabilities({...env,...override})),false);
});
