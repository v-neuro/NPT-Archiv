import { deflateRawSync } from 'node:zlib';
import { readFile,writeFile } from 'node:fs/promises';
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let value=n;for(let k=0;k<8;k++)value=value&1?0xedb88320^(value>>>1):value>>>1;table[n]=value>>>0;}
const crc32=data=>{let crc=0xffffffff;for(const value of data)crc=table[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
export async function zipFiles(destination,entries){
 const files=[],directory=[];let offset=0;
 for(const entry of entries){
  if(!/^[A-Za-z0-9._/-]+$/.test(entry.name)||entry.name.startsWith('/')||entry.name.split('/').includes('..'))throw Error('Unsafe ZIP entry');
  const data=await readFile(entry.path),compressed=deflateRawSync(data),name=Buffer.from(entry.name),crc=crc32(data);
  if(data.length>0xffffffff||offset>0xffffffff)throw Error('ZIP64 is not supported; source/static archives only.');
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  files.push(local,name,compressed);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);directory.push(central,name);
  offset+=local.length+name.length+compressed.length;
 }
 const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 await writeFile(destination,Buffer.concat([...files,central,end]),{flag:'wx'});
}
