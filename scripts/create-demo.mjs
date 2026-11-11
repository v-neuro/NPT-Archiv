// Development-only synthetic library and an import exercise. Never reads an existing patient folder.
import { mkdir,writeFile,readFile,copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createArchive,verifiedWrite } from '../src/storage.js';
import { Archive,seal } from '../src/archive.js';
import { objectPath } from '../src/model.js';
import { parseCsv } from '../src/csv.js';
import { ASSESSMENT_TYPES } from '../src/assessment-types.js';
import { bytes,sha256,uid,FORMAT } from '../src/shared.js';
import { DiskStorage,fixture,syntheticPdf } from '../tests/support.mjs';
export async function createDemo(root,count=240){
 await mkdir(root,{recursive:false});await mkdir(join(root,'Bibliothek'));await mkdir(join(root,'Importuebung'));
 const storage=new DiskStorage(join(root,'Bibliothek')),manifest=await createArchive(storage,{syntheticOnly:true});
 const knownColumns=JSON.parse(await readFile(new URL('../src/export-columns.json',import.meta.url))).columns;
 const template=await parseCsv(await fixture(),knownColumns),patients=new Map(),assessments=[];let head=null,originalCount=0,revisionCount=0;
 function csvFor(sessionId,n,date='15.1.2026',revised=false,revisionOffset=7){
  const overrides={session_uuid:sessionId,demographics_patient_initials:`S${String(n%80+1).padStart(3,'0')}`,testing_start_date:date,testing_start_time:'08:30:00',tmt_a_s:String(12+n%60+(revised?revisionOffset:0)),phq9_manual_total:String(n%5===0?0:n%17),phq9_total:String(n%5===0?0:n%17)};
  const headers=[...template.headers,'synthetic_future_field'];
  return bytes(headers.join(';')+'\n'+headers.map(key=>{
   const cell=Object.hasOwn(overrides,key)?{raw:overrides[key],missing:false}:key==='synthetic_future_field'?{raw:`SYNTHETIC ONLY; unknown field ${n}`,missing:false}:template.raw[key];
   return cell.missing?'':`"${cell.raw.replace(/"/g,'""')}"`;
  }).join(';'));
 }
 const original=async(name,data,kind)=>{
  const a={id:uid(),hash:await sha256(data),size:data.length,name,kind,method:'synthetic-demo-generator',note:'Erfundene Beispieldatei; keine klinischen Aussagen.',revisionId:null};
  if(!await storage.exists(objectPath(a))){await verifiedWrite(storage,objectPath(a),data);originalCount++;}return a;
 };
 const save=async operations=>{
  const payload={format:FORMAT+'-commit',schemaVersion:1,archiveId:manifest.archiveId,id:uid(),parent:head,createdAt:new Date().toISOString(),actor:'SYNTHETISCHE ÜBUNG',operations};
  const record=await seal(payload);await verifiedWrite(storage,`records/${payload.id}.json`,JSON.stringify(record));head=record.checksum;
 };
 for(let base=0;base<count;base+=15){
  const ops=[];
  for(let n=base;n<Math.min(base+15,count);n++){
   const patientIndex=Math.floor(n/3),visit=n%3;
   let patient=patients.get(patientIndex);
   if(!patient){patient={id:uid(),identifier:String(90000001+patientIndex).padStart(10,'0'),label:`ÜBUNG ${String(patientIndex+1).padStart(3,'0')}`};patients.set(patientIndex,patient);ops.push({type:'patient.create',patient});}
   const stamp=new Date(Date.UTC(2024+visit,patientIndex%12,1+patientIndex%27));
   const date=`${stamp.getUTCDate()}.${stamp.getUTCMonth()+1}.${stamp.getUTCFullYear()}`;
   const id=uid(),sessionId=`sess_synthetic_${String(n+1).padStart(6,'0')}`,stayId=String(80000000+patientIndex*10+(visit===2?1:0)).padStart(10,'0');
   const type=ASSESSMENT_TYPES[n%7],stem=`SYNTHETIC_${stamp.toISOString().slice(0,10)}_${sessionId}`;
   const csv=csvFor(sessionId,n,date),document=await parseCsv(csv,knownColumns);
   const a={id,sessionId,patientId:patient.id,stayId,assessmentTypeId:n%13===0?null:type.id};
   ops.push({type:'assessment.create',assessment:a});
   const revision={id:uid(),document,original:await original(stem+'.csv',csv,'csv'),reason:'Erfundene Untersuchung zum Ausprobieren.'};revisionCount++;
   ops.push({type:'revision.add',assessmentId:id,revision});
   if(n%5!==0){const pdf=bytes(new TextDecoder().decode(syntheticPdf(false))+`\n% SYNTHETIC ${sessionId}\n`);ops.push({type:'attachment.add',assessmentId:id,attachment:await original(stem+'.pdf',pdf,'pdf')});}
   if(n%10===0){const revised=csvFor(sessionId,n,date,true);const r={id:uid(),document:await parseCsv(revised,knownColumns),original:await original(stem+'-ueberarbeitet.csv',revised,'csv'),reason:'Erfundene überarbeitete Exportdatei; ursprüngliche Fassung bleibt erhalten.'};revisionCount++;ops.push({type:'revision.add',assessmentId:id,revision:r});if(n%20===0)ops.push({type:'revision.select',assessmentId:id,revisionId:r.id});}
   if(n%26===0)ops.push({type:'assessment.type.set',assessmentId:id,assessmentTypeId:type.id,reason:'Art einer älteren erfundenen Untersuchung nachgetragen.'});
   assessments.push({id,sessionId,stayId,typeId:a.assessmentTypeId??'',patientIdentifier:patient.identifier,date,stem,csv});
  }
  await save(ops);
 }
 const openPdf=await original('SYNTHETIC_Bericht_ohne_Zuordnung.pdf',syntheticPdf(false),'pdf');await save([{type:'attachment.unlinked',attachment:openPdf}]);
 const first=assessments[0];
 await writeFile(join(root,'Importuebung',first.stem+'.csv'),first.csv);
 await writeFile(join(root,'Importuebung','SYNTHETIC_geaenderte_Fassung.csv'),csvFor(first.sessionId,0,first.date,true,14));
 const missing=assessments.find((_,i)=>i%5===0);
 await writeFile(join(root,'Importuebung',missing.stem+'.pdf'),bytes(new TextDecoder().decode(syntheticPdf(false))+'\n% SYNTHETIC LATE REPORT\n'));
 const assignments=[];
 for(let i=0;i<4;i++){
  const n=count+i,sessionId=`sess_synthetic_new_${i+1}`,stem=`SYNTHETIC_neu_${i+1}_${sessionId}`;
  await writeFile(join(root,'Importuebung',stem+'.csv'),csvFor(sessionId,n,'10.11.2026'));
  if(i<3)await writeFile(join(root,'Importuebung',stem+'.pdf'),bytes(new TextDecoder().decode(syntheticPdf(false))+`\n% SYNTHETIC NEW ${i}\n`));
  assignments.push({file:stem+'.csv',patientId:patients.get(Math.floor(i/2)).identifier,stayId:String(88000001+Math.floor(i/2)).padStart(10,'0'),assessmentType:ASSESSMENT_TYPES[i].label});
 }
 await writeFile(join(root,'Importuebung','SYNTHETIC_fehlerhafte_Datei.csv'),'session_uuid;notes\n"unterminated');
 const archive=await Archive.open(storage,{compact:true});await archive.rebuildIndex();if(archive.snapshot.readOnly)throw Error('Synthetic library failed validation');
 await writeFile(join(root,'ZUORDNUNGSHILFE.json'),JSON.stringify({syntheticOnly:true,newFiles:assignments,revision:{file:'SYNTHETIC_geaenderte_Fassung.csv',patientId:first.patientIdentifier,stayId:first.stayId,assessmentType:ASSESSMENT_TYPES[0].label},laterReport:{file:missing.stem+'.pdf',patientId:missing.patientIdentifier,sessionId:missing.sessionId}},null,2)+'\n');
 await writeFile(join(root,'BITTE-LESEN.txt'),`Übungsbibliothek – ausschließlich erfundene Daten\n\n1. In der lokalen Archiv-App den Unterordner Bibliothek öffnen.\n2. Patienten und Untersuchungen nach Art filtern, Verläufe, Berichte und Fassungen ansehen.\n3. Für Importübungen jeweils Dateien aus Importuebung auswählen. Die identische und die geänderte CSV derselben Sitzung getrennt ausprobieren.\n4. Patienten-/Aufenthalts-IDs und Arten stehen in ZUORDNUNGSHILFE.json. Die fehlerhafte Datei soll abgewiesen werden.\n5. Unter Sicherung & Hilfe eine vollständige Kopie in einen anderen leeren Ordner erstellen und wieder öffnen.\n\nDie PDF-Dateien sind minimale erfundene Testberichte, keine Ausdrucke des Produzenten. Alle klinischen Werte sind erfunden; keine Interpretation. Dieser Ordner kann neu generiert werden und enthält keine echten Patienten.\n`);
 return {root,patients:patients.size,assessments:count,revisions:revisionCount,originals:originalCount,head};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const count=Number(process.env.ARCHIVE_DEMO_COUNT||240);if(!Number.isInteger(count)||count<7||count>10000)throw Error('ARCHIVE_DEMO_COUNT must be between 7 and 10000');
 const stamp=new Date().toISOString().replace(/[-:.]/g,'');
 const project=fileURLToPath(new URL('../',import.meta.url));
 const result=await createDemo(join(project,'..',`npt-archive-practice-${stamp}`),count);
await mkdir(join(project,'test-results'),{recursive:true});await writeFile(join(project,'test-results/demo-latest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
