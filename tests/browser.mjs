// Development-only browser harness. Native picker/permissions are simulated; file operations go to real temporary disk folders.
// Hospital Edge picker, permissions and network-share behavior require the manual acceptance procedure.
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,writeFile,readdir,stat,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { syntheticPdf } from './support.mjs';
import { createDemo } from '../scripts/create-demo.mjs';
import { ASSESSMENT_TYPES } from '../src/assessment-types.js';

const appUrl=process.env.ARCHIVE_APP_URL||'http://127.0.0.1:5186';
const debugUrl=process.env.ARCHIVE_CDP_URL||'http://127.0.0.1:9246';
const project=fileURLToPath(new URL('../',import.meta.url));
const work=await mkdtemp(join(tmpdir(),'npt-archive-browser-test-'));
await mkdir(join(work,'main'));await mkdir(join(work,'backup'));
const practice=await createDemo(join(work,'practice'),21);
const csvName='2026-01-15_08-30_SYNTH_00000000-0000-4000-8000-000000000001.csv';
const pdfPath=join(work,csvName.replace('.csv','.pdf'));await writeFile(pdfPath,syntheticPdf());
const {webSocketDebuggerUrl}=await(await fetch(`${debugUrl}/json/version`)).json();
const socket=new WebSocket(webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
let sequence=0;const pending=new Map(),events=[];
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Timed out: '+method));},20000);pending.set(id,{resolve,reject,timeout});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(!p)return;clearTimeout(p.timeout);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else{events.push(m);if(m.method==='Runtime.bindingCalled'&&m.params.name==='__diskBinding')handleDisk(m).catch(e=>console.error(e));}};
const evaluate=async(expression,sessionId)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
async function handleDisk(m){
  const {id,op,path='',root='main',data}=JSON.parse(m.params.payload);let value,error;
  try{
    if(!['main','backup','practice'].includes(root)||path.split('/').some(p=>p==='..'||p==='.'||p.includes('\\')))throw Error('Unsafe test path');
    const file=root==='practice'?join(practice.root,'Bibliothek',path):join(work,root,path);
    if(op==='list')value=(await readdir(file,{withFileTypes:true})).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'}));
    if(op==='dir'){await stat(file).catch(async e=>{if(e.code==='ENOENT'&&data?.create)await mkdir(file);else throw e;});if(!(await stat(file)).isDirectory())throw Error('Not directory');value=true;}
    if(op==='file'){await stat(file).catch(async e=>{if(e.code==='ENOENT'&&data?.create)await writeFile(file,'',{flag:'wx'});else throw e;});if(!(await stat(file)).isFile())throw Error('Not file');value=true;}
    if(op==='read')value={base64:(await readFile(file)).toString('base64'),mtime:(await stat(file)).mtimeMs};
    if(op==='write'){await writeFile(file,Buffer.from(data,'base64'));value=true;}
    if(op==='remove'){await rm(file);value=true;}
  }catch(e){error={name:e.code==='ENOENT'?'NotFoundError':e.name,message:e.message};}
  await evaluate(`window.__diskDone(${id},${JSON.stringify({value,error})})`,m.sessionId);
}
const bridge=`(() => {
 let sequence=0; const pending=new Map(); window.__selected='main'; window.__permission='granted'; window.__cancelPicker=false; window.__probeFailure=false; window.__pickerCalls=0;
 window.__diskDone=(id,value)=>{const p=pending.get(id);pending.delete(id);if(value.error)p.reject(new DOMException(value.error.message,value.error.name));else p.resolve(value.value);};
 const rpc=(op,path,root,data)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});window.__diskBinding(JSON.stringify({id,op,path,root,data}));});
 class Handle{constructor(path,root,kind){this.path=path;this.root=root;this.kind=kind;this.name=path.split('/').pop()||'SYNTHETIC-'+root;}async queryPermission(){return window.__permission;}async requestPermission(){return window.__permission;}}
 class FileHandle extends Handle{constructor(path,root){super(path,root,'file');}async getFile(){const r=await rpc('read',this.path,this.root);return new File([Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0))],this.name,{lastModified:r.mtime});}async createWritable(){if(window.__probeFailure)throw new DOMException('A requested file or directory could not be found at the time an operation was processed.','NotFoundError');let data;return{write:async value=>{data=await new Blob([value]).arrayBuffer();},close:async()=>{const a=new Uint8Array(data);let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));await rpc('write',this.path,this.root,btoa(s));},abort:async()=>{}};}}
 class DirHandle extends Handle{constructor(path,root){super(path,root,'directory');}child(name){return this.path?this.path+'/'+name:name;}async getDirectoryHandle(name,options={}){const path=this.child(name);await rpc('dir',path,this.root,options);return new DirHandle(path,this.root);}async getFileHandle(name,options={}){const path=this.child(name);await rpc('file',path,this.root,options);return new FileHandle(path,this.root);}async* entries(){for(const e of await rpc('list',this.path,this.root))yield[e.name,e.kind==='directory'?new DirHandle(this.child(e.name),this.root):new FileHandle(this.child(e.name),this.root)];}async removeEntry(name){await rpc('remove',this.child(name),this.root);}}
 window.showDirectoryPicker=async()=>{window.__pickerCalls++;if(window.__cancelPicker)throw new DOMException('Synthetic picker cancelled','AbortError');return new DirHandle('',window.__selected);};
})()`;
async function page(context){
 const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId:context});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);await send('Network.enable',{},sessionId);await send('Log.enable',{},sessionId);
 await send('Runtime.addBinding',{name:'__diskBinding'},sessionId);await send('Page.addScriptToEvaluateOnNewDocument',{source:bridge},sessionId);
 await send('Page.navigate',{url:appUrl},sessionId);await send('Page.bringToFront',{},sessionId);await until(()=>evaluate(`!!document.querySelector('#create-folder')`,sessionId),'initial app');return{targetId,sessionId};
}
async function until(check,label){const end=Date.now()+20000;while(Date.now()<end){if(await check())return;await delay(50);}throw Error('Timed out: '+label);}
let session;
const ev=expression=>evaluate(expression,session);
async function click(selector){await ev(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)throw Error('Missing/disabled ${selector}');n.click();})()`);await delay(80);}
async function fill(selector,value){await ev(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('Missing input');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function upload(paths){if(!await ev(`!!document.querySelector('#import-files')`))await click('[data-import-stage="1"]');const {root}=await send('DOM.getDocument',{},session);const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#import-files'},session);await send('DOM.setFileInputFiles',{nodeId,files:paths},session);await until(()=>ev(`!!document.querySelector('[data-row]')&&!document.querySelector('.busybar')`),'preview files');}
async function capture(name){await mkdir(join(project,'test-results'),{recursive:true});const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);await writeFile(join(project,'test-results',name+'.png'),Buffer.from(r.data,'base64'));}
async function idle(){await until(()=>ev(`!document.querySelector('.busybar')`),'operation complete');}
let context;
try{
 ({browserContextId:context}=await send('Target.createBrowserContext'));
 const first=await page(context);session=first.sessionId;
 const browserVersion=await send('Browser.getVersion');
 // Real browser directory/file APIs against OPFS, separate from simulated external selection.
 const native=await ev(`(async()=>{const d=await navigator.storage.getDirectory();const f=await d.getFileHandle('synthetic-stream-check',{create:true});const w=await f.createWritable();await w.write('SYNTHETIC');await w.close();const result=await(await f.getFile()).text();await d.removeEntry('synthetic-stream-check');return result;})()`);assert.equal(native,'SYNTHETIC');
 const nativeProbe=await ev(`(async()=>{const {FolderStorage,probeFolder}=await import('./storage.js');const root=await navigator.storage.getDirectory();const d=await root.getDirectoryHandle('synthetic-native-folder-probe',{create:true});try{return await probeFolder(new FolderStorage(d));}finally{await root.removeEntry('synthetic-native-folder-probe',{recursive:true});}})()`);assert.match(nativeProbe,/Wiederöffnen erfolgreich/);
 await click('#probe-folder');await idle();assert.match(await ev(`document.body.textContent`),/Wiederöffnen erfolgreich/);assert.deepEqual(await readdir(join(work,'main')),[]);
 await ev(`window.__probeFailure=true`);await click('#probe-folder');await idle();assert.match(await ev(`document.querySelector('main').textContent`),/Ordnerprüfung fehlgeschlagen: Schreibstream öffnen/);assert.ok(await ev(`!!document.querySelector('main [role="alert"] details')`));
 const leftovers=await readdir(join(work,'main'));assert.equal(leftovers.length,1);assert.match(leftovers[0],/^npt-ordnerpruefung-[a-f0-9-]+\.txt$/);await rm(join(work,'main',leftovers[0]));
 await ev(`window.__probeFailure=false`);await click('#probe-folder');await idle();assert.equal(await ev(`!!document.querySelector('main [role="alert"]')`),false);assert.deepEqual(await readdir(join(work,'main')),[]);
 const palette=await ev(`(()=>{const c=getComputedStyle(document.documentElement);return ['--cd-red','--cd-turquoise','--cd-yellow','--cd-beige','--cd-gray'].map(k=>c.getPropertyValue(k).trim())})()`);assert.deepEqual(palette,['#ae1613','#049e8e','#f4c245','#e6dcd1','#47403d']);
 const contrast=await ev(`(()=>{
   const rgb=s=>(s.match(/[\\d.]+/g)||[]).map(Number);
   const luminance=s=>rgb(s).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
   return ['aside .brand','aside nav button.active','aside nav button:not(.active)'].map(selector=>{
     const n=document.querySelector(selector);let ancestor=n,bg;
     while(ancestor){bg=getComputedStyle(ancestor).backgroundColor;if(rgb(bg).length===3||rgb(bg)[3]>0)break;ancestor=ancestor.parentElement;}
     const levels=[luminance(getComputedStyle(n).color),luminance(bg)].sort((a,b)=>a-b);
     return {selector,ratio:(levels[1]+.05)/(levels[0]+.05)};
   });
 })()`);
 for(const result of contrast)assert.ok(result.ratio>=4.5,`Readable sidebar text: ${result.selector}, contrast ${result.ratio}`);
 assert.equal(await ev(`getComputedStyle(document.querySelector('.pill')).whiteSpace`),'nowrap');
 console.log('PASS native OPFS FolderStorage probe, staged NotFound diagnostics, retry and manual palette.');
 await ev(`window.__cancelPicker=true`);await click('#create-folder');await idle();assert.deepEqual(await readdir(join(work,'main')),[]);await ev(`window.__cancelPicker=false;window.__permission='denied'`);await click('#create-folder');await idle();assert.deepEqual(await readdir(join(work,'main')),[]);
 await ev(`window.__permission='granted'`);
 const pickCount=await ev(`window.__pickerCalls`);
 await click('[data-nav="import"]');assert.ok(await ev(`!!document.querySelector('#selected-folder')`));assert.ok(await ev(`!!document.querySelector('#activate-folder')`));
 await click('#activate-folder');await idle();await click('#single-writer');
 for(const name of ['assessments','storage','patients','import']){await click('[data-nav="'+name+'"]');assert.ok(!(await ev(`document.querySelector('main').textContent.includes('Archiv zuerst öffnen')`)));}
 assert.equal(await ev(`window.__pickerCalls`),pickCount,'Probe folder is retained: activate and navigate without another picker');await click('[data-import-stage="1"]');assert.equal(await ev(`document.querySelector('#import-files').disabled`),false);
 console.log('PASS probe → explicit same-folder archive creation → import, with no re-selection on menu navigation; sidebar contrast passes.');
 await upload([resolve(project,'fixtures',csvName),pdfPath]);
 await fill('[name="identifier"]','00012345');await fill('[name="label"]','SYNTHETISCH');await click('#add-patient button');
 const patientId=await ev(`document.querySelector('[data-field="patientChoice"] option:last-child').value`);
 await fill('[data-field="patientChoice"]',patientId);
 await fill('[data-field="stayId"]','0006789');await click('#review-import');assert.equal(await ev(`document.querySelector('#commit-import').disabled`),true);assert.match(await ev(`document.querySelector('main').textContent`),/Untersuchungsart auswählen/);await click('[data-import-stage="2"]');await fill('[data-field="assessmentTypeId"]','general-neurology');await fill('[data-field="action"]','new');
 const csvRowId=await ev(`document.querySelector('[data-field="action"]').closest('[data-row]').dataset.row`);
 await click(`[data-row="${csvRowId}"] [data-field="confirmed"]`);
 const pdfRowId=await ev(`document.querySelector('[data-row] select[data-field="target"]').closest('[data-row]').dataset.row`);
 await fill(`[data-row="${pdfRowId}"] [data-field="target"]`,'batch:'+csvRowId);
 await fill(`[data-row="${pdfRowId}"] [data-field="note"]`,'Synthetic PDF session reviewed; export time may differ');await click(`[data-row="${pdfRowId}"] [data-field="confirmed"]`);
 await capture('import-assignment');await click('#review-import');await capture('import-review');await click('#commit-import');await idle();assert.match(await ev(`document.body.textContent`),/2 Dateien in Ihrer Bibliothek gespeichert/);assert.match(await ev(`document.querySelector('main').textContent`),/00012345/);assert.match(await ev(`document.querySelector('main').textContent`),/0006789/);
 await fill('#assessment-type-filter','memory-clinic');assert.match(await ev(`document.querySelector('.result-count').textContent`),/0 von 1/);await fill('#assessment-type-filter','general-neurology');assert.match(await ev(`document.querySelector('.result-count').textContent`),/1 von 1/);await fill('#assessment-type-filter','');
 console.log('PASS browser import: real File inputs, reviewed patient/stay/PDF association, disk-backed folder adapter and verified commit.');
 const second=await page(context);const secondSession=second.sessionId;await evaluate(`document.querySelector('#open-folder').click()`,secondSession);await until(()=>evaluate(`!document.querySelector('.busybar')&&document.body.textContent.includes('Ein anderer Tab')`,secondSession),'second-tab lock');assert.match(await evaluate(`document.body.textContent`,secondSession),/Schreibschutz/);
 await send('Target.closeTarget',{targetId:second.targetId});
 await send('Page.bringToFront',{},session);
 await click('[data-detail]');await ev(`window.__pdfMessages=[];window.addEventListener('message',e=>window.__pdfMessages.push({type:e.data?.type,origin:e.origin,token:e.data?.token,fromViewer:e.source===document.querySelector('#report-frame').contentWindow}))`);await click('[data-report]');await idle();
 await until(()=>ev(`document.querySelector('#report-frame').contentDocument?.querySelector('#status')?.textContent.includes('Seite 1 / 1')`),'bundled PDF canvas');
 assert.ok(await ev(`document.querySelector('#report-frame').contentDocument.querySelector('canvas').width>100`));
 const reportRequests=events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request);
 assert.ok(!reportRequests.some(r=>r.url.includes('example.invalid')||r.url.includes('SYNTHETIC-MUST-NOT-LEAVE')));
 await click('#close-report');
 for(let i=0;i<2;i++){await click('[data-report]');await idle();await until(()=>ev(`document.querySelector('#report-frame').contentDocument?.querySelector('#status')?.textContent.includes('Seite 1 / 1')`),'repeated PDF readiness');await click('#close-report');}
 console.log('PASS local PDF canvas: synthetic PDF with external link and JavaScript action makes no external request.');
 // Clear every browser site data store and navigate to a fresh app instance. The only source of recovery is disk.
 await send('Storage.clearDataForOrigin',{origin:appUrl,storageTypes:'all'},session);
 await send('Page.reload',{},session);await until(()=>ev(`!!document.querySelector('#open-folder')`),'fresh app after site-data clear');assert.match(await ev(`document.body.textContent`),/Kein Archiv geöffnet/);
 await click('#open-folder');await idle();assert.match(await ev(`document.querySelector('main').textContent`),/00012345/);assert.match(await ev(`document.querySelector('main').textContent`),/0006789/);
 await click('#single-writer');await click('[data-detail]');assert.match(await ev(`document.querySelector('main').textContent`),/synthetic.*pdf/i);
 await click('[data-report]');await idle();await until(()=>ev(`document.querySelector('#report-frame').contentDocument?.querySelector('#status')?.textContent.includes('Seite 1 / 1')`),'PDF after clearing site data');await click('#close-report');
 assert.deepEqual(await ev(`({local:localStorage.length,session:sessionStorage.length})`),{local:0,session:0});assert.equal((await ev(`indexedDB.databases()`)).length,0);
 console.log('PASS browser site-data deletion: reselected disk folder recovers patient, stay, revision and original PDF link; no patient browser storage.');
 // Reimport duplicate / changed export, explicitly select a revision, then correct metadata.
 await click('[data-nav="import"]');await upload([resolve(project,'fixtures',csvName)]);assert.match(await ev(`document.querySelector('main').textContent`),/Bereits in der Bibliothek/);
 await upload([resolve(project,'fixtures/revised-same-session.csv')]);await fill('[data-field="action"]','select');await fill('[data-field="note"]','Synthetic changed source reviewed');await click('[data-field="confirmed"]');await click('#review-import');await click('#commit-import');await idle();await click('[data-detail]');assert.equal(await ev(`document.querySelector('#selected-revision').options.length`),2);assert.equal(await ev(`document.querySelector('#selected-revision').selectedIndex`),1);
 await fill('#reassign-stay','0006790');await fill('#reassign-reason','Synthetic corrected stay and assessment type');await fill('#reassign-type','suspected-nph');await click('#save-assignment');await idle();assert.match(await ev(`document.querySelector('main').textContent`),/Aufenthalt 0006790/);
 await click('[data-nav="patients"]');await fill('#patient-type-filter','suspected-nph');const id=await ev(`document.querySelector('#history-patient option:last-child').value`);await fill('#history-patient',id);assert.match(await ev(`document.querySelector('main').textContent`),/0006790/);await fill('#patient-type-filter','memory-clinic');assert.equal(await ev(`document.querySelector('#history-patient').options.length`),1);await fill('#patient-type-filter','');
 console.log('PASS repeat import, changed-source selection, stay correction history and patient history.');
 await click('[data-nav="recovery"]');await ev(`window.__selected='backup'`);await click('#backup-archive');await idle();assert.match(await ev(`document.body.textContent`),/Sicherung geprüft/);
 await click('[data-nav="storage"]');await click('#open-folder');await idle();assert.match(await ev(`document.querySelector('main').textContent`),/0006790/);await click('#single-writer');await click('[data-detail]');assert.equal(await ev(`document.querySelector('#selected-revision').selectedIndex`),1);
 await click('[data-nav="assessments"]');await fill('#search','00012345');assert.match(await ev(`document.querySelector('.result-count').textContent`),/1 von 1/);
 for(const width of [390,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},session);assert.equal(await ev(`document.documentElement.scrollWidth<=window.innerWidth`),true,`No page overflow at ${width}`);}
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},session);
 await mkdir(join(project,'test-results'),{recursive:true});const screenshot=await send('Page.captureScreenshot',{format:'png'},session);await writeFile(join(project,'test-results/library.png'),Buffer.from(screenshot.data,'base64'));
 // Literal unknown source text must survive import and display without becoming HTML or a request.
 await click('[data-nav="import"]');
 const hostile=join(work,'synthetic-literal.csv');await writeFile(hostile,'session_uuid;testing_start_date;future_notes\n"sess_xss_legacy";"16.1.2026";"<img src=https://example.invalid/SYNTHETIC onerror=alert(1)>"');
 await upload([hostile]);await fill('[data-field="stayId"]','00044');await fill('[data-field="assessmentTypeId"]','memory-clinic');await fill('[data-field="action"]','new');await click('[data-field="confirmed"]');await click('#review-import');await click('#commit-import');await idle();
 await fill('#search','sess_xss_legacy');await click('[data-detail]');await ev(`document.querySelectorAll('main details').forEach(d=>d.open=true)`);assert.ok(!(await ev(`!!document.querySelector('main img')`)));assert.match(await ev(`document.querySelector('main').textContent`),/<img src=https:/);

 // Exercise a multi-patient library, all seven categories, legacy unknowns and guided bulk assignment.
 await click('[data-nav="storage"]');await ev(`window.__selected='practice'`);await click('#open-folder');await idle();
 assert.match(await ev(`document.querySelector('.result-count').textContent`),/21 von 21/);assert.match(await ev(`document.querySelector('main').textContent`),/Übungsbibliothek/);
 for(const type of ASSESSMENT_TYPES){
  await fill('#assessment-type-filter',type.id);const count=await ev(`Number(document.querySelector('.result-count').textContent.match(/[0-9]+/)[0])`);assert.ok(count>0,type.label);
  assert.ok((await ev(`document.querySelector('tbody').textContent`)).includes(type.label));
 }
 await fill('#assessment-type-filter','unassigned');assert.ok(await ev(`Number(document.querySelector('.result-count').textContent.match(/[0-9]+/)[0])>0`));await fill('#assessment-type-filter','');await capture('practice-library');
 await click('[data-nav="patients"]');await fill('#patient-type-filter','epilepsy-localisation');assert.ok(await ev(`document.querySelector('#history-patient').options.length>1`));
 const firstPatient=await ev(`document.querySelector('#history-patient').options[1].value`);await fill('#history-patient',firstPatient);await fill('#comparison-measure','phq9_total');await click('#load-patient-values');await idle();assert.match(await ev(`document.querySelector('main').textContent`),/Manuell eingegeben/);await capture('patient-history');
 await fill('#patient-type-filter','');await click('#single-writer');await click('[data-nav="import"]');
 const practiceFiles=(await readdir(join(practice.root,'Importuebung'))).filter(n=>(n.startsWith('SYNTHETIC_neu_1_')||n.startsWith('SYNTHETIC_neu_2_'))&&n.endsWith('.csv')).map(n=>join(practice.root,'Importuebung',n));assert.equal(practiceFiles.length,2);await upload(practiceFiles);
 await fill('#bulk-patient',firstPatient);await fill('#bulk-stay','0008888');await fill('#bulk-type','dbs-indication');await click('#apply-bulk');
 const checks=await ev(`Array.from(document.querySelectorAll('[data-field="confirmed"]')).map(n=>n.closest('[data-row]').dataset.row)`);for(const id of checks)await click('[data-row="'+id+'"] [data-field="confirmed"]');
 await click('#review-import');assert.equal(await ev(`document.querySelector('#commit-import').disabled`),false);await capture('bulk-review');await click('#commit-import');await idle();assert.match(await ev(`document.querySelector('.result-count').textContent`),/23 von 23/);
 console.log('PASS multi-patient practice library: all seven assessment filters, unknown legacy type, verified patient values and guided bulk assignment.');
 const requests=events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request);
 assert.ok(requests.every(r=>r.url.startsWith(appUrl)||r.url.startsWith('data:')||r.url.startsWith('blob:')),'Only application assets requested');
 assert.ok(requests.every(r=>r.method==='GET'&&!r.postData),'No content-bearing requests');
 const exceptions=events.filter(e=>e.method==='Runtime.exceptionThrown');assert.deepEqual(exceptions.map(e=>e.params.exceptionDetails.text),[]);
 assert.deepEqual(events.filter(e=>e.method==='Log.entryAdded'&&e.params.entry.source==='security'&&e.params.entry.level==='error').map(e=>e.params.entry.text),[],'No CSP errors, including bundled fonts');
 await writeFile(join(project,'test-results/browser-summary.json'),JSON.stringify({appVersion:await ev(`(async()=>(await import('./shared.js')).APP_VERSION)()`),browser:browserVersion.product,guidedImport:true,assessmentTypeFilters:true,lazyDetails:true,nativeStreamProbe:'OPFS only',externalPicker:'simulated; real temporary disk adapter',siteDataDeletion:true,patientAndStayRecovered:true,selectedRevisionRecovered:true,pdfCanvasAfterRecovery:true,noExternalRequests:true,backupRestore:true,secondTabReadOnly:true,hospitalEdgeAndNetworkDrive:'manual acceptance required'},null,2)+'\n');
 console.log('PASS verified folder copy/reopen, revision selection recovery, search, responsive layout, Web Locks and zero external/content-bearing requests.');
 console.log('LIMIT: native external picker / managed Edge policies / actual hospital share require manual acceptance.');
}catch(e){
 console.error('BROWSER TEST FAILED:',e.message);if(session){console.error(await ev(`document.body.innerText`).catch(()=>''));console.error('PDF state:',await ev(`document.querySelector('#report-frame')?.contentDocument?.body?.innerText`).catch(()=>''));console.error('PDF messages:',await ev(`window.__pdfMessages`).catch(()=>''));console.error('Browser logs:',JSON.stringify(events.filter(e=>['Log.entryAdded','Runtime.exceptionThrown'].includes(e.method)).map(e=>e.params)));}process.exitCode=1;
}finally{
 if(context)await send('Target.disposeBrowserContext',{browserContextId:context}).catch(()=>{});socket.close();await rm(work,{recursive:true,force:true});
}
