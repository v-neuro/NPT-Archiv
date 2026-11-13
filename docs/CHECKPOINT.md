# Current checkpoint · 13 November 2026 · version 0.13.0

User requested landing-page statistics with one/three/six/twelve-month or manual periods, selectable day/week/month intervals, several examination types in one graph and visible counts. The user explicitly confirmed included-only by default; excluded records are an opt-in. Additional chart ideas are suggestions, not part of this implementation.

- Added read-only statistics.js/statistics-view.js and explicitly allowlisted both in the static build. Home shows timeframe controls, exact dates, multi-type selection, scoped examination/patient counts, stacked timeline, type totals/shares, selected-period details and collapsible exact-count table. Day/week/month include zero intervals; weeks start Monday and show ISO week-year. Edge periods are clipped. More than 1,200 intervals asks for a wider interval/narrower range without truncating full-scope totals.
- One count per assessment by selected CSV revision date; extra revisions/PDFs do not add counts. Default excluded=false; opt-in adds excluded assessments. Missing/invalid dates are separately reported without invented dates. Legacy unassigned/unknown types remain explicit. Summary/global library cards retain their existing whole-library scope. RAM-only settings reset on library opening; no writes, schema/parser/projection changes, clinical interpretation or external assets.
- SVG uses corporate colors, numeric labels, keyboard period selection and chart-only horizontal scrolling. All counts are available in the table. Layout checked at 390/768/1440; synthetic monthly screenshot inspected. Charts work in viewing mode.
- Final npm test: 136/136 passing. npm run build and full Chrome regression pass, including independent per-type/per-month comparisons across 66 assessments/22 patients, every timeframe/interval, empty and multi-type choices, exclusion opt-in, zero periods, keyboard/table interaction and unchanged folder records. Existing PDF isolation, draft protection, browser-data deletion recovery, import, CSV and backup regressions pass. Evidence: ignored test-results/browser-summary.json and /private/tmp/npt-013-{unit,browser}.txt.
- Local preview: http://127.0.0.1:5186, version 0.13.0; hard-refresh after saving/discarding drafts. User explicitly authorized publishing the tested 0.13.0 version to v-neuro/NPT-Archiv main on 13 November 2026. Public main before this publication is 03c97535f3f8aee9f85705289aab9b2229241a6e / 0.12.1 (previous push and connected Vercel deployment verified). Source/static/synthetic test-kit handoff is local under ignored releases; latest path in releases/LATEST.txt. Actual managed Edge/network-share acceptance remains separate.

Earlier checkpoints below describe previous releases.

---

# Current checkpoint · 13 November 2026 · version 0.12.1

User requested an import action at the bottom of a selected patient's timeline and removal of the current-menu breadcrumb from the top bar.

- Neue Untersuchung für diesen Patienten importieren appears inside the selected timeline card after its visits, including empty/filtered histories. startPatientImport resets files/stay/type/clinical fields, prefills only the exact patient identifier, shows that patient above file selection and keeps the existing history/confirmation workflow. No patient or assessment is written until the usual verified commit.
- Shortcut uses the existing unsaved-input guard. In viewing mode it opens the normal sole-writer/initials modal first and proceeds only after successful edit activation; cancel stays on the patient page without initializing an import. Editing mode starts directly. Corrupt/read-only or unresolved-save states keep the action disabled. Mode activation accepts a one-shot completion callback, cleared on cancel/completion.
- Removed the breadcrumb markup and its now-unused names map. Library/mode/initials/refresh remain aligned to the right; headings and active sidebar still identify the page.
- 127 Node tests and full Chrome regression pass: selected/absent action, timeline position, pending-form cancel, read-to-edit cancel/continue, direct editing path, leading-zero ID preservation, empty visit metadata/files and real two-assessment import to the existing patient. Existing security/guard/recovery/CSV checks remain passing. No extra implementation-mirroring unit tests for this small UI change.
- Preview http://127.0.0.1:5186 serves 0.12.1; hard-refresh ⌘⇧R after handling pending drafts. User explicitly authorized publishing the complete tested 0.12.1 version to v-neuro/NPT-Archiv main on 13 November 2026. Public main was 5297398 / 0.9.0 before this publication. All preceding local 0.10–0.12 changes are included; generated archives, test outputs and handoff artifacts remain excluded from Git.

Earlier checkpoints below describe previous releases.

---

# Current checkpoint · 13 November 2026 · version 0.12.0

User authorized recommendations 1–3: protect unsaved edits; require/reuse operator initials per editing session; strengthen PDF isolation. Recommendations about CI/deployment controls and hospital IT changes were not part of this implementation.

