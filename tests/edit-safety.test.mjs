import test from 'node:test';
import assert from 'node:assert/strict';
import {DraftStore} from '../src/drafts.js';
import {validPdfReady,validPdfStatus} from '../src/pdf-channel.js';
import {installPdfResources} from '../src/pdf-resources.js';
import {runInNewContext} from 'node:vm';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildPdf} from '../scripts/build-pdf.mjs';

test('RAM drafts survive remounting and unrelated updates, isolate entities, and clear only confirmed/discarded changes',()=>{
 const store=new DraftStore(),baseline=[{key:'diagnosis',value:'SYNTHETIC source'},{key:'confirmed',value:false}];store.mount('clinical:first',baseline);baseline[0].value='Caller mutation';assert.deepEqual(store.dirtyKeys(),[]);
 store.update('clinical:first',[{key:'diagnosis',value:'SYNTHETIC unsaved'},{key:'confirmed',value:true}]);assert.deepEqual(store.dirtyKeys(),['clinical:first']);assert.equal(store.mount('clinical:first',[{key:'diagnosis',value:'New render defaults'}])[0].value,'SYNTHETIC unsaved');
 store.mount('assignment:first',[{key:'patient',value:'000123'}]);store.update('assignment:first',[{key:'patient',value:'000456'}]);store.clear(['clinical:first']);assert.deepEqual(store.dirtyKeys(),['assignment:first']);store.mount('clinical:second',[]);assert.deepEqual(store.dirtyKeys(),['assignment:first']);store.clear();assert.deepEqual(store.dirtyKeys(),[]);
});
test('reverting to original form values removes the dirty state, including zero and unchecked choices',()=>{
 const store=new DraftStore(),baseline=[{key:'age',value:'0'},{key:'confirmed',value:false}];store.mount('form',baseline);store.update('form',[{key:'age',value:''},{key:'confirmed',value:false}]);assert.deepEqual(store.dirtyKeys(),['form']);store.update('form',baseline);assert.deepEqual(store.dirtyKeys(),[]);
});
test('fresh folder values replace clean fields while changed fields survive and new controls do not create false drafts',()=>{
 const store=new DraftStore();store.mount('clinical',[{key:'diagnosis',value:'SYNTHETIC old'},{key:'status',value:'suspected'}]);
 assert.equal(store.mount('clinical',[{key:'diagnosis',value:'SYNTHETIC updated'},{key:'status',value:'confirmed'}])[0].value,'SYNTHETIC updated');assert.deepEqual(store.dirtyKeys(),[]);
 store.update('clinical',[{key:'diagnosis',value:'SYNTHETIC draft'},{key:'status',value:'confirmed'}]);
 const mounted=store.mount('clinical',[{key:'diagnosis',value:'SYNTHETIC updated'},{key:'status',value:'suspected'},{key:'hemisphere',value:''}]);assert.equal(mounted[0].value,'SYNTHETIC draft');assert.equal(mounted[1].value,'suspected');assert.equal(mounted[2].value,'');assert.deepEqual(store.dirtyKeys(),['clinical']);
 store.mount('clinical',[{key:'diagnosis',value:'SYNTHETIC draft'},{key:'status',value:'suspected'},{key:'hemisphere',value:''}]);assert.deepEqual(store.dirtyKeys(),[]);
});
test('PDF readiness requires opaque source, the exact frame/token, one private port and a single initialization',()=>{
 const frame={},port={},pending={token:'secret',connected:false},event={origin:'null',source:frame,data:{type:'npt-pdf-ready',token:'secret'},ports:[port]};assert.equal(validPdfReady(event,frame,pending),true);
 for(const invalid of [{...event,origin:'https://attacker.invalid'},{...event,source:{}},{...event,data:{...event.data,token:'wrong'}},{...event,ports:[]},{...event,ports:[port,{}]}])assert.equal(validPdfReady(invalid,frame,pending),false);
 assert.equal(validPdfReady(event,frame,{...pending,connected:true}),false);assert.equal(validPdfReady(event,frame,null),false);
 assert.equal(validPdfStatus({type:'status',text:'Seite 1 / 1',width:595}),true);for(const data of [{type:'write',text:'x',width:1},{type:'status',text:'x'.repeat(201),width:0},{type:'status',text:'x',width:999999}])assert.equal(validPdfStatus(data),false);
});
test('isolated decoder resources provide binary bytes and reject network URLs, traversal and unbundled modules',async()=>{
 const context={Response,Uint8Array,atob,Blob,URL};runInNewContext(`(${installPdfResources.toString()})({'cmaps/SYNTHETIC.bcmap':'AAECAw==','wasm/qcms_bg.wasm':'AAECAw=='})`,context);
 assert.deepEqual(new Uint8Array(await(await context.fetch('npt-asset:cmaps/SYNTHETIC.bcmap')).arrayBuffer()),new Uint8Array([0,1,2,3]));
 for(const path of ['https://example.invalid/data','/archive.json','npt-asset:../records/a.json','npt-asset:unknown','blob:untrusted'])await assert.rejects(context.fetch(path));
 const request=new context.XMLHttpRequest();request.open('GET','npt-asset:wasm/qcms_bg.wasm',false);request.send();assert.deepEqual([...new Uint8Array(request.response)],[0,1,2,3]);assert.throws(()=>new context.XMLHttpRequest().open('POST','https://example.invalid',true));assert.throws(()=>context.__nptPdfModule('quickjs-eval.js'));
});
test('build embeds the isolated bootstrap/style with matching host hashes and packages only fixed local PDF resources',async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),dist=await mkdtemp(join(tmpdir(),'npt-isolated-pdf-'));t.after(()=>rm(dist,{recursive:true,force:true}));const {csp}=await buildPdf(root,dist),html=await readFile(join(dist,'pdf-viewer.html'),'utf8');
 const hash=value=>createHash('sha256').update(value).digest('base64'),script=html.match(/<script>([\s\S]*)<\/script>/)[1],style=html.match(/<style>([\s\S]*)<\/style>/)[1];assert.ok(csp.includes("'sha256-"+hash(script)+"'"));assert.ok(csp.includes("'sha256-"+hash(style)+"'"));assert.ok(csp.includes("connect-src 'none'"));assert.ok(csp.includes("worker-src 'none'"));assert.ok(!csp.includes("script-src 'self'"));assert.ok(!html.includes('{{PDF_'));
 const code=await readFile(join(dist,'pdf-worker.mjs'),'utf8');assert.ok(code.includes('npt-asset:'));assert.ok(code.includes('qcms_bg.wasm'));assert.ok(code.includes('standard_fonts/'));assert.ok(code.includes('globalThis.__nptPdfModule(this._noWasmFilename)'));assert.ok(!code.includes('sourceMappingURL='));
 const index=await readFile(join(root,'src/index.html'),'utf8');assert.match(index,/sandbox="allow-scripts"/);assert.ok(!index.includes('allow-same-origin'));
});
