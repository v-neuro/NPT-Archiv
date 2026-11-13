import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=new URL('../src/',import.meta.url);
function pngSize(data){assert.equal(data.subarray(1,4).toString(),'PNG');return[data.readUInt32BE(16),data.readUInt32BE(20)];}
test('provided sidebar artwork retains its original dimensions; square icons and ICO payloads have correct sizes',async()=>{
 assert.deepEqual(pngSize(await readFile(new URL('icons/brand.png',source))),[2330,1664]);
 for(const size of [16,32,48,180,192,256,512])assert.deepEqual(pngSize(await readFile(new URL(`icons/icon-${size}.png`,source))),[size,size]);
 const ico=await readFile(new URL('favicon.ico',source));assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),4);
 let expectedOffset=6+4*16;for(const [index,size]of[16,32,48,256].entries()){const at=6+index*16,length=ico.readUInt32LE(at+8),offset=ico.readUInt32LE(at+12);assert.equal(offset,expectedOffset);assert.equal(ico[at]||256,size);assert.equal(ico[at+1]||256,size);assert.equal(ico.readUInt16LE(at+4),1);assert.equal(ico.readUInt16LE(at+6),32);const data=ico.subarray(offset,offset+length);assert.deepEqual(data,await readFile(new URL(`icons/icon-${size}.png`,source)));expectedOffset+=length;}assert.equal(expectedOffset,ico.length);
});
test('shortcut metadata references bundled icon files and retains ordinary browser launch without a service worker',async()=>{
 const manifest=JSON.parse(await readFile(new URL('site.webmanifest',source))),html=await readFile(new URL('index.html',source),'utf8');assert.equal(manifest.name,'NPT-Archiv');assert.equal(manifest.display,'browser');assert.equal(manifest.start_url,'./');assert.equal(manifest.icons.length,2);
 for(const icon of manifest.icons){assert.equal(new URL(icon.src,'https://archive.invalid/').origin,'https://archive.invalid');assert.equal(icon.purpose,'any');const size=pngSize(await readFile(new URL(icon.src,source)));assert.equal(icon.sizes,size.join('x'));assert.equal(icon.type,'image/png');}
 assert.match(html,/rel="icon" href="\.\/favicon\.ico"/);assert.match(html,/rel="apple-touch-icon"/);assert.match(html,/rel="manifest"/);assert.match(html,/manifest-src 'self'/);assert.ok(!html.includes('navigator.serviceWorker'));
});
