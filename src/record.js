import { FORMAT, SCHEMA, MAX_FILE, fail, sha256, text, validHash, validId } from './shared.js';
import { objectPath } from './model.js';
export const seal = async payload => ({payload,checksum:await sha256(JSON.stringify(payload))});
export function validateRecordMetadata(record, archiveId, name) {
  const p = record?.payload;
  if (!p || p.format !== `${FORMAT}-commit` || p.schemaVersion !== SCHEMA || p.archiveId !== archiveId
    || !validId(p.id) || name !== `${p.id}.json` || (p.parent !== null && !validHash(p.parent))
    || !text(p.actor,100) || !text(p.createdAt,40) || !validHash(record.checksum)) fail('Speichereintrag nicht unterstützt oder beschädigt.');
  return record;
}
export async function validateRecord(record, archiveId, name) {
  validateRecordMetadata(record,archiveId,name);
  if (record.checksum !== await sha256(JSON.stringify(record.payload))) fail('Prüfsumme des Speichereintrags stimmt nicht überein.');
  return record;
}
export async function verifyOriginal(storage, original) {
  const data = await storage.read(objectPath(original),MAX_FILE);
  if (data.length !== original.size || await sha256(data) !== original.hash) fail('Originaldatei fehlt oder ist beschädigt. Bitte die Bibliothek prüfen.');
}
