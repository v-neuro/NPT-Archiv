import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {aggregateStatistics,newStatisticsSettings,statisticsRange,bucketLabel,validStatisticsDay,localToday,MAX_STATISTICS_BUCKETS} from '../src/statistics.js';
import {statisticsView} from '../src/statistics-view.js';
import {Archive} from '../src/archive.js';
import {createArchive} from '../src/storage.js';
import {inspectFiles,buildPatientImport} from '../src/import.js';
import {selectedRevision} from '../src/model.js';
import {DiskStorage,makeFile} from './support.mjs';

const settings=(extra={})=>({...newStatisticsSettings(),preset:'custom',from:'2026-01-01',to:'2026-01-03',interval:'day',...extra});
function assessment(id,date,type='memory-clinic',patientId='patient-1',extra={}){return {id,patientId,assessmentTypeId:type,excluded:false,selectedRevisionId:id+'-r',revisions:[{id:id+'-r',document:{date,raw:{future_score:{raw:'-0.0000000000000001',missing:false}}}}],attachments:[],...extra};}
const state=(...assessments)=>({patients:{},assessments:Object.fromEntries(assessments.map(a=>[a.id,a]))});

test('presets use rolling calendar months through today with explicit inclusive, leap-year-safe bounds',()=>{
 for(const [preset,from] of [['1m','2026-10-14'],['3m','2026-08-14'],['6m','2026-05-14'],['1y','2025-11-14']])assert.deepEqual(statisticsRange({preset},'2026-11-13'),{from,to:'2026-11-13',valid:true});
 assert.equal(statisticsRange({preset:'1m'},'2024-02-29').from,'2024-02-01');assert.equal(statisticsRange({preset:'1m'},'2024-03-30').from,'2024-02-29');assert.equal(statisticsRange({preset:'1m'},'2023-03-30').from,'2023-02-28');assert.equal(statisticsRange({preset:'1m'},'2026-01-31').from,'2026-01-01');
 const d=new Date('2026-12-31T23:30:00Z');assert.equal(localToday(d),[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'));
});

test('days include zero periods and inclusive boundaries; revisions and PDFs do not multiply examinations',()=>{
 const first=assessment('a','2026-01-01','epilepsy-localisation'),second=assessment('b','2026-01-03','memory-clinic');first.revisions.push({id:'old',document:{date:'2025-12-31'}});first.attachments.push({kind:'pdf'},{kind:'pdf'});
 const source=state(first,second,assessment('outside','2026-01-04')),before=structuredClone(source),options=settings(),result=aggregateStatistics(source,options);
 assert.equal(result.total,2);assert.equal(result.patients,1);assert.deepEqual(result.buckets.map(row=>row.total),[1,0,1]);assert.equal(result.totals['memory-clinic'],1);assert.equal(result.totals['epilepsy-localisation'],1);assert.equal(result.buckets[1].values['memory-clinic'],0);assert.deepEqual(source,before);assert.equal(options.types,null);
});

test('included-only is the default; optional exclusions and chosen types combine and unique patients are counted once',()=>{
 const source=state(assessment('a','2026-01-01'),assessment('b','2026-01-02','suspected-nph','patient-1',{excluded:true}),assessment('c','2026-01-03','suspected-nph','patient-2'),assessment('d','2026-01-03','memory-clinic',null));
 let result=aggregateStatistics(source,settings());assert.equal(result.total,3);assert.equal(result.patients,2);assert.equal(result.unassignedPatients,1);assert.equal(result.excluded,0);
 result=aggregateStatistics(source,settings({includeExcluded:true}));assert.equal(result.total,4);assert.equal(result.patients,2);assert.equal(result.excluded,1);
 result=aggregateStatistics(source,settings({includeExcluded:true,types:new Set(['suspected-nph'])}));assert.equal(result.total,2);assert.equal(result.totals['suspected-nph'],2);assert.equal(result.series.length,1);assert.equal(result.buckets[0].total,0);
 result=aggregateStatistics(source,settings({types:new Set()}));assert.equal(result.total,0);assert.equal(result.series.length,0);
});

test('weekly buckets run Monday–Sunday, preserve ISO week years and clip partial edge weeks',()=>{
 const source=state(...['2024-12-29','2024-12-30','2025-01-05','2025-01-06'].map((date,index)=>assessment(String(index),date)));
 const result=aggregateStatistics(source,settings({from:'2024-12-29',to:'2025-01-06',interval:'week'}));assert.deepEqual(result.buckets.map(row=>row.label),['KW 52 / 2024','KW 01 / 2025','KW 02 / 2025']);assert.deepEqual(result.buckets.map(row=>row.total),[1,2,1]);assert.equal(result.buckets[0].from,'2024-12-29');assert.equal(result.buckets[0].to,'2024-12-29');assert.equal(result.buckets[2].to,'2025-01-06');assert.equal(bucketLabel('2020-12-28','week'),'KW 53 / 2020');
 const dst=aggregateStatistics(state(assessment('a','2026-10-25'),assessment('b','2026-10-26')),settings({from:'2026-10-25',to:'2026-10-26',interval:'week'}));assert.deepEqual(dst.buckets.map(row=>row.total),[1,1]);
});

test('monthly buckets include calendar gaps and a selected revision controls the source examination date',()=>{
 const a=assessment('a','2026-03-01');a.revisions.push({id:'old',document:{date:'2026-01-15'}});
 let result=aggregateStatistics(state(a),settings({from:'2026-01-15',to:'2026-03-01',interval:'month'}));assert.deepEqual(result.buckets.map(row=>row.total),[0,0,1]);assert.deepEqual(result.buckets.map(row=>row.label),['01.2026','02.2026','03.2026']);
 a.selectedRevisionId='old';result=aggregateStatistics(state(a),settings({from:'2026-01-15',to:'2026-03-01',interval:'month'}));assert.deepEqual(result.buckets.map(row=>row.total),[1,0,0]);assert.equal(result.total,1);
});

test('missing/invalid dates stay unplaced, legacy unassigned types remain explicit, and unknown types are not relabelled',()=>{
 const source=state(assessment('undated',null),assessment('invalid','2026-02-30'),assessment('outside','2025-01-01'),assessment('legacy','2026-01-02',null),assessment('future','2026-01-03','future-type'));
 const result=aggregateStatistics(source,settings());assert.equal(result.total,2);assert.equal(result.undated,2);assert.equal(result.totals.unassigned,1);assert.equal(result.totals['future-type'],1);assert.match(result.series.find(s=>s.id==='future-type').label,/Unbekannte Untersuchungsart/);
 for(const date of [null,undefined,'','01.01.2026','2026-02-30','2025-02-29','2026-13-01'])assert.equal(validStatisticsDay(date),false);
});

test('invalid ranges and intervals are visible errors; large charts never silently drop records or change the chosen interval',()=>{
 for(const extra of [{from:''},{to:'bad'},{from:'2026-02-01',to:'2026-01-01'},{interval:'quarter'}])assert.equal(aggregateStatistics(state(),settings(extra)).valid,false);
 const source=state(assessment('a','2026-01-01')),result=aggregateStatistics(source,settings({from:'2000-01-01',to:'2026-01-03'}));assert.equal(result.total,1);assert.equal(result.tooManyBuckets,true);assert.equal(result.buckets.length,0);assert.ok(MAX_STATISTICS_BUCKETS>=366);
 const monthly=aggregateStatistics(source,settings({from:'2000-01-01',to:'2026-01-03',interval:'month'}));assert.equal(monthly.tooManyBuckets,false);assert.equal(monthly.total,1);assert.equal(monthly.buckets.length,313);
});

test('chart markup retains exact accessible count tables and safely escapes unforeseen type labels',()=>{
 const html=statisticsView(state(assessment('a','2026-01-01','<img src=x onerror=alert(1)>')),settings());assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('Zahlen als Tabelle'));assert.ok(html.includes('data-stat-row-total="1"'));assert.ok(html.includes('aria-labelledby="statistics-chart-title"'));assert.ok(!html.includes(' style='));
 const invalid=statisticsView(state(),settings({from:''}));assert.ok(invalid.includes('role="alert"'));const noTypes=statisticsView(state(),settings({types:new Set()}));assert.ok(noTypes.includes('Mindestens eine Untersuchungsart'));
});

test('statistics agree after compact indexes, folder-only reopen and explicit revision selection without source writes',async t=>{
 const root=await mkdtemp(join(tmpdir(),'npt-statistics-'));t.after(()=>rm(root,{recursive:true,force:true}));const storage=new DiskStorage(root);await createArchive(storage);const archive=await Archive.open(storage,{compact:true});
 const encode=date=>new TextEncoder().encode(`session_uuid;testing_start_date;future_score\n"stats_source";"${date}";"0"`),draft={identifier:'000123',stayId:'000456',assessmentTypeId:'memory-clinic',actor:'TEST'};
 let rows=await inspectFiles([makeFile('first.csv',encode('15.1.2026'))],archive.snapshot.state,[]),built=buildPatientImport(rows,archive.snapshot.state,draft);await archive.commit(built.operations,built.files,built.actor);const first=Object.values(archive.snapshot.state.assessments)[0];
 rows=await inspectFiles([makeFile('revised.csv',encode('1.2.2026'))],archive.snapshot.state,[],async()=>selectedRevision(await archive.assessmentDetail(first.id)).document);Object.assign(rows[0],{action:'select',note:'SYNTHETIC selected-date correction'});built=buildPatientImport(rows,archive.snapshot.state,{...draft,confirmedPatientId:first.patientId});await archive.commit(built.operations,built.files,built.actor);
 const options=settings({from:'2026-01-01',to:'2026-02-28',interval:'month'});storage.calls=[];assert.deepEqual(aggregateStatistics(archive.snapshot.state,options).buckets.map(row=>row.total),[0,1]);assert.equal(storage.calls.length,0);
 for(const compact of [true,false]){const opened=await Archive.open(new DiskStorage(root),{compact});assert.deepEqual(aggregateStatistics(opened.snapshot.state,options).buckets.map(row=>row.total),[0,1]);}
 await archive.commit([{type:'revision.select',assessmentId:first.id,revisionId:first.revisions[0].id}]);assert.deepEqual(aggregateStatistics(archive.snapshot.state,options).buckets.map(row=>row.total),[1,0]);
});
