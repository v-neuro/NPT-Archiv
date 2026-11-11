import { newSaveAttempt } from './save-status.js';
import { FORMAT, SCHEMA, MAX_FILE, bytes, fail, parseJson, sha256, uid, validHash, validId, text } from './shared.js';
import { applyOperations, emptyState, objectPath, originalsOf } from './model.js';
import { readManifest, verifiedWrite } from './storage.js';
import { seal, validateRecord, verifyOriginal } from './record.js';
import { scanLibrary, commitLibrary, loadAssessmentDetail, writeLibraryIndex } from './library.js';
const RECORD_FORMAT = `${FORMAT}-commit`;

export { seal } from './record.js';
export async function scanArchive(storage) {
  const manifest = await readManifest(storage); const issues = []; const records = []; const verified = new Map();
  const entries = await storage.list('records');
  for (const entry of entries) {
    try {
      if (entry.kind !== 'file') fail('Unerwarteter Ordner im Commit-Verzeichnis.');
      records.push(await validateRecord(parseJson(await storage.read(`records/${entry.name}`)), manifest.archiveId, entry.name));
    } catch { issues.push({ severity: 'error', path: `records/${entry.name}`, message: 'Commit unlesbar, unvollständig oder nicht unterstützt. Nicht löschen; Sicherung und passende App-Version prüfen.' }); }
  }
  const children = new Map();
  for (const record of records) { const key = record.payload.parent; if (!children.has(key)) children.set(key, []); children.get(key).push(record); }
  let state = emptyState(); let head = null; const accepted = []; const used = new Set();
  while (true) {
    const next = children.get(head) ?? [];
    if (!next.length) break;
    if (next.length !== 1) { issues.push({ severity: 'error', path: 'records/', message: 'Verzweigte Commit-Kette: mögliche gleichzeitige Schreibzugriffe. Letzter gemeinsamer Stand wird angezeigt.' }); break; }
    const record = next[0]; const p = record.payload;
    try {
      for (const a of originalsOf(p.operations)) {
        const path = objectPath(a);
        if (!verified.has(path)) { await verifyOriginal(storage, a); verified.set(path, a.size); }
        else if (verified.get(path) !== a.size) fail('Widersprüchliche Dateigröße für identische Originalbytes.');
      }
      const updated = applyOperations(state, p.operations, { id: p.id, checksum: record.checksum, createdAt: p.createdAt, actor: p.actor });
      state = updated; head = record.checksum; used.add(head); accepted.push(record);
    } catch { issues.push({ severity: 'error', path: `records/${p.id}.json`, message: 'Commit oder Originaldatei ungültig. Letzter vollständig geprüfter Stand bleibt verfügbar.' }); break; }
  }
  if (records.some(r => !used.has(r.checksum))) issues.push({ severity: 'error', path: 'records/', message: 'Nicht eingelesene Folge- oder Fremd-Commits. Schreibschutz bis zur geprüften Wiederherstellung.' });
  // Unknown content is visible and never deleted or overwritten.
  const rootEntries = await storage.list();
  for (const e of rootEntries) if (!['archive.json', 'objects', 'records', 'indexes'].includes(e.name)) issues.push({ severity: 'info', path: e.name, message: 'Zusätzlicher Inhalt; unverändert belassen.' });
  for (const prefix of await storage.list('objects')) {
    if (prefix.kind !== 'directory' || !/^[a-f0-9]{2}$/.test(prefix.name)) { issues.push({ severity: 'error', path: `objects/${prefix.name}`, message: 'Unerwarteter Objektpfad.' }); continue; }
    for (const e of await storage.list(`objects/${prefix.name}`)) {
      const path = `objects/${prefix.name}/${e.name}`;
      if (!verified.has(path)) issues.push({ severity: 'info', path, message: 'Nicht referenziertes Objekt (z. B. unterbrochener Import); wird nicht automatisch gelöscht.' });
    }
  }
  return { manifest, state, head, issues, records: accepted, readOnly: issues.some(i => i.severity === 'error') };
}
export class Archive {
  constructor(storage, snapshot, memory = new Map()) { this.storage = storage; this.snapshot = snapshot; this.busy = false; this.recordIndex = memory; this.detailCache = new Map(); }
  static async open(storage, options = {}) { const memory = new Map(); return new Archive(storage, options.compact ? await scanLibrary(storage,{memory}) : await scanArchive(storage), memory); }
  async refresh(options = {}) { this.recordIndex.clear(); this.detailCache.clear(); this.snapshot = this.snapshot.compact ? await scanLibrary(this.storage,{deep:options.deep??true,memory:this.recordIndex}) : await scanArchive(this.storage); return this.snapshot; }
  async rebuildIndex() { await this.refresh({deep:true}); if (!this.snapshot.readOnly) await writeLibraryIndex(this.storage,this.snapshot); return this.snapshot; }
  async assessmentDetail(id) { return loadAssessmentDetail(this,id); }
  async commit(operations, files = new Map(), actor = '') {
    if (this.snapshot.compact) return commitLibrary(this,operations,files,actor);
    if (this.busy) fail('Ein Schreibvorgang läuft bereits.');
    this.busy = true;this.lastAttempt=newSaveAttempt(this.snapshot);
    try {
      if (this.snapshot.readOnly) fail('Archiv im Schreibschutz. Wiederherstellung prüfen.');
      if (!text(actor, 100)) fail('Bearbeiterkürzel ungültig.');
      const before = await scanArchive(this.storage);
      if (before.readOnly || before.head !== this.snapshot.head || before.manifest.archiveId !== this.snapshot.manifest.archiveId) fail('Archiv wurde geändert. Erneut öffnen und Auswahl prüfen.');
      applyOperations(before.state, operations); // Validate entire transaction before touching disk.
      const id = uid();
      const payload = { format: RECORD_FORMAT, schemaVersion: SCHEMA, archiveId: before.manifest.archiveId,
        id, parent: before.head, createdAt: new Date().toISOString(), actor, operations };
      const envelope = await seal(payload); const encoded = bytes(JSON.stringify(envelope));Object.assign(this.lastAttempt,{recordId:id,checksum:envelope.checksum,parent:payload.parent});
      if (encoded.length > 16 * 1024 * 1024) fail('Commit zu groß. Kleineren Stapel importieren.');
      for (const a of originalsOf(operations)) {
        const path = objectPath(a);
        if (!(await this.storage.exists(path))) {
          const data = files.get(a.hash);
          if (!data || data.length !== a.size || await sha256(data) !== a.hash) fail('Originalbytes fehlen oder wurden verändert.');
          await verifiedWrite(this.storage, path, data);
        }
        await verifyOriginal(this.storage, a);
      }
      // A second stale-head check reduces accidental overlap; it is not a cross-PC lock.
      const latest = await scanArchive(this.storage);
      if (latest.readOnly || latest.head !== before.head) fail('Anderer Schreibzugriff erkannt. Neu laden und prüfen.');
      this.lastAttempt.recordWriteStarted=true;this.lastAttempt.outcome='uncertain';
      await verifiedWrite(this.storage, `records/${id}.json`, encoded);
      const after = await scanArchive(this.storage);
      this.snapshot = after;
      if (after.readOnly || after.head !== envelope.checksum) fail('Commit nicht eindeutig verifiziert. Ordner erneut öffnen; Wiederherstellung prüfen.');
      this.lastAttempt.outcome='saved';
      return after;
    } catch (e) {
      // Includes uncertain close/readback errors: disallow retrying against stale in-memory state.
      this.snapshot.readOnly = true;
      this.snapshot.issues.push({ severity: 'error', path: 'Schreibvorgang', message: 'Schreibergebnis unklar. Ordner neu einlesen, bevor weitergeschrieben wird.' });
      throw e;
    } finally { this.busy = false; }
  }
}
export async function copyArchive(source, target) {
  if ((await target.list()).length) fail('Sicherungsziel muss vollständig leer sein.');
  const snapshot = await scanLibrary(source,{deep:true});
  if (snapshot.readOnly) fail('Beschädigtes Archiv: vollständige Dateisystem-Sicherung durch IT erstellen; App-Kopie abgebrochen.');
  // Copy every file, including orphan/recovery files, with no overwrites. Manifest last.
  const inventory = [];
  async function walk(path = '') {
    for (const entry of await source.list(path)) {
      const file = path ? `${path}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') await walk(file);
      else if (file !== 'archive.json') inventory.push(file);
    }
  }
  await walk();
  for (const path of inventory) await verifiedWrite(target, path, await source.read(path, MAX_FILE));
  const again = await scanLibrary(source,{deep:true});
  if (again.head !== snapshot.head || again.readOnly) fail('Archiv während Sicherung geändert. Ziel nicht als vollständige Sicherung verwenden.');
  await verifiedWrite(target, 'archive.json', await source.read('archive.json', 16384));
  const restored = await scanLibrary(target,{deep:true});
  if (restored.readOnly || restored.head !== snapshot.head) fail('Sicherung konnte nicht validiert werden.');
  return { commits: restored.records.length, files: inventory.length + 1, archiveId: restored.manifest.archiveId };
}
