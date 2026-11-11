import { FORMAT, SCHEMA, bytes, decode, fail, parseJson, sha256, uid, validId } from './shared.js';

export function capabilities(env = globalThis) {
  return { secure: env.isSecureContext === true && env.location?.protocol !== 'file:',
    picker: typeof env.showDirectoryPicker === 'function',
    hashing: Boolean(env.crypto?.subtle), locks: Boolean(env.navigator?.locks),
    streams: typeof env.FileSystemFileHandle?.prototype?.createWritable === 'function' };
}
export function canOpen(c) { return c.secure && c.picker && c.hashing && c.streams; }
export async function permission(handle, mode = 'read', ask = false) {
  if (typeof handle.queryPermission !== 'function') fail('Ordnerberechtigungen können nicht geprüft werden.');
  let p = await handle.queryPermission({ mode });
  if (p !== 'granted' && ask) p = await handle.requestPermission({ mode });
  if (p !== 'granted') fail('Ordnerzugriff nicht erlaubt. Ordner erneut auswählen und Berechtigung prüfen.');
}
const segment = name => { if (!/^[A-Za-z0-9._-]{1,120}$/.test(name) || name === '..' || name === '.') fail('Ungültiger interner Pfad.'); return name; };
async function fileOperation(operation, action) {
  try { return await action(); }
  catch (cause) {
    const error = new Error(cause.message, { cause });
    error.name = cause.name; error.operation = operation;
    throw error;
  }
}
export class FolderStorage {
  constructor(handle) { this.handle = handle; }
  async parent(path, create = false) {
    const parts = path.split('/').map(segment); const name = parts.pop(); let dir = this.handle;
    for (const p of parts) dir = await fileOperation('Unterordner öffnen', () => dir.getDirectoryHandle(p, { create }));
    return { dir, name };
  }
  async read(path, limit = 16 * 1024 * 1024) {
    const { dir, name } = await this.parent(path);
    const handle = await fileOperation('Datei erneut öffnen', () => dir.getFileHandle(name));
    const file = await fileOperation('Dateistand lesen', () => handle.getFile());
    if (file.size > limit) fail('Archivdatei überschreitet die Größenbegrenzung.');
    return new Uint8Array(await fileOperation('Dateiinhalt lesen', () => file.arrayBuffer()));
  }
  async stat(path) {
    const {dir,name}=await this.parent(path);
    const file=await (await dir.getFileHandle(name)).getFile();
    return {size:file.size,lastModified:Math.trunc(file.lastModified)};
  }
  async writeCache(path,data) {
    if (!/^indexes\/v1\/[a-f0-9]{64}\.json$/.test(path)) fail('Nur Suchübersichten dürfen ersetzt werden.');
    const {dir,name}=await this.parent(path,true);
    const stream=await (await dir.getFileHandle(name,{create:true})).createWritable();
    try {await stream.write(data);await stream.close();}catch(error){try{await stream.abort();}catch{}throw error;}
  }
  async exists(path) {
    try { const { dir, name } = await this.parent(path); await dir.getFileHandle(name); return true; }
    catch (e) { if (e.name === 'NotFoundError') return false; throw e; }
  }
  async writeNew(path, data) {
    if (await this.exists(path)) fail('Vorhandene Archivdatei wird nicht überschrieben.');
    const { dir, name } = await this.parent(path, true);
    const handle = await fileOperation('Datei anlegen', () => dir.getFileHandle(name, { create: true }));
    const stream = await fileOperation('Schreibstream öffnen', () => handle.createWritable());
    try { await fileOperation('Daten schreiben', () => stream.write(data)); await fileOperation('Datei schließen', () => stream.close()); }
    catch (e) { try { await stream.abort(); } catch {} throw e; }
  }
  async list(path = '') {
    let dir = this.handle;
    if (path) for (const p of path.split('/').map(segment)) {
      try { dir = await dir.getDirectoryHandle(p); } catch (e) { if (e.name === 'NotFoundError') return []; throw e; }
    }
    const found = []; await fileOperation('Ordnerinhalt lesen', async () => { for await (const [name, handle] of dir.entries()) found.push({ name, kind: handle.kind }); });
    return found.sort((a, b) => a.name.localeCompare(b.name));
  }
  async removeOwnedProbe(name) { await fileOperation('Eigene Prüfdatei entfernen', () => this.handle.removeEntry(segment(name))); }
}
export async function verifiedWrite(storage, path, data) {
  const expected = bytes(data);
  await storage.writeNew(path, expected);
  const result = await storage.read(path, expected.length + 1);
  if (result.length !== expected.length || await sha256(result) !== await sha256(expected)) fail('Schreibprüfung fehlgeschlagen. Erneut öffnen; nicht erneut blind importieren.');
}
export function validateManifest(m) {
  if (m?.format !== FORMAT || !validId(m.archiveId)) fail('Kein lesbares NPT-Archiv. Nichts wurde initialisiert.');
  if (m.schemaVersion !== SCHEMA) fail(`Archivformat ${m.schemaVersion} wird nicht unterstützt. Passende App-Version verwenden; Ordner unverändert lassen.`);
  if (typeof m.createdAt !== 'string') fail('Archivmetadaten beschädigt.');
  return m;
}
export async function readManifest(storage) {
  let data;
  try { data = await storage.read('archive.json', 16384); }
  catch (error) {
    if (error.name === 'NotFoundError' || error.code === 'ENOENT') fail('In diesem Ordner fehlt archive.json. Für einen neuen, leeren Ordner „In leerem Ordner neu anlegen“ wählen. Ein bestehendes Archiv im übergeordneten Archivordner öffnen; fehlende Metadaten nicht neu erzeugen.');
    throw error;
  }
  return validateManifest(parseJson(data));
}
export async function inspectFolder(storage) {
  const entries = await storage.list();
  if (entries.some(entry => entry.name === 'archive.json')) return { kind: 'archive', manifest: await readManifest(storage) };
  return { kind: entries.length ? 'unrelated' : 'empty' };
}
export async function createArchive(storage, options = {}) {
  if ((await storage.list()).length) fail('Neues Archiv nur in einem vollständig leeren Ordner anlegen.');
  const m = { format: FORMAT, schemaVersion: SCHEMA, archiveId: uid(), createdAt: new Date().toISOString() };
  if(options.syntheticOnly)m.syntheticOnly=true;
  await verifiedWrite(storage, 'archive.json', JSON.stringify(m));
  return readManifest(storage);
}
// This explicitly requested probe is the only operation that removes a file, and only its own random name.
export async function probeFolder(storage, onProgress = () => {}) {
  // A visible plain-text name avoids hidden-file handling by file providers and makes failed cleanup inspectable.
  const name = `npt-ordnerpruefung-${uid()}.txt`;
  const content = `SYNTHETIC NPT archive capability probe ${uid()}`;
  let step = 'Ordner lesen';
  try {
    onProgress(step);
    await storage.list();
    step = 'Prüfdatei anlegen, schreiben und schließen'; onProgress(step);
    await storage.writeNew(name, bytes(content));
    step = 'Prüfdatei erneut öffnen und lesen'; onProgress(step);
    const reopened = await storage.read(name, 4096);
    if (decode(reopened) !== content || await sha256(reopened) !== await sha256(content)) fail('Inhalt der Prüfdatei stimmt nicht überein.');
    step = 'Eigene Prüfdatei entfernen'; onProgress(step);
    await storage.removeOwnedProbe(name);
  } catch (error) {
    const failedStep = error.operation || step;
    const result = new Error(`Ordnerprüfung fehlgeschlagen: ${failedStep}. ${error.name === 'NotFoundError' ? 'Der Ordner oder die Prüfdatei ist über den Browser nicht erreichbar. Ordner erneut auswählen; bei einem synchronisierten Ordner die lokale Verfügbarkeit prüfen.' : error.name === 'NotAllowedError' ? 'Lese-/Schreibzugriff wurde verweigert. Berechtigung und Browser-/Betriebssystemeinstellungen prüfen.' : 'Ordnerzugriff prüfen und den Ordner erneut auswählen.'}`);
    result.name = 'FolderProbeError';
    result.details = `Schritt: ${failedStep}\nBrowserfehler: ${error.name || 'Error'}\n${error.message || ''}\nEigene synthetische Prüfdatei: ${name}\nFalls diese Datei zurückbleibt, ist nur diese Prüfdatei betroffen. Es wurde kein Archiv angelegt oder geändert.`;
    result.cause = error;
    throw result;
  }
  return 'Erstellen, Schreiben, Schließen, Lesen und Wiederöffnen erfolgreich.';
}
