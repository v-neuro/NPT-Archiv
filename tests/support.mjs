import { readFile,writeFile,mkdir,readdir,access,rm,stat } from 'node:fs/promises';
import { join,dirname } from 'node:path';
import { uid } from '../src/shared.js';
import { parseCsv } from '../src/csv.js';

export class DiskStorage {
  constructor(root){this.root=root;this.fault=null;this.calls=[];}
  path(p){if(p.split('/').some(x=>!x||x==='.'||x==='..'||!/^[A-Za-z0-9._-]+$/.test(x)))throw Error('Invalid path');return join(this.root,p);}
  check(phase,path){this.calls.push({phase,path});if(this.fault?.(phase,path))throw Error(`Injected ${phase} failure`);}
  async exists(p){this.check('exists',p);try{await access(this.path(p));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
  async stat(p){this.check('stat',p);const s=await stat(this.path(p));return {size:s.size,lastModified:Math.trunc(s.mtimeMs)};}
  async writeCache(p,data){if(!/^indexes\/v1\/[a-f0-9]{64}\.json$/.test(p))throw Error('Unsafe cache path');this.check('cache',p);await mkdir(dirname(this.path(p)),{recursive:true});await writeFile(this.path(p),data);}
  async read(p,limit=16*1024*1024){this.check('read',p);const b=new Uint8Array(await readFile(this.path(p)));if(b.length>limit)throw Error('Limit');return b;}
  async writeNew(p,data){this.check('before-write',p);await mkdir(dirname(this.path(p)),{recursive:true});
    if(this.fault?.('partial-write',p)){await writeFile(this.path(p),data.subarray(0,Math.max(1,Math.floor(data.length/2))),{flag:'wx'});throw Error('Injected partial write');}
    await writeFile(this.path(p),data,{flag:'wx'});this.check('after-close',p);
  }
  async list(p=''){this.check('list',p);try{return (await readdir(p?this.path(p):this.root,{withFileTypes:true})).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'})).sort((a,b)=>a.name.localeCompare(b.name));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  async removeOwnedProbe(p){await rm(this.path(p));}
}
export const fixture=async(name='2026-01-15_08-30_SYNTH_00000000-0000-4000-8000-000000000001.csv')=>new Uint8Array(await readFile(new URL('../fixtures/'+name,import.meta.url)));
export const makeFile=(name,data)=>({name,size:data.length,arrayBuffer:async()=>new Uint8Array(data).buffer});
export function syntheticPdf(hostile=true){
  const content='BT /F1 18 Tf 45 750 Td (SYNTHETIC NPT archive report - no patient data) Tj ET';
  const objects=[
    `<< /Type /Catalog /Pages 2 0 R${hostile?' /OpenAction 7 0 R':''} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R${hostile?' /Annots [6 0 R]':''} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ...(hostile?['<< /Type /Annot /Subtype /Link /Rect [0 0 595 842] /A << /S /URI /URI (https://example.invalid/SYNTHETIC-MUST-NOT-LEAVE) >> >>',
    '<< /S /JavaScript /JS (app.launchURL("https://example.invalid/SYNTHETIC-MUST-NOT-LEAVE")) >>']:[])
  ];
  let out='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(out);out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const n of offsets.slice(1))out+=String(n).padStart(10,'0')+' 00000 n \n';
  out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
export async function sampleOperations(){
  const csv=await fixture();const document=await parseCsv(csv);const {sha256}=await import('../src/shared.js');const hash=await sha256(csv);
  const patient={id:uid(),identifier:'000123',label:'SYNTHETISCH'};const assessment={id:uid(),sessionId:document.sessionId,patientId:patient.id,stayId:'0000456'};
  const revision={id:uid(),document,reason:'Synthetic test',original:{id:uid(),hash,size:csv.length,name:'synthetic.csv',kind:'csv',method:'explicit-review',note:'',revisionId:null}};
  return {patient,assessment,revision,csv,operations:[{type:'patient.create',patient},{type:'assessment.create',assessment},{type:'revision.add',assessmentId:assessment.id,revision}],files:new Map([[hash,csv]])};
}
