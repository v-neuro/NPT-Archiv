// Inlined and hash-authorized by the build. This frame has an opaque origin.
(()=>{
  const params=new URLSearchParams(location.hash.slice(1)),token=params.get('token'),origin=params.get('origin');
  if(!/^[a-f0-9-]{36}$/.test(token??'')||!/^https?:\/\//.test(origin??''))return;
  const channel=new MessageChannel();let initialized=false;
  channel.port1.onmessage=async({data,ports})=>{
    if(initialized||data?.type!=='init'||typeof data.renderer!=='string'||data.renderer.length>50000||ports.length!==1)return;
    initialized=true;
    const url=URL.createObjectURL(new Blob([data.renderer],{type:'text/javascript'}));
    try{const renderer=await import(url);await renderer.start(data.runtime,channel.port1,ports[0]);}
    catch{document.querySelector('#status').textContent='Lokale PDF-Ansicht konnte nicht gestartet werden. Original bleibt erhalten.';}
    finally{URL.revokeObjectURL(url);}
  };
  // The frame creates the private channel. A later frame navigation cannot receive it.
  parent.postMessage({type:'npt-pdf-ready',token},origin,[channel.port2]);
})();
