import { getDocument, GlobalWorkerOptions, AnnotationMode } from './vendor/pdf.mjs';
GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
let doc, task, pageNumber=1, rendering=false;
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{task?.destroy();reject(new Error('PDF timeout'));},30000);})]); }
  finally { clearTimeout(timer); }
}
const status=document.querySelector('#status');
const previous=document.querySelector('#previous'), next=document.querySelector('#next');
async function renderPage() {
  if(rendering||!doc)return;rendering=true;previous.disabled=next.disabled=true;
  try {
    status.textContent='PDF-Seite wird gelesen…';
    const page=await bounded(doc.getPage(pageNumber));const initial=page.getViewport({scale:1});
    const viewport=page.getViewport({scale:Math.min(1.5,1600/initial.width,2000/initial.height)});
    const canvas=document.querySelector('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    status.textContent='PDF-Seite wird gezeichnet…';
    // Original reports are print exports. Print rendering also avoids rAF starvation in occluded browser frames.
    await bounded(page.render({canvasContext:canvas.getContext('2d'),viewport,intent:'print',annotationMode:AnnotationMode.DISABLE}).promise);
    status.textContent=`Seite ${pageNumber} / ${doc.numPages}`;
  }catch{status.textContent='Ansicht fehlgeschlagen. Originaldatei bleibt im Archiv erhalten.';}
  finally{rendering=false;previous.disabled=pageNumber<=1;next.disabled=pageNumber>=doc.numPages;}
}
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='npt-local-pdf'||event.data.token!==location.hash.slice(1)||!(event.data.data instanceof ArrayBuffer)||task)return;
  if(event.data.data.byteLength>32*1024*1024)return;
  try {
    status.textContent='PDF wird lokal geprüft…';
    // Only byte input. No viewer, scripting manager, annotations, links, attachments, XFA or actions are instantiated.
    task=getDocument({data:new Uint8Array(event.data.data),isEvalSupported:false,enableXfa:false,
      useSystemFonts:false,disableFontFace:true,disableAutoFetch:true,disableStream:true,disableRange:true,
      cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href,cMapPacked:true,
      standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href,
      wasmUrl:new URL('./vendor/wasm/',import.meta.url).href,verbosity:0,
      maxImageSize:16*1024*1024,canvasMaxAreaInBytes:32*1024*1024});
    task.onPassword=()=>{status.textContent='Passwortgeschütztes PDF: Ansicht nicht verfügbar. Original bleibt erhalten.';task.destroy();};
    doc=await bounded(task.promise);
    status.textContent='Seite wird lokal gezeichnet…';
    if(doc.numPages>1000){await task.destroy();throw Error();}
    await renderPage();
  }catch{status.textContent='PDF kann nicht dargestellt werden. Originaldatei bleibt erhalten; durch IT prüfen lassen.';}
});
previous.onclick=()=>{if(!rendering&&pageNumber>1){pageNumber--;renderPage();}};
next.onclick=()=>{if(!rendering&&pageNumber<doc.numPages){pageNumber++;renderPage();}};
window.addEventListener('pagehide',()=>task?.destroy());
// Explicit handshake: iframe load can precede module readiness or belong to its old about:blank document.
parent.postMessage({type:'npt-pdf-ready',token:location.hash.slice(1)},location.origin);
