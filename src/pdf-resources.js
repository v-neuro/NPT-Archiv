// Prepended to the isolated PDF worker by the build. No network fallback exists.
export function installPdfResources(resources){
  const bytes=key=>{
    if(!Object.hasOwn(resources,key))throw Error('Unknown bundled PDF resource');
    return Uint8Array.from(atob(resources[key]),c=>c.charCodeAt(0));
  };
  const resource=url=>{if(typeof url!=='string'||!url.startsWith('npt-asset:'))throw Error('PDF network access disabled');return bytes(url.slice(10));};
  globalThis.fetch=async url=>new Response(resource(url),{status:200});
  globalThis.XMLHttpRequest=class{
    open(method,url,async){if(method!=='GET'||async!==false)throw Error('PDF network access disabled');this.url=url;}
    send(){this.response=resource(this.url).buffer;this.status=200;}
  };
  const urls=new Map();
  globalThis.__nptPdfModule=name=>{
    if(!['openjpeg_nowasm_fallback.js','jbig2_nowasm_fallback.js'].includes(name))throw Error('Unknown PDF decoder');
    if(!urls.has(name))urls.set(name,URL.createObjectURL(new Blob([bytes('wasm/'+name)],{type:'text/javascript'})));
    return urls.get(name);
  };
}
