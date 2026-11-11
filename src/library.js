import { APP_VERSION, PARSER_VERSION, FORMAT, SCHEMA, MAX_FILE, bytes, fail, parseJson, sha256, text, uid, validId } from './shared.js';
import { applyOperations, emptyState, objectPath, originalsOf } from './model.js';
import { projectRecord, PROJECTION_VERSION } from './projection.js';
import { readManifest, verifiedWrite } from './storage.js';
import { seal, validateRecord, validateRecordMetadata, verifyOriginal } from './record.js';

const INDEX_FORMAT='digitale-npt-derived-record';
const sameSource=(a,b)=>a&&b&&a.name===b.name&&a.size===b.size&&a.lastModified===b.lastModified;
async function indexToken(source){return sha256(JSON.stringify([source.name,source.size,source.lastModified,PROJECTION_VERSION,PARSER_VERSION]));}
async function readIndex(storage,path,source,archiveId){
  try{
    const envelope=parseJson(await storage.read(path));const p=envelope.payload;
    if(!p||p.format!==INDEX_FORMAT||p.version!==PROJECTION_VERSION||p.parserVersion!==PARSER_VERSION||p.archiveId!==archiveId
      ||!sameSource(p.record?.source,source)||envelope.checksum!==await sha256(JSON.stringify(p)))return null;
    validateRecordMetadata(p.record,archiveId,source.name);
    for(const op of p.record.payload.operations)if(op.type==='revision.add'){
      if(op.revision.document.projected!==true||op.revision.document.projectionVersion!==PROJECTION_VERSION||op.revision.sourceRecordId!==p.record.payload.id||op.revision.sourceChecksum!==p.record.checksum)return null;
    }
    return p.record;
  }catch{return null;}
}
export async function scanLibrary(storage,options={}){
  const {deep=false,memory=new Map(),onProgress=()=>{}}=options;
  const manifest=await readManifest(storage),issues=[],records=[],seenTokens=new Set();
  const metrics={sourceRecordsRead:0,sourceBytesRead:0,indexHits:0,memoryHits:0,originalsHashed:0};
  const entries=await storage.list('records');
  for(let n=0;n<entries.length;n++){
    const entry=entries[n];
    try{
      if(entry.kind!=='file'||!validId(entry.name.replace(/\.json$/,''))||!entry.name.endsWith('.json'))fail('Ungültiger Speichereintrag.');
      const path=`records/${entry.name}`;
      const stat=typeof storage.stat==='function'?await storage.stat(path):null;
      if(stat&&(!Number.isFinite(stat.lastModified)||!Number.isInteger(stat.size)||stat.size>16*1024*1024))fail('Speichereintrag zu groß oder nicht lesbar.');
      const source=stat?{name:entry.name,...stat}:null;
      const token=source?await indexToken(source):null;
      const cachePath=token?`indexes/v1/${token}.json`:null;
      if(token)seenTokens.add(token);
      let record=!deep&&token?memory.get(token):null;
      if(record)metrics.memoryHits++;
      if(!record&&!deep&&cachePath){record=await readIndex(storage,cachePath,source,manifest.archiveId);if(record)metrics.indexHits++;}
      let needsIndex=false;
      if(!record){
        const data=await storage.read(path);metrics.sourceRecordsRead++;metrics.sourceBytesRead+=data.length;
        const full=await validateRecord(parseJson(data),manifest.archiveId,entry.name);
        record=projectRecord(full,source);needsIndex=true;
      }
      record={...record,cachePath,needsIndex:record.needsIndex||needsIndex};
      records.push(record);if(token)memory.set(token,record);
    }catch{issues.push({severity:'error',path:`records/${entry.name}`,message:'Ein gespeicherter Vorgang ist nicht lesbar. Frühere Einträge bleiben verfügbar. Bitte die Bibliothek prüfen.'});}
    if(n%10===0)onProgress(`Bibliothek öffnen · ${n+1} von ${entries.length}`);
  }
  for(const token of memory.keys())if(!seenTokens.has(token))memory.delete(token);
  const children=new Map();for(const record of records){const parent=record.payload.parent;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(record);}
  let state=emptyState(),head=null;const accepted=[],used=new Set(),referenced=new Map();
  while(true){
    const next=children.get(head)??[];if(!next.length)break;
    if(next.length!==1){issues.push({severity:'error',path:'records/',message:'Mehrere gleichzeitig gespeicherte Stände gefunden. Angezeigt wird der letzte gemeinsame Stand. Bitte eine geprüfte Sicherung wiederherstellen.'});break;}
    const record=next[0],p=record.payload;
    try{
      const pendingReferences=new Map();
      for(const original of originalsOf(p.operations)){
        const path=objectPath(original);
        if(referenced.has(path)&&referenced.get(path)!==original.size)fail('Widersprüchliche Originaldatei.');
        if(deep&&!referenced.has(path)){await verifyOriginal(storage,original);metrics.originalsHashed++;}
        pendingReferences.set(path,original.size);
      }
      state=applyOperations(state,p.operations,{id:p.id,checksum:record.checksum,createdAt:p.createdAt,actor:p.actor},{projected:true});
      for(const [path,size] of pendingReferences)referenced.set(path,size);
      head=record.checksum;used.add(head);accepted.push(record);
    }catch{issues.push({severity:'error',path:`records/${p.id}.json`,message:'Ein Vorgang oder seine Originaldateien sind beschädigt. Frühere lesbare Einträge werden weiter angezeigt.'});break;}
  }
  if(records.some(r=>!used.has(r.checksum)))issues.push({severity:'error',path:'records/',message:'Einige gespeicherte Vorgänge konnten nicht eingelesen werden. Änderungen sind bis zur Prüfung gesperrt.'});
  if(deep){
    for(const entry of await storage.list())if(!['archive.json','records','objects','indexes'].includes(entry.name))issues.push({severity:'info',path:entry.name,message:'Zusätzliche Datei im Archivordner; unverändert belassen.'});
    for(const prefix of await storage.list('objects')){
      if(prefix.kind!=='directory'||!/^[a-f0-9]{2}$/.test(prefix.name)){issues.push({severity:'error',path:`objects/${prefix.name}`,message:'Unbekannte Struktur im Originaldateien-Ordner.'});continue;}
      for(const file of await storage.list(`objects/${prefix.name}`)){
        const path=`objects/${prefix.name}/${file.name}`;
        if(!referenced.has(path))issues.push({severity:'info',path,message:'Nicht zugeordnete Originaldatei, beispielsweise nach einem unterbrochenen Import. Unverändert belassen.'});
      }
    }
  }
  return {manifest,state,head,issues,records:accepted,readOnly:issues.some(i=>i.severity==='error'),compact:true,
    verification:deep?'full':'on-demand',metrics};
}
export async function writeLibraryIndex(storage,snapshot){
  if(snapshot.readOnly||typeof storage.writeCache!=='function')return 0;
  let written=0;
  for(const record of snapshot.records){
    if(!record.cachePath||!record.needsIndex)continue;
    const {cachePath,needsIndex,...clean}=record;
    const envelope=await seal({format:INDEX_FORMAT,version:PROJECTION_VERSION,parserVersion:PARSER_VERSION,archiveId:snapshot.manifest.archiveId,record:clean});
    const data=bytes(JSON.stringify(envelope));
    await storage.writeCache(cachePath,data);
    if(await sha256(await storage.read(cachePath,data.length+1))!==await sha256(data))fail('Suchübersicht konnte nicht geprüft werden. Originale bleiben erhalten.');
    record.needsIndex=false;written++;
  }
  return written;
}
export async function commitLibrary(archive,operations,files,actor){
  if(archive.busy)fail('Eine Speicherung läuft bereits.');archive.busy=true;
  try{
    if(archive.snapshot.readOnly)fail('Änderungen sind bis zur Prüfung gesperrt.');
    if(!text(actor,100))fail('Bearbeiterkürzel ungültig.');
    const opts={memory:archive.recordIndex};
    const before=await scanLibrary(archive.storage,opts);
    if(before.readOnly||before.head!==archive.snapshot.head||before.manifest.archiveId!==archive.snapshot.manifest.archiveId)fail('Die Bibliothek wurde inzwischen geändert. Bitte erneut öffnen und Auswahl prüfen.');
    applyOperations(before.state,operations);
    const payload={format:FORMAT+'-commit',schemaVersion:SCHEMA,archiveId:before.manifest.archiveId,id:uid(),parent:before.head,createdAt:new Date().toISOString(),appVersion:APP_VERSION,actor,operations};
    const record=await seal(payload),encoded=bytes(JSON.stringify(record));if(encoded.length>16*1024*1024)fail('Diese Auswahl ist zu groß. Bitte in kleineren Gruppen importieren.');
    for(const original of originalsOf(operations)){
      const path=objectPath(original);
      if(!await archive.storage.exists(path)){
        const data=files.get(original.hash);
        if(!data||data.length!==original.size||await sha256(data)!==original.hash)fail('Eine ausgewählte Datei ist nicht mehr lesbar. Bitte erneut auswählen.');
        await verifiedWrite(archive.storage,path,data);
      }
      await verifyOriginal(archive.storage,original);
    }
    const latest=await scanLibrary(archive.storage,opts);if(latest.readOnly||latest.head!==before.head)fail('Ein anderer Schreibzugriff wurde erkannt. Bitte erneut öffnen.');
    await verifiedWrite(archive.storage,`records/${payload.id}.json`,encoded);
    const after=await scanLibrary(archive.storage,opts);archive.snapshot=after;archive.detailCache.clear();
    if(after.readOnly||after.head!==record.checksum)fail('Speicherung nicht eindeutig bestätigt. Bitte den Ordner erneut öffnen.');
    try{await writeLibraryIndex(archive.storage,after);}catch{after.issues.push({severity:'info',path:'indexes/',message:'Die Suchübersicht konnte nicht aktualisiert werden. Alle gespeicherten Daten bleiben erhalten; die Übersicht kann neu aufgebaut werden.'});}
    return after;
  }catch(error){archive.snapshot.readOnly=true;archive.snapshot.issues.push({severity:'error',path:'Speicherung',message:'Das Speicherergebnis ist unklar. Bitte den Ordner erneut öffnen, bevor Sie weiterarbeiten.'});throw error;}
  finally{archive.busy=false;}
}
export async function loadAssessmentDetail(archive,id){
  const a=archive.snapshot.state.assessments[id];if(!a)fail('Testung nicht gefunden.');
  const revisions=[];
  for(const revision of a.revisions){
    if(!revision.document.projected){revisions.push(revision);continue;}
    const recordId=revision.sourceRecordId;
    let record=archive.detailCache.get(recordId);
    if(!record){
      record=await validateRecord(parseJson(await archive.storage.read(`records/${recordId}.json`)),archive.snapshot.manifest.archiveId,`${recordId}.json`);
      if(record.checksum!==revision.sourceChecksum)fail('Die Quelldaten wurden verändert. Bitte die Bibliothek vollständig prüfen.');
      archive.detailCache.set(recordId,record);
      if(archive.detailCache.size>8)archive.detailCache.delete(archive.detailCache.keys().next().value);
    }
    const source=record.payload.operations.find(op=>op.type==='revision.add'&&op.assessmentId===id&&op.revision.id===revision.id)?.revision;
    if(!source||source.original.hash!==revision.original.hash||source.document.semanticHash!==revision.document.semanticHash)fail('Die Suchübersicht passt nicht zu den Quelldaten. Bitte neu aufbauen.');
    await verifyOriginal(archive.storage,source.original);
    revisions.push({...revision,document:source.document});
  }
  return {...a,revisions};
}
