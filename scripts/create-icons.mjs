// Development-only Mac asset conversion. Runtime/build uses checked-in files.
// Preserve the supplied artwork; fit it on square white canvases without stretching.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),source=join(root,'src/icons/brand.png');
await mkdir(join(root,'src/icons'),{recursive:true});
for(const size of [16,32,48,180,192,256,512]){
 const output=join(root,`src/icons/icon-${size}.png`);
 execFileSync('/usr/bin/sips',['--resampleHeightWidthMax',String(size),source,'--out',output],{stdio:'pipe'});
 execFileSync('/usr/bin/sips',['--padToHeightWidth',String(size),String(size),'--padColor','FFFFFF',output,'--out',output],{stdio:'pipe'});
}
// Standard multi-resolution ICO with PNG payloads for current browsers/Windows.
const sizes=[16,32,48,256],entries=await Promise.all(sizes.map(size=>readFile(join(root,`src/icons/icon-${size}.png`))));
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
entries.forEach((data,index)=>{const at=6+16*index,size=sizes[index];header[at]=size===256?0:size;header[at+1]=header[at];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(data.length,at+8);header.writeUInt32LE(offset,at+12);offset+=data.length;});
await writeFile(join(root,'src/favicon.ico'),Buffer.concat([header,...entries]));
console.log('Square PNG icons and multi-resolution favicon.ico generated from the supplied artwork.');
