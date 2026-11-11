// Developer benchmark: actual-format CSVs, tiny synthetic PDFs, local disk. Never a network-share performance guarantee.
import assert from 'node:assert/strict';
import { mkdtemp,rm,mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture,syntheticPdf,DiskStorage } from './support.mjs';
import { createArchive,verifiedWrite } from '../src/storage.js';
import { scanArchive,seal } from '../src/archive.js';
import { objectPath } from '../src/model.js';
import { decode,sha256,uid,bytes,FORMAT } from '../src/shared.js';
import { parseCsv } from '../src/csv.js';
import { scanLibrary,writeLibraryIndex } from '../src/library.js';
import { ASSESSMENT_TYPES } from '../src/assessment-types.js';
const count=Number(process.env.ARCHIVE_VOLUME_COUNT||780);
assert.ok(Number.isInteger(count)&&count>0&&count<=10000);
const directory=await mkdtemp(join(tmpdir(),'npt-archive-volume-'));const storage=new DiskStorage(directory);
const template=decode(await fixture());const originalId='00000000-0000-4000-8000-000000000001';
try{
 const manifest=await createArchive(storage);let head=null,totalBytes=0;const created=performance.now();
 for(let base=0;base<count;base+=15){
  const operations=[];
  for(let i=base;i<Math.min(count,base+15);i++){
   const sessionId=`sess_synthetic_volume_${i}`;const csv=bytes(template.replaceAll(originalId,sessionId));const document=await parseCsv(csv);const csvHash=await sha256(csv);
   const pdf=bytes(decode(syntheticPdf())+`\n% SYNTHETIC VOLUME ${i}\n`),pdfHash=await sha256(pdf);
   const patient={id:uid(),identifier:String(i).padStart(8,'0'),label:'SYNTHETIC VOLUME'};
   const assessment={id:uid(),sessionId,patientId:patient.id,stayId:String(i).padStart(8,'0'),assessmentTypeId:ASSESSMENT_TYPES[i%7].id};
   const original={id:uid(),hash:csvHash,size:csv.length,name:`synthetic-${i}.csv`,kind:'csv',method:'synthetic-benchmark',note:'',revisionId:null};
   const attachment={id:uid(),hash:pdfHash,size:pdf.length,name:`synthetic-${i}.pdf`,kind:'pdf',method:'synthetic-benchmark',note:'',revisionId:null};
   await verifiedWrite(storage,objectPath(original),csv);await verifiedWrite(storage,objectPath(attachment),pdf);totalBytes+=csv.length+pdf.length;
   operations.push({type:'patient.create',patient},{type:'assessment.create',assessment},{type:'revision.add',assessmentId:assessment.id,revision:{id:uid(),document,original,reason:'Synthetic volume generation'}},{type:'attachment.add',assessmentId:assessment.id,attachment});
  }
  const p={format:FORMAT+'-commit',schemaVersion:1,archiveId:manifest.archiveId,id:uid(),parent:head,createdAt:new Date().toISOString(),actor:'SYNTHETIC VOLUME',operations};
  const record=await seal(p),data=bytes(JSON.stringify(record));await verifiedWrite(storage,`records/${p.id}.json`,data);head=record.checksum;totalBytes+=data.length;
 }
 storage.calls=[];global.gc?.();
 let baseline=null;
 if(process.env.ARCHIVE_VOLUME_BASELINE==='1'){const start=performance.now();let full=await scanArchive(storage);global.gc?.();baseline={seconds:+((performance.now()-start)/1000).toFixed(2),heapMiB:Math.round(process.memoryUsage().heapUsed/1024/1024),originalsHashed:count*2};assert.equal(Object.keys(full.state.assessments).length,count);full=null;storage.calls=[];global.gc?.();}
 const opened=performance.now();let result=await scanLibrary(storage);const ended=performance.now();global.gc?.();
 assert.equal(result.readOnly,false);assert.equal(result.head,head);assert.equal(Object.keys(result.state.assessments).length,count);
 assert.equal(Object.values(result.state.assessments).filter(a=>a.attachments.length===1).length,count);
 const coldHeap=Math.round(process.memoryUsage().heapUsed/1024/1024);await writeLibraryIndex(storage,result);result=null;storage.calls=[];global.gc?.();
 const warmStarted=performance.now();result=await scanLibrary(storage);const warmEnded=performance.now();global.gc?.();
 assert.equal(result.metrics.sourceRecordsRead,0);assert.equal(result.metrics.originalsHashed,0);assert.equal(result.head,head);
 const report={count,baseline,commits:result.records.length,formatColumns:388,originals:count*2,sourceArchiveBytes:totalBytes,generationSeconds:+((opened-created)/1000).toFixed(2),coldRebuildSeconds:+((ended-opened)/1000).toFixed(2),coldHeapMiB:coldHeap,warmOpenSeconds:+((warmEnded-warmStarted)/1000).toFixed(2),warmHeapMiB:Math.round(process.memoryUsage().heapUsed/1024/1024),warmMetrics:result.metrics,environment:'developer local disk; tiny synthetic PDFs, not hospital network or realistic report sizes'};
 await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});await writeFile(new URL(`../test-results/volume-indexed-${count}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await rm(directory,{recursive:true,force:true});}
