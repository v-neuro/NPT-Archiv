# Current checkpoint · 11 November 2026 · version 0.7.1

User requested a home/start screen and logo navigation, total patient/session counts or a route to opening a library, followed by pushing the complete current version to GitHub main for hospital testing.

- Default route is home; original top-left wordmark is a native button returning there. Existing sidebar menu order is unchanged. No-library home links to storage setup; active home has library-wide patient/examination count cards with explicit excluded subtotal. Patients without examinations count; CSV revisions/attachments do not inflate session counts. Card actions clear list filters and show all assessment statuses. Counts use the folder-derived snapshot, no extra browser storage or requests.
- Browser regression covers empty/zero/active/filtered/excluded/revised/library-reopened counts, the 22-patient/66-exam fixture and responsive home layout. Existing 95 Node tests and full browser workflow are release checks. Hospital documents include current home behavior.
- Authorized publication target: https://github.com/v-neuro/NPT-Archiv, branch main. This includes all previously local workflow/CSV/recovery improvements through 0.7.0. Generated archives, releases, browser profiles, node_modules, private documents and test results stay excluded. Matching static/source/synthetic-test-kit handoff is built locally.
- Preview http://127.0.0.1:5186; hard-refresh ⌘⇧R. Hospital clients use the configured HTTPS deployment after it builds, no local services/install required. Check GitHub/Vercel status for deployed version.

Earlier checkpoints below describe historical local-only publication states.

---

# Current checkpoint · 11 November 2026 · version 0.7.0

User authorized all five suggested refinements plus grouped/readable measurement names. Implemented locally; no GitHub push or deployment in this task.

- Persistent import completion screen: exact patient/stay/operator, saved CSV/PDF, new examination/additional revision and skipped counts, affected exams/types, next-patient/details/report actions. Next patient clears IDs/files. Single PDFs open directly from lists/history/receipt; multiple PDFs use a filename chooser; none is explicit. Reports retain hash/length verification and show patient/stay/date context in the dialog.
- Default Nur ansehen reserves no writer lock or confirmation. Bearbeiten requests write permission/lock, refreshes the view, then requires sole-writer confirmation. Ending editing releases the lock. Multiple readers browse/export; only one writer in the same profile/origin, no cross-PC lock. Ansicht aktualisieren refreshes compact metadata/loaded details and re-inspects pending import choices, without a full integrity/hash pass. It cannot clear pending save recovery.
- Runtime-only save evidence in save-status.js plus both commit paths. Save feedback not-saved/uncertain/saved survives menu changes. Exact attempted record ID/checksum/base head and record-write phase distinguish failures. workflow.js reconnect performs a fresh full chain/original verification on the same handle; optional reselection checks archive identity. Recovered valid save is confirmed without replay. Missing attempt in valid matching history becomes absent-in-checked-state; corrupt/forked/rolled-back evidence remains uncertain. Retry/import edits blocked while pending. Recheck returns to read mode and does not repair/delete/write caches. Original formats/patient links remain folder-authoritative after browser-data deletion; drafts/evidence stay RAM-only.
- measurement-labels.js covers every eligible handed-over numeric producer field with readable labels and exact source keys, grouped by test; unknown fields keep original keys under Weitere Felder. No units/scoring/source normalization changes; projection 3 remains unchanged.
- Hospital handoff now has a third hospital-test-kit.zip, printable German TESTPLAN.html / IT-PROTOKOLL.html, four staged synthetic exercises, new 7-patient/21-examination practice library, FREEZE.json tied to exact source/static hashes, and per-kit-file digests. Templates are in docs/HOSPITAL-*.html; generator scripts/hospital-test-kit.mjs never reads existing libraries. Kit/source stay outside dist. Frozen artifact/version for manual hospital tests, not an approval or hospital backend.
- 95 Node tests pass. Chrome regression covers reader/writer lock handover, lightweight refresh/direct/multiple PDFs, grouped labels, receipts/reset, permission failure, close-acknowledgement loss and same-folder reconnect without duplicate commit, plus prior site-data deletion/backup/CSV/exclusion/security checks. No actual hospital network/permission/restore guarantee.
- Preview http://127.0.0.1:5186; hard-refresh ⌘⇧R. npm run export:hospital produces matching three-ZIP delivery; releases/LATEST.txt points to it. Hospital uses approved HTTPS app URL, no installation or file:// app launch. Test plan HTML is a standalone printable document and may be opened locally.