- RAM-only DraftStore covers clinical/assignment/revision/new-patient and legacy loose-report forms; imports use their existing RAM draft. Re-renders retain changed controls and rebase clean/new fields against the current folder snapshot. Pending conditional dementia/hemisphere fields stay visible through type edits. Navigation/home/patient/assessment changes, refresh/check/close and ending editing offer native app modal Speichern/Verwerfen/Zurück. Save validates and commits all pending forms before proceeding; another form's draft survives individual saves. Discard clears explicitly, and beforeunload warns during drafts/saves. A real native reload warning/cancel is tested; forced termination/proceeding still loses RAM drafts. Invalid input is rejected before a filesystem attempt.
- Mode modal now requires Bearbeiterkürzel plus sole-writer checkbox. Initials display beside the mode button and read-only at import; every UI commit uses the trimmed session actor. They clear on release/reconnect/close. Legacy blank actors remain readable. This is manual traceability, not authentication. Recovery stores affected draft keys in RAM and clears them only when the attempted record is proven saved.
- PDF HTML uses sandbox=allow-scripts only, with an opaque origin and no parent/storage access. A private channel is created by that frame and accepted only for exact current WindowProxy/null-origin/token/one port/one initialization. Parent transfers a separate private PDF.js port and report bytes; only bounded status messages return. No folder handles, patient registry or action/permission API is sent.
- Parser is a fixed static pdf-worker.mjs created by the parent (opaque-frame Blob workers were unsuitable in native Chrome). Its response CSP denies all network connections, nested workers and same-origin imports. Strict in-memory fetch/sync-XHR serve only packaged fonts/CMaps/WASM. A single asserted build-time fallback-import replacement maps the two approved non-WASM decoders to local Blob modules. Dependency source files stay unchanged. Opaque renderer cannot create workers or load network resources; hash-authorized bootstrap/style and trusted Blob modules replace its same-origin scripting permission. No extra origin/backend/service/PWA/install.
- build-pdf.mjs creates pdf-runtime.js/pdf-worker.mjs and fills the viewer template. Build verifies inline bootstrap/style hashes against vercel.json and fails on an unexpected PDF.js worker layout. Hosting now splits app/viewer/worker CSPs; local serve.mjs applies those same headers. App framing prohibited; viewer framing allowed from app only. Closing/30-second watchdog terminates parser/ports; errors remain visible in the report header and originals stay untouched.
- 127 Node tests and full Chrome regression pass: draft rebasing, channel/resource validation, CSP/hash packaging; guard Save/Discard/Cancel/invalid input, native reload cancellation, atomic pending edits and lost-ack metadata recovery without replay; every UI mutation actor; native opaque parent/storage denial, real canvas rendering and restricted-worker network denial. All app/frame/worker requests observed, no unexpected external/content-bearing/CSP/runtime errors. Earlier workflows remain passing.
- Preview http://127.0.0.1:5186 serves 0.12.0; hard-refresh ⌘⇧R, but save/discard any pending drafts first. Development Chrome is disposable; preview server stays running. Source/static/test-kit artifacts are local/ignored. No push/deployment requested; GitHub main remains 5297398 / 0.9.0. Includes all earlier locally completed 0.10/0.11 features. Real managed Edge headers/policies, actual iPad PDFs and network-drive recovery still require hospital acceptance.

Earlier checkpoints below describe previous releases.

---

# Current checkpoint · 13 November 2026 · version 0.11.0

User requested removal of two exact helper sentences, free-text patient-ID reassignment, adding PDFs directly in the Originalberichte card, Für Export auswählen wording, five-second successful verification feedback and a new Neueste Änderungen menu with edit-date/examination-date/patient-ID filters.

