// Imported only inside an opaque sandbox over its dedicated MessageChannel.
export async function start(runtime,port,workerPort){
  if(typeof runtime?.pdf!=='string'||!workerPort)throw Error('Missing local PDF runtime');
  const urls=[];const blob=code=>{const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));urls.push(url);return url;};
  const {getDocument,PDFWorker,AnnotationMode}=await import(blob(runtime.pdf));
  const pdfWorker=new PDFWorker({port:workerPort});workerPort.start();
  let doc,task,pageNumber=1,rendering=false,received=false;
  const status=document.querySelector('#status'),previous=document.querySelector('#previous'),next=document.querySelector('#next');
  function announce(text){status.textContent=text;port.postMessage({type:'status',text,width:document.querySelector('canvas').width});}
  async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{task?.destroy();reject(Error('PDF timeout'));},30000);})]);}finally{clearTimeout(timer);}}
  async function renderPage(){
    if(rendering||!doc)return;rendering=true;previous.disabled=next.disabled=true;
    try{
      announce('PDF-Seite wird gelesen…');const page=await bounded(doc.getPage(pageNumber)),initial=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:Math.min(1.5,1600/initial.width,2000/initial.height)}),canvas=document.querySelector('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      announce('PDF-Seite wird gezeichnet…');await bounded(page.render({canvasContext:canvas.getContext('2d'),viewport,intent:'print',annotationMode:AnnotationMode.DISABLE}).promise);
      announce(`Seite ${pageNumber} / ${doc.numPages}`);
    }catch{announce('Ansicht fehlgeschlagen. Originaldatei bleibt im Archiv erhalten.');}
    finally{rendering=false;previous.disabled=pageNumber<=1;next.disabled=pageNumber>=doc.numPages;}
  }
  port.onmessage=async({data})=>{
    if(received||data?.type!=='document'||!(data.data instanceof ArrayBuffer)||data.data.byteLength>32*1024*1024)return;received=true;
    try{
      announce('PDF wird lokal geprüft…');
      task=getDocument({data:new Uint8Array(data.data),worker:pdfWorker,isEvalSupported:false,enableXfa:false,
        useSystemFonts:false,disableFontFace:true,disableAutoFetch:true,disableStream:true,disableRange:true,disableWorkerRendering:true,
        useWorkerFetch:true,cMapUrl:'npt-asset:cmaps/',cMapPacked:true,standardFontDataUrl:'npt-asset:standard_fonts/',wasmUrl:'npt-asset:wasm/',verbosity:0,
        maxImageSize:16*1024*1024,canvasMaxAreaInBytes:32*1024*1024});
      task.onPassword=()=>{announce('Passwortgeschütztes PDF: Ansicht nicht verfügbar. Original bleibt erhalten.');task.destroy();};
      doc=await bounded(task.promise);if(doc.numPages>1000){await task.destroy();throw Error('PDF page limit');}await renderPage();
    }catch{announce('PDF kann nicht dargestellt werden. Originaldatei bleibt erhalten; durch IT prüfen lassen.');}
  };
  previous.onclick=()=>{if(!rendering&&pageNumber>1){pageNumber--;renderPage();}};next.onclick=()=>{if(!rendering&&pageNumber<doc.numPages){pageNumber++;renderPage();}};
  window.addEventListener('pagehide',()=>{task?.destroy();pdfWorker.destroy();workerPort.close();port.close();for(const url of urls)URL.revokeObjectURL(url);});
  port.postMessage({type:'renderer-ready'});
}