Earlier checkpoints below are historical.

---

# Current checkpoint · 11 November 2026 · version 0.6.0

Latest request: all numeric performance fields for selected-patient comparison and archive field filters; checkbox CSV export on examinations and patients. User confirmed select-all-filtered, one row per examination with IDs/date/type and all original fields, and excluded rows included with status.

- Numeric-performance classification recognizes raw numeric forms without changing source normalization. Notes, demographics/IDs, versions/modes/completion/administration flags are omitted. Unknown numeric fields are retained as choices. Archive options use selected revisions across all assessments; patient comparison scopes to that patient’s included/type-matching visits. Searchable source field names and raw verified values/context remain visible.
- Projection 3 adds numeric eligibility positions to shared field layouts. v1/v2 caches rebuild; physical indexes/v1 and archive schema/parser remain unchanged. No raw clinical data migration. 7,800-assessment local benchmark: cold 3.84 s / 86 MiB, warm 1.49 s / 95 MiB, zero source-record bytes/hashes on warm open.
- CSV checkbox selection on both pages, partial state, select-all across all matching pages/results, hidden-selected count and clear action. Library changes clear both selections. Examination exports contain exactly the selected sessions (excluded when selected); patient exports contain all examinations of selected patients, including excluded and other types hidden by filters. This scope was explained to the user and is shown in the interface.
- UTF-8/BOM semicolon CSV, one chosen revision per examination, collision-free archive metadata, all source fields/notes/unknowns, raw precision, explicit missing/absent/quoted-empty distinction and recorded spreadsheet-formula escaping. No clinical recalculation. IDs remain strings; Excel requires text import to preserve them. Not a full backup/restore format; PDF/earlier revisions stay in permanent library and full backups. See CSV-EXPORT.md.
- Export rechecks authoritative records despite warm caches, verifies selected CSVs with a fresh bounded reader, refuses changed heads/corrupt sources, checks inventory/head before local download, changes no archive files and requires only read access. 128 MiB output bound fails explicitly. Normal browser download policy still requires hospital acceptance.
- 86 Node tests and Chrome regression pass, including all 66 sessions across pages, all 22 matching patients beyond the first 20 suggestions, excluded and type-hidden patient rows, source precision and selected revisions, plus prior import/PDF/browser-data-recovery/backup/no-external-request checks. External picker/permissions remain simulated with real disk; actual managed Edge/network-share acceptance is separate.
- Local preview http://127.0.0.1:5186; hard-refresh ⌘⇧R. Source/static handoff generated by npm run export:hospital. Changes remain local; no GitHub push or Vercel deployment in this task.

Earlier checkpoints below are historical, including superseded fixed comparison/all-header filter rules.

---

# Current checkpoint · 11 November 2026 · version 0.5.1

Latest request: live patient-ID suggestions during every typing step, with selection before entering the full ID.

- The Patients page now uses one live search and native result buttons, replacing the separate dropdown. Exact matches rank first, then ID prefixes, then other ID/legacy-label matches. Leading zeros stay intact. Results include matching examination counts/latest known dates and respect the assessment-type filter.
- Shows up to 20 results in a scrollable list with an explicit total/narrowing message. Selecting opens patient history and fills the full ID. Typing clears the previous patient and reopens results. Arrow keys/Enter/Space/Escape are supported; stale events from removed inputs are ignored.
- Search uses the already opened folder-derived in-memory patient/assessment metadata; no new folder picker, source loading, archive writes or external data requests. Original archive format/clinical values/index projection remain unchanged.
- Browser regression covers actual character-by-character input, partial-ID mouse/keyboard selection, leading zeros, no matches, filter behavior, Escape/Backspace, focus and no archive writes, alongside the existing end-to-end workflow. Node suite remains 73 tests.
- Preview http://127.0.0.1:5186; refresh ⌘⇧R. Changes remain local unless subsequently published. A matching handoff is generated with npm run export:hospital.
- Remaining suggested workflow refinements: direct report access in the examination list and a compact post-import completion bar. The previously suggested single patient search is now implemented.

