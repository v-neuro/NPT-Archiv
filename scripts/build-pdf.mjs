import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {installPdfResources} from '../src/pdf-resources.js';
export async function buildPdf(root,dist){
  const source=join(root,'src'),vendor=join(root,'node_modules/pdfjs-dist'),resources={};
  for(const folder of ['cmaps','standard_fonts','wasm'])for(const name of (await readdir(join(vendor,folder))).sort()){
    if(!/\.(bcmap|pfb|ttf|wasm)$/.test(name)&&!['openjpeg_nowasm_fallback.js','jbig2_nowasm_fallback.js'].includes(name))continue;
    if(name.startsWith('quickjs'))continue;
    resources[folder+'/'+name]=(await readFile(join(vendor,folder,name))).toString('base64');
  }
  const bootstrap=await readFile(join(source,'pdf-bootstrap.js'),'utf8'),style=(await readFile(join(source,'palette.css'),'utf8'))+'\n'+(await readFile(join(source,'viewer.css'),'utf8')).replace('@import url("./palette.css");','');
  const hash=value=>createHash('sha256').update(value).digest('base64');
  const csp=`default-src 'none'; script-src 'sha256-${hash(bootstrap)}' blob: 'wasm-unsafe-eval'; style-src 'sha256-${hash(style)}'; img-src blob: data:; font-src 'none'; connect-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
  let worker=await readFile(join(vendor,'build/pdf.worker.mjs'),'utf8');
  const decoderImport='`${WasmImage.#wasmUrl}${this._noWasmFilename}`';
  if(worker.split(decoderImport).length!==2)throw Error('PDF worker layout changed: review isolated decoder imports before release.');
  worker=worker.replace(decoderImport,'globalThis.__nptPdfModule(this._noWasmFilename)');
  worker=`(${installPdfResources.toString()})(${JSON.stringify(resources)});\n`+worker;
  const stripMaps=text=>text.replace(/\/\/# sourceMappingURL=[^\n]*/g,'');
  const runtime={pdf:stripMaps(await readFile(join(vendor,'build/pdf.mjs'),'utf8'))};
  worker+=`\nlet nptPortAttached=false;globalThis.addEventListener('message',event=>{if(nptPortAttached||event.data?.type!=='npt-port'||event.ports.length!==1)return;nptPortAttached=true;WorkerMessageHandler.initializeFromPort(event.ports[0]);event.ports[0].start();});\n`;
  await writeFile(join(dist,'pdf-worker.mjs'),stripMaps(worker));
  const renderer=await readFile(join(source,'pdf-viewer.js'),'utf8');
  await writeFile(join(dist,'pdf-runtime.js'),`export const renderer=${JSON.stringify(renderer)};\nexport const runtime=${JSON.stringify(runtime)};\n`);
  const html=(await readFile(join(source,'pdf-viewer.html'),'utf8')).replace('{{PDF_CSP}}',csp).replace('{{PDF_STYLE}}',style).replace('{{PDF_BOOTSTRAP}}',bootstrap);
  await writeFile(join(dist,'pdf-viewer.html'),html);
  // Host headers and the document's own policy must enforce the same boundary.
  const config=JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
  const hostPolicy=config.headers.find(rule=>rule.source==='/pdf-viewer.html')?.headers.find(header=>header.key==='Content-Security-Policy')?.value;
  if(hostPolicy!==csp+"; frame-ancestors 'self'")throw Error('Update the PDF hash policy in vercel.json to match the reviewed viewer bootstrap/style. Expected: '+csp+"; frame-ancestors 'self'");
  return {csp};
}
