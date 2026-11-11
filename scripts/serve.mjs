// Development computer only. Hospital clients use the approved static HTTPS host.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.bcmap':'application/octet-stream','.ttf':'font/ttf','.pfb':'application/octet-stream','.json':'application/json'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(dist.endsWith(sep)?dist:dist+sep)||(await stat(file)).isDirectory())throw Error();
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN'});
    res.end(await readFile(file));
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(Number(process.env.PORT||5186),'127.0.0.1',()=>console.log(`Development preview: http://127.0.0.1:${server.address().port}`));