Earlier checkpoints below are historical.

---

# Current checkpoint · 11 November 2026 · version 0.5.0

Latest user requests: generate field-filter choices from all fields observed in the archive; suggest simpler overall workflows; refresh the design within the existing palette; compare only the first 50 letters/numbers in PDF names to accommodate repeated `.pdf.pdf` endings.

- Dynamic filter: union of all CSV headers across all accepted examinations and revisions (excluded, unknown/text/empty included). Search groups choices by source prefix, keeps the selected field visible, and offers removable filter chips. Filtering checks only the selected revision’s nonempty raw source cell, including zero. Fixed SUMMARY_MEASURES remains only for the detail summary/context, not filter eligibility.
- Projection 2: per-record shared header dictionaries plus per-revision layout index and presence positions. Runtime sourceFields references are non-enumerable. Invalid/old caches rebuild from source; physical indexes/v1 namespace and archive/parser schemas remain unchanged. Long/unknown raw values are not copied into this inventory.
- PDF key: strip repeated trailing .csv/.pdf suffixes; normalize NFC; keep Unicode letters/numbers; compare the first up to 50 case-sensitively. Require one nonempty target and preserve patient/stay ownership guards. Original filenames/bytes are retained; new provenance is filename-prefix-50. Earlier records keep their old matching method.
- Lighter white sidebar, solid red active task, local SVG icons, softer cards/buttons, completed import steps, hover/drag/focus feedback, small page transitions and reduced-motion support. Original palette values, logo structure and font family stay intact. No external assets/dependencies or clinical recalculation.
- 73 tests and browser regression pass; fixture field catalogue contains all 388 columns and a newly imported unknown field. A .pdf.pdf report works, expanded filters remain open, and field searches do not clear active selections. Existing actor/exclusion/recovery/backup checks pass.
- Local 7,800-examination benchmark: cold rebuild 3.51 s / 83 MiB; warm 1.4 s / 93 MiB retained heap, zero source-record bytes or originals hashed on warm opening. Synthetic local Mac data, not hospital share behavior.
- Suggested next workflow priorities: one patient search replacing search-plus-dropdown; report access directly from the examination list; a compact post-import completion bar with patient/stay and actions for next patient/open report. These are suggestions, not extra implemented workflow screens.
- Preview http://127.0.0.1:5186; hard-refresh ⌘⇧R. Changes remain local unless subsequently published. npm run export:hospital produces matching source/static handoff.

Older checkpoints below are historical and include superseded fixed-field/exact-name rules.

---

# Current checkpoint · 11 November 2026 · version 0.4.0

Latest user request: reflect the active library and selected folder; probe only a previously chosen folder without repicking; require import Bearbeiterkürzel; remove the examination patient dropdown; explain score-filter population; and add reversible examination exclusion with excluded-only search/reinclusion.