- Removed the automatic IT-backup helper sentence and the numerical-results completeness sentence from the UI. Patient-history selection (and examination screen-reader selection label) now says Für Export auswählen.
- Zuordnung ändern uses a free numerical identifier input with at most 20 prefix-matching datalist suggestions and an existing/new/unassigned hint. buildAssignment validates ID/stay/type/reason, reuses exact IDs or creates a patient in the same transaction and emits only changed fields. Empty ID deliberately unlinks; no change writes no record. Reasons/history and leading zeros remain intact.
- Originalberichte includes a direct single PDF input in edit mode. buildAssessmentPdf validates extension/size/signature and the established up-to-50 Unicode letter/number filename key against any saved CSV revision. Mismatches remain visible in the card and allow replacement. Same bytes already linked to the assessment are skipped; new links use existing attachment.add/filename-prefix-50/session-level provenance and durable commit/recovery protocol. No new archive operation/schema/parser/index version.
- Successful settled re-verification feedback gets a five-second RAM deadline, removes only its banner and remains expired after rerenders/navigation. Save evidence stays intact; new checks reset the deadline. Callback checks feedback identity and archive health, so errors/uncertain/read-only warnings cannot be erased by a previous timer. Unsaved form text survives expiry.
- Neueste Änderungen appears after Patienten. history.js derives one row per accepted operation from folder history, newest chain order first, without rereading raw clinical source values. Filters combine inclusive local edit-day and exported examination-date ranges plus partial patient ID. Event context is historical, including imported versus selected source revisions; both historical/previous/current IDs find reassigned exams. Patient-only or undated events do not match an active date range. File/report/patient/assessment navigation, reasons, actor and 50-row pagination included. Unknown externally changed files are not claimed as application history.
- 121 Node tests and full Chrome regression pass. New tests cover 600-patient lookup, atomic reassignment, PDF validation/dedup/reopen, success-only deadlines, history events and source contexts, loose/later-linked reports, dates/IDs and folder replay. Chrome covers direct attachment correction, duplicate skip, site-data recovery, typed reassignment/restoration, real five-second expiry without draft loss, history filters/pagination and 390/768/1440 layouts. Existing privacy/CSP/import/CSV/recovery checks pass.
- Preview http://127.0.0.1:5186 serves 0.11.0 (hard-refresh ⌘⇧R). Changes remain local; GitHub main is still 5297398 / 0.9.0. The previous locally completed 0.10.0 clinical features are included. No publication requested this turn. Matching source/static/synthetic hospital test-kit artifacts and updated acceptance steps remain local/ignored.

Earlier checkpoints below describe previous releases.

---

# Current checkpoint · 13 November 2026 · version 0.10.0

User requested an optional clinical-details import screen after initial patient/stay/type information, later assessment editing, matching examination filters and free-text age ranges. User confirmed free-text diagnosis/dementia type, Gesichert/Verdacht status and Links/Rechts/Beidseits/Unklar hemisphere choices.

- Import now has four steps: Dateien auswählen → Patient & Aufenthalt → Klinische Angaben → Speichern. The optional annotations apply to newly created/separated examinations in the batch; existing revision/PDF-only imports explicitly preserve earlier values. Dementia type appears for memory-clinic; hemisphere for both epilepsy types. Status checkboxes are mutually exclusive and both may be unchecked. Unrelated hidden draft values are not committed for a new type.
- assessment.clinical.set is a separately validated append-only metadata operation, not source CSV data. Complete nullable diagnosis/status/dementia/hemisphere fields can be edited/cleared in individual assessment Bearbeitungs-Modus. Legacy examinations default to unrecorded; type corrections preserve previous annotations and expose recorded fields in the editor. Full history retains previous values. Parser/schema/projection stay unchanged; older applications fail closed on the unfamiliar operation.
- Untersuchungen → Weitere Filter includes diagnosis/dementia text, exact status/hemisphere and free-text age ranges (18–65, ≥65, <18, 70). All filters combine with AND and feed select-all-filtered. Age comes from selected-revision raw demographics_patient_age; missing/ambiguous ages do not match and invalid syntax has an inline hint. Home-count navigation/new library/import completion clear these filters.
- CSV exports add archive.diagnosis, archive.diagnosis_status, archive.dementia_type, archive.affected_hemisphere alongside unchanged original fields. Stable enum keys in exports, empty for null, existing spreadsheet escaping applies. New runtime module clinical.js is included explicitly in the build.
- 111 Node tests and full Chrome regression pass. New tests cover source immutability, invalid transaction preflight, old/default/clear history, revisions/PDF preservation, conditional imports, cold/warm/cache-deleted/full/backup recovery, metadata export and selected-revision age. Chrome covers step navigation, fields for all conditional types, checkbox exclusivity, edits/clearing, revision/site-data persistence and combined filters, plus prior security/workflow. Filter dropdown focus error caught and corrected before pass.
- Local preview http://127.0.0.1:5186 is running (hard-refresh ⌘⇧R). Current request does not ask to publish; GitHub main remains 5297398 / version 0.9.0. No real patient content used. Hospital acceptance documents include new step/edit/filter/export/recovery checks. Matching handoff artifacts remain local/ignored.

Earlier checkpoints below describe previous releases.

---

# Current checkpoint · 13 November 2026 · version 0.9.0

User requested default/first Alle Messwerte comparison, removal of the unselected-patient card and three exact library/CSV helper texts, and using supplied favicon-red.png as sidebar logo/favicon/desktop shortcut icon. The final branding adjustment centres the logo above the exact tagline NPT-Archiv. User explicitly authorized publishing the complete current version to GitHub main on 13 November 2026.

