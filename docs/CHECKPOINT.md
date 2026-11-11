# Saved checkpoint · 10 November 2026 · version 0.2.0

## Working agreement

Develop and refine on the user's private Mac with synthetic data. Hospital access is occasional and is not a prerequisite for local progress. Prepare matching versioned source/static handoffs for later hospital trials, then troubleshoot those findings on the Mac. The original iPad assessment app and supplied handoff stay separate and unchanged.

The user requested a stopping point before disconnecting the Mac from the internet. This checkpoint is a complete local 0.2.0 milestone; further refinement is deferred until resuming.

## Completed in this milestone

- Lightweight per-record folder indexes, compact in-memory overview and bounded on-demand source loading. Deleting indexes or browser site data preserves patients, stays, types, chosen revisions and original attachment relationships in authoritative records.
- Original CSV verification before assessment detail/patient comparison values; original PDF verification before local viewing/download. Full integrity checks and verified backup bypass caches.
- Exact seven assessment-type labels in `src/assessment-types.js`. New CSV imports require an explicit choice. Durable type corrections preserve history; old records remain “Noch nicht zugeordnet”. Both examination lists and patient/history views filter by type.
- A guided three-step import, readable final summary with missing-information links, explicit bulk assignment for selected new investigations, patient creation and PDF-association hints requiring review. Technical raw fields, checksums and provenance are expandable details.
- Simpler examination detail and patient history, selected unmodified source values with manual/partial/aborted/version evidence, and on-demand verified patient comparisons. No clinical recalculation or interpretation.
- Corporate manual colors retained, with readable sidebar contrast. Logo structure/fonts unchanged.
- `npm run demo`: a new synthetic practice library outside the source project, with 80 patients, 240 assessments, 264 revisions, 457 unique originals, repeat stays, all types, legacy unknowns, missing reports and import exercises. The current persistent path is in ignored `test-results/demo-latest.json`.
- `npm run export:hospital`: checks, build and separate matching source/static ZIPs, SHA-256 hashes, version/test metadata and handoff instructions. The latest export directory is recorded in ignored `releases/LATEST.txt`. Generated practice libraries and patient archives are excluded.

## Verification

- 50 passing Node tests covering parser, import, durable failure paths, category requirements/history, compact/cache fallback, original verification, same-size/same-time corruption boundary and realistic demo exercises.
- Browser regression passed in isolated Chrome 156: actual UI/file inputs, native OPFS adapter probe, simulated external picker backed by real temporary disk, guided import, missing-type save prevention, all seven type filters, patient filtering/comparison, deliberate bulk assignment, revisions, site-data deletion/reopen, PDF scripting/link isolation, verified copy/reopen, same-profile writer exclusion, responsive layout, literal HTML-like notes and no external/content-bearing requests.
- Local benchmark at 7,800 assessments / 520 records / about 437.5 MB source archive: full-source/hash path 4.43 s and 632 MiB retained Node heap; cold compact rebuild 3.48 s and 72 MiB; warm persisted index 1.27 s and 85 MiB. Warm opening read zero source-record bytes or original files. Tiny PDF fixtures/local disk; these are not network-drive guarantees. See `docs/VALIDATION.md` and `test-results/volume-indexed-7800.json`.
- Synthetic screenshots are in ignored `test-results/`: guided assignment/review, practice library, patient history, bulk review and examination list.

## Resume locally

Project: `/Users/johannesjungilligens/archive-npt/npt-archive`.

The local preview is `http://127.0.0.1:5186`. Hard-refresh with `⌘⇧R`; bottom left should show 0.2.0. Its runtime assets are bundled and the development preview can run without internet. Keep the local server running, or restart it from the project folder:

```sh
npm run dev
```

Use the **Bibliothek** subfolder of the path in `test-results/demo-latest.json`. Exercise inputs are in **Importuebung**, with fictional IDs/types in **ZUORDNUNGSHILFE.json**. For step-by-step instructions read `docs/QUICKSTART.md`. Do not select the parent of Bibliothek/Importuebung as the archive itself.

Installed dependencies suffice for `npm test`, `npm run build`, `npm run demo` and `npm run export:hospital` offline. A fresh dependency installation would require the registry/cache. Browser automation additionally needs the separate disposable Chrome debugger described in README; user-facing preview does not.

## Important boundaries and later work

- Normal index use relies on source filename/size/mtime plus cache checksums. A same-size/same-time source edit may not be detected in an overview until source access or a full check. Full checks and backups bypass this accelerator. This is documented/tested, not an authenticated or tamper-proof audit mechanism. See `docs/INDEXING.md`.
- One writer only. Web Locks cover the same origin/profile, not another PC or browser profile. No patient backend/cloud database, PWA installation requirement or hospital localhost service was introduced.
- Hospital browser policies, actual network storage, realistic producer-printed PDF files and IT restore/hosting remain later acceptance items. Local development continues independently.
- Optional structured iPad full-backup ingestion remains deferred. CSV/PDF import works; unsupported full backups are explicitly rejected.
- Next refinements can follow the user's feedback on the guided workflow. In particular: clearer up-front guidance when multiple different CSVs share a source session (the current save validator already requires sequential import), more novice-user trials and realistic synthetic producer-print PDF coverage. No further changes are in progress at this checkpoint.

Version 0.2.0 opens existing schema-1 archives. New type-assignment operations require a current app; older app versions should remain read-only on unknown operations. Original clinical bytes/scores are never rewritten by metadata/type corrections.
