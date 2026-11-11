# Rebuildable overview and on-demand details · updated for 0.7.0

## Authority and format

The system of record remains `archive.json`, immutable `records/*.json` and original `objects/*/*.{csv,pdf}`. Patient/stay links, source revision selection, manually assigned assessment types and reversible exclusion flags are operations in those durable records. The index is a derived copy, never the only place for a relationship. Deleting indexes or browser site data cannot remove those relationships.

```text
indexes/v1/<sha256-of-source-fingerprint-and-adapter-versions>.json
```

Each derived file is a checksummed envelope with format `digitale-npt-derived-record`, projection version 3, archive ID, parser version and one projected source record. It contains the source record filename, size and last-modified timestamp; original record checksum/parent; operation metadata; compact revision summaries; and the source record ID/checksum needed to load the complete revision later. Patient identifiers never become filenames.

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

“Bibliothek prüfen” ignores indexes, reads and checks every source record and referenced original hash, diagnoses missing/corrupt files and orphan objects, and rebuilds caches only for a valid state with write permission. A damaged original rejects the affected transaction in the full scan; previous valid state remains accessible. The verified backup path also performs full source and target verification, independent of caches. Routine opening is labelled ready, not “all originals verified”.

## Commits and cache writes

Before a save, source enumeration/fingerprints and the unique head are rechecked. The whole proposed transaction is validated. Every original needed by the new transaction is written if absent, closed, read back and hashed; existing reused originals are also checked. The head is checked again, the new immutable record is written last and verified, then the accepted head is reconstructed. Success is based on authoritative data, not a cache write.

After success, missing compact indexes are written and read back. Cache failure creates an informational recovery issue without undoing the verified source commit. `writeCache` permits replacement only of generated `indexes/v1/<hash>.json` files; it cannot overwrite a manifest, original or committed record. This is the sole disposable overwrite path. No source migration, original deletion or automatic orphan cleanup occurs. First-use old archives may open by rebuilding in memory; a subsequent save or explicit full check writes the derived files with normal folder permissions.

Per-file metadata checks and stale-head detection are not cross-PC locking. One writer remains the supported operating model.

## Compatibility and assessment types

New imports require one of the seven `assessment-types.js` IDs. The exact user-provided labels are presented to staff. Types are manual archive metadata; test fields or filenames never determine the type. Existing records without `assessmentTypeId` remain null and are filterable as “Noch nicht zugeordnet”. `assessment.type.set` adds/corrects the type with a reason and durable history; original CSV/PDF bytes remain unchanged.

Archive schema remains 1, with optional type metadata and the additional operation understood by 0.2.0. Older apps encountering an unknown operation must remain read-only; use the matching current app. Index format/projection version is independent of archive/app/parser versions. Unsupported index versions are discarded as accelerators and rebuilt from supported source records; unsupported archive versions remain untouched.

Version 0.4.0 adds `assessment.exclusion.set`. The projection retains this metadata operation unchanged; replay defaults legacy assessments to included, then applies explicit status changes. Exclusion is stored in authoritative records and survives index deletion. Older readers that do not understand the new operation remain read-only. Archive/projection schemas remain 1. Patient comparison values omit excluded assessments; full verification/backup still process their originals.

## Projection 2: all observed fields without loading all values

The physical namespace remains `indexes/v1/`, independently of the envelope/projection version. Projection 2 adds `fieldLayouts`, deduplicated header-name arrays per record. Each compact document has a `sourceFieldLayout` index and sorted unique `presentFieldIndices` for nonempty exported cells. At load time, `sourceFields` is a non-enumerable reference to the shared layout; it is not repeatedly serialized. Compact raw fields remain restricted to overview/context needs, so long notes and unknown values stay in the source documents.

The archive field-choice helper unions every revision’s observed headers, including legacy/historical/excluded records. An optional search narrows choices without clearing an already selected field. Presence filtering uses the selected revision’s positions and includes zero. This metadata indicates source presence, not clinical validity or completed administration.

The projection version participates in cache keys and envelope validation. Version-1 caches are ignored; malformed dictionaries/positions fall back to checksummed source records. No source file or original score is migrated. Dictionary names/counts, compact header membership, integer position bounds and ordering are checked before using an inventory. Index deletion leaves every choice reconstructible.

On the local 7,800-examination synthetic run for 0.5.0/projection 2: cold rebuild 3.51 s / 83 MiB retained heap; warm open 1.4 s / 93 MiB, 520 index hits, zero source-record bytes or original hashes read on the warm path. Tiny synthetic PDFs/local Mac disk; this does not establish hospital share latency.

## Projection 3: numeric performance eligibility

Projection 3 adds `numericPerformanceFieldIndices`, sorted unique positions in each document’s shared header layout. Positions must be in bounds, present in `presentFieldIndices` and eligible by field name. Warm readers can form dynamic filter/comparison choices without loading every raw value. Version 1/2 indexes are ignored and rebuilt from supported source records. The physical `indexes/v1` namespace and authoritative archive schema/parser versions are unchanged.

Current UI choices union numeric performance positions from **selected revisions** only. The archive filter considers all examinations, including excluded ones; patient comparison scopes to that patient’s included/type-matching examinations. Notes, demographics/IDs, source versions, entry modes, completion/abortion flags and similar administration fields are excluded by explicit naming rules. Unknown numeric fields remain eligible unless their names mark them as metadata. Dot/comma decimals, signed numbers and exponents are recognized solely for eligibility. Source text/precision and parser normalization remain unchanged. A populated/default numeric source field is not proof that a test was administered. Earlier all-header inventories are still retained for source access and all-field CSV export.

CSV export uses `scanLibrary({verifyRecords:true})` to bypass memory/persisted indexes for authoritative record checksums. It then reads/verifies selected source CSVs using a fresh bounded detail cache, exports full raw fields and rechecks the head/inventory before making a download available. It does not write a cache or any archive file. This is an export consistency check, not full PDF/backup verification or distributed locking.

Projection 3 benchmark (7,800 examinations / 520 records, 0.6.0): cold 3.84 s / 86 MiB; warm 1.49 s / 95 MiB retained Node heap, 520 index hits, zero source-record bytes/original hashes on warm open. Local Mac disk/tiny synthetic PDFs; no hospital network performance guarantee.

## Read access and UI refresh in 0.7.0

Opening a library/refreshing its compact view no longer reserves the writer lock. Editing explicitly obtains it and rechecks the folder snapshot before sole-writer confirmation. Lightweight refresh clears loaded source caches and re-inspects retained import files; it cannot unblock unresolved saves. The UI connection/full check uses a fresh `scanLibrary({deep:true})` with no index writes and resolves exact attempted-save evidence. Core `rebuildIndex()` and authorized commits still support writing derived caches. Measurement label/group changes do not change projection 3 or source data.