- Active library: status screen plus selected folder name and close action. Open/create/probe controls are hidden. Absolute drive/network paths are not exposed by the browser; the UI states this. Closing releases the writer lock; unsaved import files require explicit discard confirmation.
- New library: choose an empty folder, optionally probe that exact handle, then explicitly create. Probe retries never open a picker. Existing libraries open directly. Active-folder references remain in RAM only.
- Required import actor: visible in step 3, validated before building any writes, trimmed and passed to the durable commit. Empty actors in prior archive records remain supported.
- Reversible `assessment.exclusion.set` boolean operation, with legacy default included. No deletion or clinical changes. Default examination list excludes flagged entries; status filter supports excluded-only/all. Patient history marks excluded examinations and source-value comparisons omit them. Revision/duplicate imports do not reinstate them. Older app versions must fail read-only on this new operation; archive/projection schema remains 1.
- Measurement filter remains a fixed 11-field CSV catalogue, testing nonempty raw exports including zero. It makes no administration/completeness claim. Patient dropdown removed from examinations.
- 67 tests and browser regression pass, including backed-up exclusion/reinclusion, byte preservation, required actor persistence, selected-handle probe/retries and active-library switching. A delayed PDF-close event cannot clear a newly opened viewer.
- Preview: http://127.0.0.1:5186; hard refresh with ⌘⇧R. Changes are local unless git status/release history shows a subsequent publication. Source and static handoff: npm run export:hospital. Only synthetic development data was used.

The earlier checkpoints below are historical.

---

# Current checkpoint · 11 November 2026 · version 0.3.0

The user requested a single-patient import: shared iMed patient/stay IDs; existing-patient history/confirmation; no per-file review checkboxes or PDF reason fields; automatic PDF association by exact matching filename stem, with replacement when it does not match. These explicit instructions supersede the earlier manual-PDF-association starting recommendation.

- `planPatientImport`/`buildPatientImport` in `src/import.js` enforce the shared assignment, verify existing patient confirmation, recompute unique filename matches and block all saving on invalid files or unresolved conflicts. The app uses these helpers; the older builder remains for format compatibility tests.
- One patient is created only in the successful import commit. Previous sessions are shown with count and dates. Editing the ID clears confirmation. New examinations still require a staff-selected assessment type, chosen once for the import.
- PDF-only imports can extend a matching archived CSV for the entered patient and stay. Automatic links record `exact-filename-match`; original bytes and clinical values are unchanged. Identical PDF bytes can support distinct examination links.
- Normal step 2 is a single form without per-file cards. Exception controls appear for invalid files, mismatched PDFs and changed source versions. Each replacement is rechecked; IDs remain. A successful import clears the draft so the next patient must be entered afresh.
- All 62 tests and the updated browser regression cover this workflow plus existing recovery, reports, backup, filters and revisions. Native managed Edge/network-share validation remains separate. Only synthetic data was used locally.
- Local preview: `http://127.0.0.1:5186`, hard reload with `⌘⇧R`. Version 0.3.0. Source/static handoff can be generated with `npm run export:hospital`. Check git status for publication state; no GitHub/Vercel deployment is implied by local edits.

The older checkpoints below are historical.

---

# Current checkpoint · 11 November 2026 · version 0.2.1

The user reported that the hosted application runs on hospital infrastructure. Their next request was to simplify the entire workflow for staff. The full hospital acceptance procedure is still separate from this initial smoke test.

- Main navigation: Bibliothek öffnen → Importieren → Untersuchungen → Patienten. Sicherung & Hilfe is at the bottom and is usable before opening an archive.
- Minimal library page: open/create buttons and optional folder probe. Capability failures still show a concise route to recovery.
- Shorter import forms: iMed Patienten-ID, no optional patient-label field, no bulk assignment. Explicit per-file review and required type/PDF/revision decisions remain. New patients use an empty label; old labels are preserved.
- Shorter assessment/detail/history/backup pages; technical information, additional filters and patient comparisons are expandable. Open sections remain open during updates.
- Single-writer confirmation is shown once per library opening. Original files, clinical values, checksums, source versions and schema-1 archive format are unchanged.
- Version 0.2.1 is prepared locally with the Vercel build configuration. See git status for publication state; do not assume these changes have been deployed.
- Validation: all 50 Node tests and the updated browser regression pass. Both patient creation forms preserve zero-prefixed iMed IDs and store empty labels; library opening, footer help, unsupported-browser recovery, PDF access, corrections, individual batch assignments, backup and browser-data deletion/reopen were exercised. Screenshots are in ignored `test-results/`.

The earlier 0.2.0 checkpoint below is historical; its bulk-assignment UI was removed in 0.2.1.

---

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
