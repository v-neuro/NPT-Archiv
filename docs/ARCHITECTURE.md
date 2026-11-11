# Folder format v1 and failure boundaries

## Durable identities

`archive.json` identifies `digitale-npt-folder-archive`, schema version 1, a random archive UUID and creation timestamp. New archives are initialized only in an explicitly selected completely empty directory. Existing/unreadable/unknown manifests are never replaced. A failed initialization requires inspection or another empty folder.

```text
selected hospital folder/
  archive.json
  objects/<first-two-hash-characters>/<sha256-of-exact-bytes>.csv
  objects/<first-two-hash-characters>/<sha256-of-exact-bytes>.pdf
  records/<random-commit-UUID>.json
  indexes/v1/<generated-cache-hash>.json  # disposable, fully rebuildable
```

Internal names use generated UUIDs and hashes only. Original filenames, source session IDs and numeric hospital identifiers never become paths. A shared original object can support multiple history references. Patients, stays, source sessions, internal assessments, source revisions and attachment identities are distinct. Revisions record complete raw parsed cells (including quoted/missing distinction), explicit typed fields, warnings, unknown fields, parser version, source date/time text, nullable timezone and producer version, header signature and semantic hash. No transformations are written back to original bytes.

Each commit is `{payload, checksum}`. `checksum` is SHA-256 of UTF-8 `JSON.stringify(payload)` with its persisted property order. Payload includes format `digitale-npt-folder-archive-commit`, `schemaVersion:1`, archive ID, commit UUID, parent checksum or null, ISO creation time, optional self-entered actor label, and ordered operations. Hashes detect accidental corruption, not authorship. A user who can edit the folder can also rewrite checksums.

Operations: `patient.create`, `assessment.create` (including numeric stay ID, nullable patient link and optional assessmentTypeId), `revision.add`, `revision.select`, `patient.link` with reason, `stay.update` with reason, `assessment.type.set` with reason, `attachment.add`, `attachment.unlinked`, and `attachment.link`. Every patient/link/revision/attachment change is durable metadata. No patient lookup is a browser-only index. The patient identifier and stay identifier are decimal **strings**, not numbers. Stay IDs need not be unique per assessment: multiple assessments in the same stay are valid. Patient identifiers are unique exact strings within an archive. Leading zeroes are significant; institutional normalization rules remain pending.

## Commit protocol

1. Read/validate files and review the selected subset in memory. Reject malformed CSV and unsupported inputs. Validate all operations as one transaction before any original is written.
2. Re-read the manifest, record inventory/fingerprints and unique chain head. Validated compact projections may be reused; changed/uncached source records are read and checked in full. A stale head, recovery error or wrong archive identity blocks writing.
3. For every new original, hash the imported bytes, create its generated path, write, close, reread and check length/hash. Never overwrite an existing object. Verify existing deduplicated objects too.
4. Check the chain head again. If it changed, leave written unreferenced objects in place and stop.
5. Create the unique immutable commit file **last**, close it, reread and validate exact bytes/checksum.
6. Re-scan the archive. Show success only if the new commit is the sole valid head with the new transaction’s required originals valid. Unchanged earlier originals are verified on access or full integrity check. The UI is rebuilt from that scan, with no authoritative index update needed.

These operations do not form an atomic directory transaction. File stream close is not a promise that a network server has durably flushed to physical storage. Sudden power loss, SMB caching, disconnects and filesystem-specific behavior require actual IT testing. If close/readback fails after a commit may have succeeded, the session goes read-only; reopening determines whether it exists. Never blindly retry against stale memory.

Every committed transaction is applied to a tentative view with only touched entity collections copied. If an operation or object reference fails, none of that transaction's changes enters the accepted view. Unrelated prior commits remain available.

## Deterministic replay and recovery

During full integrity checking, enumerate records; check bounded JSON size, safe keys/nesting, supported versions, archive ID, filename UUID, checksum, parent, operation invariants and required original hashes/lengths. Group by parent checksum, replay from the unique root and accept only a unique next child. File enumeration order and local clocks never select a winner. A fork stops at the last common valid parent. A malformed/unrecognized commit, missing/corrupt original, detached chain or unknown operation forces read-only mode and a visible issue. Unknown manifest schemas do not initialize or write; use a matching application version or verified restore.

Normal indexed opening follows the [index design](INDEXING.md): validate source inventory/fingerprints, cached envelope/version and unique chain; validate uncached records from source. Source details and original CSV/PDF bytes are checked on access. A same-size/same-time edit can remain unnoticed in a cached overview until access/full verification. The cache is not an authentication or integrity boundary.

