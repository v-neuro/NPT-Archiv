// Development-side packaging only. Does not access any existing library.
import { mkdir,writeFile,readFile,copyFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDemo } from './create-demo.mjs';
import { APP_VERSION } from '../src/shared.js';
const project=new URL('../',import.meta.url);
const csvName='2026-01-15_08-30_SYNTH_00000000-0000-4000-8000-000000000001.csv';
export async function createHospitalTestKit(destination,freeze){
 await mkdir(destination,{recursive:false});
 for(const [template,name] of [['HOSPITAL-STAFF.html','TESTPLAN.html'],['HOSPITAL-IT.html','IT-PROTOKOLL.html']]){
  const original=await readFile(new URL('docs/'+template,project),'utf8');await writeFile(join(destination,name),original.replaceAll('{{APP_VERSION}}',APP_VERSION).replaceAll('{{STATIC_SHA256}}',freeze.staticSha256).replaceAll('{{SOURCE_SHA256}}',freeze.sourceSha256));
 }
 for(const folder of ['01-Erster-Import','02-Geaenderte-Fassung','03-PDF-Namenskonflikt','04-Weiterer-Aufenthalt'])await mkdir(join(destination,folder));
 await copyFile(new URL('fixtures/'+csvName,project),join(destination,'01-Erster-Import',csvName));
 await copyFile(new URL('fixtures/'+csvName.replace('.csv','.pdf'),project),join(destination,'01-Erster-Import',csvName.replace('.csv','.pdf.pdf')));
 await copyFile(new URL('fixtures/revised-same-session.csv',project),join(destination,'02-Geaenderte-Fassung','revised-same-session.csv'));
 await copyFile(new URL('fixtures/'+csvName.replace('.csv','.pdf'),project),join(destination,'03-PDF-Namenskonflikt','SYNTHETIC_falscher-Bericht.pdf'));
 const second=(await readFile(new URL('fixtures/'+csvName,project),'utf8')).replaceAll('00000000-0000-4000-8000-000000000001','sess_hospital_trial_2').replaceAll('15.1.2026','16.1.2026');
 await writeFile(join(destination,'04-Weiterer-Aufenthalt','SYNTHETIC_zweiter-Aufenthalt.csv'),second);
 await copyFile(new URL('fixtures/'+csvName.replace('.csv','.pdf'),project),join(destination,'04-Weiterer-Aufenthalt','SYNTHETIC_zweiter-Aufenthalt.pdf'));
 const demo=await createDemo(join(destination,'Uebungsbibliothek'),21);
 await writeFile(join(destination,'FREEZE.json'),JSON.stringify({...freeze,appVersion:APP_VERSION,syntheticOnly:true,practicePatients:demo.patients,practiceAssessments:demo.assessments,applicationLaunch:'IT-approved HTTPS URL only; no file:// application launch',sourceOfTruth:'Library folder; test kit is never a production patient archive'},null,2)+'\n');
 await writeFile(join(destination,'ZUERST-LESEN.txt'),`NPT-Archiv ${APP_VERSION} · Krankenhaus-Testpaket · NUR ERFUNDENE DATEN\n\nTESTPLAN.html: lokal im Browser lesen/drucken; keine Ordner-APIs nötig.\nIT-PROTOKOLL.html: drucken und Ergebnisse festhalten.\n01–04: Dateien für die geführten Übungen.\nUebungsbibliothek/Bibliothek: separate fertige Übung mit 7 Patienten und 21 Untersuchungen.\n\nDie Archiv-App über die vereinbarte HTTPS-Adresse öffnen, nicht aus diesem Ordner starten. IT stellt dafür exakt static-application.zip des gleichen Handoffs bereit. ZIP-Prüfsummen in FREEZE.json; alle Testdateien in DATEIEN-SHA256.txt. Keine Updates während des Tests.\n\nNeue Testbibliothek auf dem vorgesehenen Netzlaufwerk anlegen. Ausschließlich Kopien der synthetischen Bibliothek für Fehler-/Wiederherstellungsübungen verwenden. Echte Archive und Quellcode/Webhosting getrennt halten.\n`);
 const entries=[];
 async function walk(path,prefix=''){for(const item of await readdir(path,{withFileTypes:true})){if(item.isSymbolicLink())throw Error('Test kit must not contain symbolic links');const name=prefix?prefix+'/'+item.name:item.name,file=join(path,item.name);if(item.isDirectory())await walk(file,name);else entries.push({name,path:file});}}
 await walk(destination);entries.sort((a,b)=>a.name.localeCompare(b.name));
 await writeFile(join(destination,'DATEIEN-SHA256.txt'),(await Promise.all(entries.map(async item=>createHash('sha256').update(await readFile(item.path)).digest('hex')+'  '+item.name))).join('\n')+'\n');
 return {patients:demo.patients,assessments:demo.assessments};
}
