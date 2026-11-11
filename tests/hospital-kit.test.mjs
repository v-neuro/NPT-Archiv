import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createHospitalTestKit } from '../scripts/hospital-test-kit.mjs';
import { Archive } from '../src/archive.js';
import { APP_VERSION } from '../src/shared.js';
import { DiskStorage,makeFile } from './support.mjs';
import { inspectFiles,planPatientImport } from '../src/import.js';
test('hospital test kit freezes matching application hashes and contains only generated synthetic exercises with usable IDs/PDF links',async t=>{
 const root=await mkdtemp(join(tmpdir(),'npt-hospital-kit-'));t.after(()=>rm(root,{recursive:true,force:true}));const destination=join(root,'kit'),freeze={staticSha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),createdAt:'2026-11-11T12:00:00Z'};const kit=await createHospitalTestKit(destination,freeze);assert.deepEqual(kit,{patients:7,assessments:21});
 const metadata=JSON.parse(await readFile(join(destination,'FREEZE.json'),'utf8'));assert.equal(metadata.appVersion,APP_VERSION);assert.equal(metadata.syntheticOnly,true);assert.equal(metadata.staticSha256,freeze.staticSha256);assert.equal(metadata.sourceSha256,freeze.sourceSha256);
 const staff=await readFile(join(destination,'TESTPLAN.html'),'utf8'),it=await readFile(join(destination,'IT-PROTOKOLL.html'),'utf8');assert.ok(staff.includes(APP_VERSION));assert.ok(!staff.includes('{{'));assert.ok(it.includes(freeze.staticSha256));assert.ok(it.includes(freeze.sourceSha256));for(const html of [staff,it]){assert.ok(!/<script|https?:\/\/|<form[\s>]/i.test(html));assert.match(html,/Strg\+P/);}
 for(const line of (await readFile(join(destination,'DATEIEN-SHA256.txt'),'utf8')).trim().split('\n')){const [digest,name]=line.split('  ');assert.equal(createHash('sha256').update(await readFile(join(destination,name))).digest('hex'),digest,name);}
 const archive=await Archive.open(new DiskStorage(join(destination,'Uebungsbibliothek','Bibliothek')),{compact:true});assert.equal(archive.snapshot.manifest.syntheticOnly,true);assert.equal(archive.snapshot.readOnly,false);assert.equal(Object.keys(archive.snapshot.state.assessments).length,21);
 for(const folder of ['01-Erster-Import','04-Weiterer-Aufenthalt']){const files=await Promise.all((await readdir(join(destination,folder))).map(async name=>makeFile(name,new Uint8Array(await readFile(join(destination,folder,name))))));const empty={patients:{},assessments:{},unlinked:{}},rows=await inspectFiles(files,empty,[]),plan=planPatientImport(rows,empty,{identifier:'00012345',stayId:'0006789',assessmentTypeId:'general-neurology',confirmedPatientId:''});assert.equal(plan.ready,true,folder);assert.equal(plan.csvCount,1);assert.equal(plan.pdfCount,1);}
});
