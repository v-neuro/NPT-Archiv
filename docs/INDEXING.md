# Rebuildable overview and on-demand details · version 0.2.0

## Authority and format

The system of record remains `archive.json`, immutable `records/*.json` and original `objects/*/*.{csv,pdf}`. Patient/stay links, source revision selection and manually assigned assessment types are operations in those durable records. The index is a derived copy, never the only place for a relationship. Deleting indexes or browser site data cannot remove those relationships.

```text
indexes/v1/<sha256-of-source-fingerprint-and-adapter-versions>.json
```

Each derived file is a checksummed envelope with format `digitale-npt-derived-record`, projection version 1, archive ID, parser version and one projected source record. It contains the source record filename, size and last-modified timestamp; original record checksum/parent; operation metadata; compact revision summaries; and the source record ID/checksum needed to load the complete revision later. Patient identifiers never become filenames.

Compact summaries keep examination date/time text, examiner/demographic display hints, selected known measures and exported mode/completeness/variant/scoring flags. Full raw cells, notes, unknown fields and full precision remain in the authoritative records and originals. The index does not recalculate anything. It is excluded from the static build and source handoff and stays in the selected archive folder.

## Normal opening

1. Validate the archive manifest. Enumerate the actual record directory; an index cannot invent a record absent from that directory.
2. Read each record's file metadata. A valid cache is keyed by source filename, size, last-modified time and projection/parser versions and protected by its own checksum. Wrong archive ID, unsupported versions or malformed cache cause fallback to source.
3. On a miss, read/check the complete source record checksum and schema, project it, and discard its large raw document from the library overview.
4. Replay the unique parent chain with operation validation. Forks, detached/unreadable records and unsupported operations still force read-only mode. File enumeration order and clocks do not choose a winning branch.

The current index is per record, not one large mutable archive database. A warm open reads compact index files and source metadata; it does not rehash every PDF or load all raw clinical fields. The in-memory overview includes patient/stay/type history and selected revision identity. History/overview maps copy only touched entity collections; patient-identifier uniqueness uses a set per transaction.

The browser stores no patient index in IndexedDB/localStorage/OPFS. Selected handles and bounded detail caches are runtime memory only. Source records unchanged within a session reuse the in-memory projection. The persisted index permits a new browser instance to reopen efficiently.

## Integrity boundary

**A metadata-fingerprint cache is not a full integrity check.** Same-size edits or bit corruption that preserve a source timestamp can remain undetected on a cached overview until source access or full verification. The index is not a tamper-proof audit log or authentication boundary. A writable folder and self-recomputed checksums cannot establish authorship.

Assessment detail opening reads and validates the referenced source record and verifies its original CSV hash. The record cache is bounded to eight complete source records. Patient comparison values are loaded only on request from these verified full sources; clinical values are not displayed from the cached overview alone. Original PDF viewing/downloading verifies that file's length/hash before access. Unknown raw fields and quoted-empty/missing distinctions are available from the full source.

“Bibliothek prüfen & Übersicht erneuern” ignores indexes, reads and checks every source record and referenced original hash, diagnoses missing/corrupt files and orphan objects, and rebuilds caches only for a valid state with write permission. A damaged original rejects the affected transaction in the full scan; previous valid state remains accessible. The verified backup path also performs full source and target verification, independent of caches. Routine opening is labelled ready, not “all originals verified”.

## Commits and cache writes

Before a save, source enumeration/fingerprints and the unique head are rechecked. The whole proposed transaction is validated. Every original needed by the new transaction is written if absent, closed, read back and hashed; existing reused originals are also checked. The head is checked again, the new immutable record is written last and verified, then the accepted head is reconstructed. Success is based on authoritative data, not a cache write.

After success, missing compact indexes are written and read back. Cache failure creates an informational recovery issue without undoing the verified source commit. `writeCache` permits replacement only of generated `indexes/v1/<hash>.json` files; it cannot overwrite a manifest, original or committed record. This is the sole disposable overwrite path. No source migration, original deletion or automatic orphan cleanup occurs. First-use old archives may open by rebuilding in memory; a subsequent save or explicit full check writes the derived files with normal folder permissions.

Per-file metadata checks and stale-head detection are not cross-PC locking. One writer remains the supported operating model.

## Compatibility and assessment types

New imports require one of the seven `assessment-types.js` IDs. The exact user-provided labels are presented to staff. Types are manual archive metadata; test fields or filenames never determine the type. Existing records without `assessmentTypeId` remain null and are filterable as “Noch nicht zugeordnet”. `assessment.type.set` adds/corrects the type with a reason and durable history; original CSV/PDF bytes remain unchanged.

Archive schema remains 1, with optional type metadata and the additional operation understood by 0.2.0. Older apps encountering an unknown operation must remain read-only; use the matching current app. Index format/projection version is independent of archive/app/parser versions. Unsupported index versions are discarded as accelerators and rebuilt from supported source records; unsupported archive versions remain untouched.