- Empty comparisonKey represents all; grouped matrix has one field per row, one included/type-matching visit per column, original raw values/zero/missing dashes and expandable source hints. Search narrows all-mode rows; single-field choice remains. Existing verified source loading, numeric eligibility/exclusion and durable data are unchanged.
- Removed Wessen Verlauf… card and the exact requested folder-path/two CSV-scope explanatory paragraphs. Export behavior remains whole-patient/all-excluded versus explicitly selected sessions as before.
- Exact original image in src/icons/brand.png replaces sidebar n/wordmark; home click/accessible name retained. Square aspect-preserving PNGs, multi-resolution favicon.ico, Apple touch icon and site.webmanifest bundle local metadata. Browser display/no service worker, no install/offline requirement. create-icons.mjs is Mac development-only; normal build uses checked-in files. Both CSPs permit same-origin manifest; preview MIME types updated. Build and source handoff explicitly include the new assets.
- 101 Node tests and Chrome regression pass: image dimensions/ICO payloads/local manifest, native favicon/PNG decoding and Page.getAppManifest, all/single/search matrix values compared with real synthetic sources across three visits, copy removals, existing full workflow/security. Native Windows desktop shortcut/cache behavior remains manual hospital acceptance.
- Local preview http://127.0.0.1:5186 restarted with current MIME handling; hard-refresh ⌘⇧R. Publication target: v-neuro/NPT-Archiv main, with its connected Vercel deployment. Public main was 0.7.1 before this publication. Includes locally completed 0.8.0 details/0.8.1 mode dialog. Source/static/test-kit handoff via npm run export:hospital.

Earlier checkpoints below describe previous releases.

---

# Current checkpoint · 13 November 2026 · version 0.8.1

User requested replacing the confusing edit-mode card with a colored top-bar toggle beside the library name, labelled Ansichts-Modus / Bearbeitungs-Modus, plus an unchecked sole-editor confirmation popup before Fortfahren.

- Removed the card. Top-bar button is turquoise/eye when viewing, corporate red/white/pencil when editing, with explicit labels and adjacent accessible refresh icon. No mode controls without a library; unresolved integrity/save recovery keeps editing disabled.
- Native modal outside the rerendered app DOM starts unchecked, uses the user's exact statement and disables Fortfahren until checked. The handler also checks the condition. Opening/checking does not acquire the writer lock; continuing requests permission/lock, refreshes, then sets singleWriter. Cancel/Escape keeps viewing; failure stays in the popup. Controls/Escape cannot abandon an in-flight acquisition. Returning to view releases the lock and preserves existing explicit discard confirmation for pending import drafts.
- Browser regression covers top-bar placement/no card, labels/colors, checkbox required/uncheck/cancel/Escape/reset, denied permission, lock conflict/handover, unsaved-draft cancellation and compact/responsive dialog. Existing full workflow and 99 Node tests remain the release checks.
- Includes prior locally prepared 0.8.0 complete assessment sections. Preview http://127.0.0.1:5186; hard-refresh ⌘⇧R. Current request is a local UI change; public GitHub/Vercel was 0.7.1 at the beginning of this work. No publication requested in this turn.

Earlier checkpoints below describe previous releases.

---

# Current checkpoint · 13 November 2026 · version 0.8.0

User requested complete imported assessment values, including demographics and test versions alongside numeric results, in collapsible views. The prior primary detail summary used 11 fixed measures; all raw fields were already retained in a lower technical section.

- Main detail now uses imported-fields.js to show every observed selected-revision header once: Demografische Angaben, Angaben zur Untersuchung, named test groups and Weitere importierte Felder. Versions/scoring/entry modes lead the relevant test group, with all numerical/non-numerical results, flags and notes retained. Friendly labels plus exact keys, population counts and source-version previews. No clinical inference/recalculation, original writes or schema/parser/projection change. Missing and quoted-empty remain distinct; original technical cell-status view still exists below.
- Removed the pre-existing local `Ja ` prefix before the first JavaScript import because it made app.js syntactically invalid. That was the only existing working-tree change when this task began.
- 99 Node tests cover full-field grouping/immutability/blank assessments/unknown values/precision/statuses in addition to prior storage/import/export/recovery tests. Browser regression compares all 388 original and revised source cells against the new view and checks versions, collapsible demographics/test groups, state preservation and safe unknown text.
- Local preview http://127.0.0.1:5186; hard-refresh ⌘⇧R. This task prepares the new detail view locally; GitHub/Vercel publication is not part of the current request. Existing public main was 0.7.1 when work began. Synthetic source/static/test-kit handoff remains available via npm run export:hospital.

Earlier checkpoints below describe previous releases.

---

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