During full checking, unreferenced objects are reported separately and remain untouched. They may result from interrupted pre-commit writes. The app performs no cleanup, deletion, automatic rollback, fork choice or repair. Failed first commits can leave objects and an otherwise empty valid archive; malformed final commits require recovery. Restore the **entire** folder to a different location using IT backup procedures, then open and fully validate it. Do not merge two restored copies by copying individual records together.

Future migrations must be copy-based to a new archive/format, retaining all originals and old metadata. This release refuses unknown archive schemas/operations; it does not attempt source migration. Version 0.2.0 opens older schema-1 archives; older apps encountering the new type-assignment operation must remain read-only. Index versions are separate and disposable. Saved app/parser versions make reprocessing explicit rather than silently revising scores.

## Import decisions

New CSV imports require an explicit staff-selected assessment type from the seven-entry catalogue. Legacy records without one remain null; no type is inferred from administered tests or filenames. A correction is an append-only `assessment.type.set` event with a reason. Assessment and patient/history filters use this durable metadata. Clinical source values and original bytes remain unchanged. See [INDEXING](INDEXING.md) for schema/older-app behavior.


CSV grammar is strict semicolon CSV with escaped double quotes and embedded newlines, optional BOM and CRLF. One assessment row per producer file. Header-name mapping accepts reordered, reduced and future columns, rejecting duplicates, unsafe/invalid names, invalid quoting and inconsistent lengths. The raw representation preserves missing unquoted cells, quoted empty strings and formula-safety apostrophes. The small numeric registry types only explicitly reviewed fields. Unrecognized numeric text remains text with a warning. German dates are explicitly validated and stored as local calendar dates; no UTC offset is invented.

Identical file bytes are reported and skipped. Different bytes with the same source session are reviewed as equivalent formatting or changed-value revisions. Selection is explicit; keeping a new revision does not silently change the displayed one. Patient/stay conflicts require separation or a later documented correction. A separated assessment retains the original source session ID. Two CSV exports of the same session in one batch require sequential imports for a stable review baseline. No demographic auto-merge occurs.

PDF matching is a hint only. Every PDF needs an explicit target and evidence, or deliberate unlinked storage. Relationships are to the assessment, not a proven CSV revision/export moment. Later attachments and later assignments are separate commits. The preview reports per-file errors; only the explicitly included valid files enter a single commit. Any failed decision prevents that entire reviewed set from committing. Source-file signature checks are not proof that a PDF is valid; preview failure never removes the original.

Limits: 100 files / 128 MiB batch, 32 MiB/file, 8 MiB/CSV, 2,000 columns, 1 MiB/cell, 16 MiB/commit, 500 operations/commit, bounded JSON nesting. Oversized content is rejected explicitly. Nothing is truncated.

## Concurrency, backup and privacy

Web Locks are held for the opened archive UUID and released before switching. Same-profile second tabs are read-only. Other PCs/profiles/origins are outside that lock's scope. Stale-head checks and fork detection **do not make simultaneous writers safe**. The operator confirms exclusive writing across PCs for each open session.

Verified app backup requires an empty target. It recursively copies all source files byte-for-byte with readback, including unreferenced/recovery files, checks the source head again and writes the manifest last. It validates the target's chain and originals before success. If interrupted, do not call that partial target a verified backup; preserve/inspect it and use another empty target. A damaged source needs a full IT filesystem copy before recovery, rather than an app backup that would endorse an incomplete state. IT's automatic network-drive backup is the primary backup; a network drive by itself is not a second copy. There is no deletion or retention-expiry feature.

No IndexedDB, localStorage, service worker, telemetry or patient-content fetch exists in the application. Files live in the selected folder and runtime memory. On browser-data deletion the folder handle is simply selected again. Static assets may be cached by the browser/host; they contain no patient data. PDF input is passed as bytes to a local sandboxed canvas renderer; PDF actions, links, forms and scripts are not instantiated. Built-in fonts/CMaps/WASM are bundled local assets. Downloading an original uses `application/octet-stream`; opening that downloaded file in another program falls under the hospital's approved viewer policy.

Archive files are unencrypted by this application. Controlled hosting code updates, managed browser/Windows security, filesystem ACLs, IT encryption, backups and approved transfer are necessary operational controls. A self-entered actor label and writable event files are traceability, not authentication or a tamper-proof audit log.
