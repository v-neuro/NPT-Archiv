# Development validation · updated 13 November 2026

Only synthetic data was used. The producer app and handoff reference are unchanged. The source has been published to GitHub; the user reported that their hosted app runs on hospital infrastructure. This report does not establish full network-drive or restore acceptance. Current scope is a functional pilot with a static release and source.

## Automated checks

`npm test`: 136 passing tests, including parser/import/durability and File System Access adapters. Coverage includes the actual 388-column producer fixture, quoted Unicode/newlines/quotes, BOM/CRLF, numeric zero/negative/decimals, empty versus missing cells, reduced/reordered/future columns, dangerous/duplicate headers, malformed rows, legacy/missing source IDs, invalid dates, oversize input, duplicate/revised/equivalent files, explicit collisions, ambiguous/late PDFs and durable unlinked attachments.

Version 0.13.0: nine statistics tests cover rolling calendar ranges, leap/clamped dates, inclusive edges, Monday/ISO-week year boundaries, zero intervals, selected-source dates, exclusion/type selection, distinct patient counts, missing/invalid dates, legacy/unknown types, immutable state, bounded chart size and full/compact disk reconstruction. The full Chrome regression independently compares every monthly/type table cell against selected synthetic CSV sources (22 patients, 66 examinations), checks day/week/month and all presets/manual validation, multi-type/empty selection, excluded opt-in, period keyboard navigation, responsive layout and unchanged folder records. Statistics require no writer session. Both unit and full browser runs passed after the final UI changes.

Failure injection exercises original and commit creation/partial writes/close/readback, corrupt/missing originals, incomplete/unknown/forked records, unknown manifest version, initialization over unrelated contents, stale writers and disconnected storage. Earlier accepted state survives. Assignment corrections, numeric stay/patient IDs, selected revisions, exact original bytes and verified copy/restore are reconstructed from disk without browser state. File-handle adapter tests separately cover permission denial/revocation and createWritable/write/close/readback failures.

`npm run build`: allowlisted static build; all runtime files and PDF.js 6.5.438 assets bundled. No fixture or patient folder is included. The application has no runtime framework dependencies or content service. npm installation with optional native modules omitted reported zero known dependency vulnerabilities; this is a development observation, not a production security certification.

`npm run test:browser`: Chrome 156.0.8078.80 on the development Mac, isolated disposable context. Real browser File inputs drive the actual UI. External picker and permission decisions are **simulated**, and handle operations are bridged to real temporary disk folders. Native browser createWritable/write/close/readback is checked separately against OPFS. This distinction is essential: OPFS is not the archive's storage and is never used by the application.

Browser assertions:

- Capability probe, cancelled selection and denied permission do not initialize a folder.
- Version 0.1.2: native OPFS handles exercise the complete FolderStorage probe, including fresh reopening. Injected `NotFoundError` is kept on screen with the failing operation; retry clears the error. The user also confirmed that the revised probe works in their selected new local folder; actual hospital network-share acceptance remains separate.
- Probe → menu “Dateien importieren” → explicit creation in the retained folder → import requires no second picker. Repeated menu changes preserve the active archive. Inspection distinguishes empty, valid, unrelated and malformed archives without overwriting contents. The first version's confusing separation between probing and activation was corrected.
- The manual's exact base colors are checked, and active/inactive sidebar labels plus wordmark pass computed text contrast checks (at least 4.5:1). The first color update's CSS-variable substitution error was corrected; whitespace declarations are also preserved.
- Synthetic CSV/PDF batch explicitly assigned to patient `00012345` and stay `0006789`, then committed and read back.
- Same-profile second tab is read-only through real Web Locks.
- Bundled canvas viewer renders a synthetic PDF with a JavaScript open action and external-link annotation without making an external request.
- Repeated report opening uses a per-view readiness token. Glyphs come from bundled/embedded font data; PDF.js print rendering avoids animation-frame stalls in occluded frames. No CSP errors are observed, including local font loading. Viewer load/render failure has a bounded timeout and preserves the original.
- All browser site data cleared through the browser protocol; a fresh instance reselects the disk folder and recovers patient/stay IDs, selected revision and working PDF link. No patient localStorage/sessionStorage/IndexedDB remains.
- Duplicate import, changed-export selection, durable stay correction, history and patient source-value comparison and durable assessment-type correction/filtering.
- Verified copy to a different empty folder; reopened copy retains later revision selection and stay correction.
- Search and page layout at 390, 768 and 1440 pixels; synthetic screenshot inspected.
- Unknown imported HTML-looking note is displayed as literal text with no image element or external request.
- Observed requests are GETs for local application assets only; no external or content-bearing request and no uncaught application exception.

## Volume observations

`ARCHIVE_VOLUME_COUNT=7800 ARCHIVE_VOLUME_BASELINE=1 npm run test:volume` generated 7,800 actual-format synthetic CSVs and tiny synthetic PDFs on local Mac storage, with 520 weekly-size records and about 437.5 MB of source data. Node was run with `--expose-gc`; heap below is retained heap after collection, making the full-source/indexed comparison consistent in this run.

| Path | Open time | Retained Node heap | Original files hashed on open |
| --- | --- | --- | --- |
| Full source and original verification | 4.43 s | 632 MiB | 15,600 |
| Cold compact rebuild from source records | 3.48 s | 72 MiB | 0 |
| Warm persisted compact index | 1.27 s | 85 MiB | 0 |

Warm opening read zero source-record bytes and used 520 folder-index hits. The cold path checks source record checksums and projects raw documents without retaining them all. Neither quick path represents a full original-file integrity check. Detail/original access verifies the requested data; full verification and backup independently hash every reference. The index's size/mtime cache boundary is explicitly tested, including a same-size/same-time record edit detected on detail/full check.

These figures use tiny PDF fixtures and local disk, not realistic hospital report sizes or network performance. They establish record recovery at these counts, not a latency guarantee. All data remains retained. A 50-row examination table and bounded source-record cache limit ordinary rendering/detail work; metadata still grows with the library.

## Version 0.2.0 checks

- All seven user-provided assessment types require explicit import selection; unsupported/missing choices are rejected. Durable type corrections and filtering legacy null types are covered.
- Warm index, corrupt/deleted cache fallback, lazy exact raw fields, original corruption on access/full scan, stale writers and failed cache writes are tested. An index failure cannot undo or become the only copy of a saved patient/type/link event.
- The three import steps block saving when type/assignment/confirmation is missing. The earlier multi-patient browser exercise verified all seven examination filters, patient filtering, unknown legacy types and verified on-demand comparison values. Version 0.3.0 replaces per-file assignments with one shared patient/stay form.
- The generated practice library has 80 fictional patients, 240 assessments, 264 source revisions and 457 unique original objects. Automated cohort checks cover repeat visits/stays, all types, unknown fields, revised/duplicate CSVs, missing/late reports and malformed input.
- `npm run export:hospital` runs checks/build and exports matching static/source ZIPs with checksums and version/test metadata. Patient archive folders, browser profiles, generated demo libraries, node_modules and private manual PDFs are excluded. ZIP integrity/inventory is checked separately.
- Development/refinement stays on the private Mac. Hospital trials and environment-specific troubleshooting happen later, as access permits.

## Unverified / acceptance pending

Native external directory picker, permission prompts/revocation in managed Edge on Windows 10; actual network filesystem behavior, disconnection, OS/network-server power loss; exact PDFs printed by the deployed producer; realistic multi-year PDF sizes; host HTTP headers/update controls and origin policy; IT automated backup restore. These require [hospital acceptance](ACCEPTANCE.md). No claim of offline availability, simultaneous cross-PC writers, unlimited capacity, authenticated/tamper-proof audit, application encryption, certification or clinical score interpretation is made.

Structured iPad-backup import is deliberately deferred. Optional transfer was not confirmed. Unsupported backup input is rejected; existing CSV/PDF workflows are complete for this pilot. The ordered checksum/drawing validation contract remains documented in the unchanged handoff for future implementation.

## Version 0.2.1 usability checks

- Main navigation order is library, import, assessments, patients; backup/help is outside the main navigation at the bottom. Help remains visible on small screens and works without an open library.
- The initial library page contains only the two library actions and the folder-probe heading/button. Unsupported browsers show a concise failure message and a working route to help. Probe failures retain step-specific diagnostics.
- No bulk-assignment or optional patient-label input is present. New patients store an empty label rather than the literal string `null`; existing labels remain readable. The iMed ID stays a digit-only string with leading zeros intact.
- Single-writer confirmation appears once after opening; mandatory per-file review, type selection, revision reasons, PDF association reasons and metadata correction history remain.
- Patient comparisons and extra filters are expandable. Open sections stay open when a control changes or a long-running action rerenders the page. Clinical source values and storage format are unchanged.
- Browser regression also covers the existing full import/revision/PDF/site-data-deletion/backup/filtering workflow, plus individual assignment of two new CSVs.

## Version 0.3.0 single-patient import

The user explicitly changed the PDF association rule from manual evidence to automatic matching of the complete filename stem, excluding only `.csv`/`.pdf`. This is a workflow/provenance change, not clinical score interpretation. Original exports, source versions, raw values and archive schema stay unchanged.

Twelve additional integration tests cover shared patient/stay/type across examinations; one new patient per commit; existing patient count/date lookup and required confirmation; confirmation for a different ID; strict digit strings/leading zeroes; unmatched or ambiguous PDFs; replacement and ignoring forged manual targets; PDF-only addition to an archived CSV for the right patient/stay; duplicate CSV ownership; duplicate relationship versus byte deduplication; invalid-file batch blocking; source revisions/separation; required types and repeated-session conflicts; and durable patient/automatic-PDF links after disk-only reopening. Existing low-level reviewed-import tests retain coverage of old archive workflows.

The browser regression uses actual File inputs to import a mismatched PDF, replace it with another mismatch, then supply the matching filename. IDs survive replacement. Normal step 2 has no per-file assignment list, review checkboxes or PDF reason field. It checks the existing-patient history count/date, confirmation, invalidation after editing the ID, a shared assignment for two CSVs, fresh blank IDs after successful import, type filters, source revision selection, PDF rendering, browser-data clearing and recovery, backup/restore and no external/content-bearing requests.

The new method is stored as `exact-filename-match` with an automatic-match explanation. It does not claim staff manually reviewed the PDF. Identical bytes for two assessments receive two independent links to one immutable object. A known PDF hash cannot bypass an unmatched filename. Changed CSVs still require an explicit revision decision and reason. New imports cannot create unresolved patients/unlinked reports; existing unlinked originals remain supported.

## Version 0.4.0 lifecycle, operator and exclusion checks

- Five additional tests cover legacy included defaults, explicit boolean validation and reversible status changes; warm index/full replay/index-deletion/backup/restore preservation; duplicate/revision imports retaining exclusion; fixed-catalogue measure presence including zero; and required operator validation/persistence without rejecting old empty-actor records. Original CSV/PDF bytes and raw clinical values are compared across exclusion/restoration.
- Browser checks cover selecting an empty folder before any optional probe, all probe/retry calls leaving the picker count unchanged, explicit creation, an active-library screen without open/create/probe controls, closing before switching libraries and preservation of the active folder across menus.
- Required Bearbeiterkürzel is visible in step 3, blank and whitespace-only values block save, and every imported revision record in the disk-backed exercise has actor TEST.
- No patient-ID dropdown remains under examination filters. The fixed catalogue contains 11 options plus “Alle Untersuchungen”; PHQ-9 zero remains present. Exclusion hides the assessment from the routine list, excluded-only finds it, history shows a badge and patient comparisons omit its rows. A verified backup retains the status, patient/stay, report and chosen revision; including it again restores routine-list visibility.
- A queued close-event race observed during repeated PDF viewing was fixed: close clears the old viewer immediately, and a delayed close event cannot clear a newly opened report. Repeated report viewing and browser-data deletion/recovery pass.
- The browser exposes the selected folder name and relative paths, not its full OS/network path. The active-library screen explains this restriction rather than inventing a drive path. The native managed Edge and hospital share acceptance procedure still applies.

## Version 0.5.0 dynamic fields, filename prefixes and visual refinement

- Four additional field-inventory tests cover all observed columns (unknown/text/empty included), cached presence without long raw notes, all historical versions/excluded records versus selected-version filtering, shared dictionaries, old/malformed cache fallback and index deletion. Two filename-prefix tests cover first-50 matching, separators, Unicode normalization, repeated `.pdf.pdf` suffixes, unchanged original names and ambiguous prefixes, including archived PDF-only candidates.
- Browser checks compare options against all 388 actually imported fixture columns, then import a future_notes column and verify it appears dynamically. Searching the options preserves the selected field, field chips clear it, and the expanded field panel stays open. The real File input exercise now imports a `.pdf.pdf` report.
- The light sidebar/red active navigation and local SVG icons pass computed text contrast checks. Responsive layout, reduced-motion disabling of the busy animation, existing import/actor/PDF/exclusion/recovery/backup workflows and absence of external/content-bearing requests pass.
- Projection 2 volume check with 7,800 examinations / 520 records: cold 3.51 s and 83 MiB, warm 1.4 s and 93 MiB retained Node heap. Warm opening reads no source-record bytes and hashes no originals. Local synthetic data/tiny PDFs; no hospital performance guarantee. `test-results/volume-indexed-7800.json` records this current run; earlier measurements above are historical.

## Version 0.5.1 live patient search

The browser regression types a partial zero-prefixed ID one character at a time through real Input.insertText events and verifies results, focus retention and no implicit patient selection at each step. It selects a result with ArrowDown/Enter without typing the full ID, checks the full zero-prefixed ID and patient history, Escape/Backspace behavior, mouse selection, no-match messaging and examination-type filtering. Search does not write archive records or load full clinical sources. The old separate patient dropdown is absent. Existing import/PDF/exclusion/recovery tests use the new selection flow.

Results use native buttons, a bounded scrollable list (20 matches with an explicit narrowing message), an announced result count and explicit selection. Exact ID matches rank first, then starting-digit matches, then other ID/legacy-label matches. Editing the query clears the prior selection; stale events from replaced inputs cannot reset a newly selected patient.

## Version 0.6.0 numeric selectors and local CSV export

- Numeric performance selectors replace the fixed comparison subset and supersede the all-header 0.5.0 filter UI. Tests cover raw signed/zero/comma/exponent/high-precision values; notes/IDs/demographics/flags excluded even if numeric; selected revision/scope changes; projection-3 warm rebuild and malformed numeric inventories; unknown raw values remaining outside compact caches; and exported mode/variant/completion context. The archive's raw/normalized source data is unchanged.
- CSV tests cover exact session versus whole-patient selection, all original fields including notes/unknowns, selected revisions, excluded flags, all patient types, provenance and actor, original precision, multiline/quotes/Unicode, absent/missing/quoted-empty distinctions, leading-zero IDs, documented formula protection and unmodified archive files. Future headers matching JavaScript inherited-property names cannot create fabricated values in rows where absent.
- Failure tests reject empty/unknown selections, patients without examinations, recovery snapshots, stale heads before/during generation, warm-cache source checksum corruption preserving size/mtime and damaged original CSVs. Read-only source access can export valid data. There is no partial download on failure.
- Chrome regression exercises actual selection controls and captures generated local Blob CSV bytes in the synthetic test harness. Select-all covers 66 examinations across two pages and 22 patients beyond the first 20 suggestions. Individual checkboxes, partial selection, hidden-selection count, selection clearing when switching libraries, patient exports including other type-filtered visits and excluded records, all source columns and selected revision provenance pass. Dynamic comparison choices include raw/subscale fields omitted by the prior fixed list and exclude notes/admin. Source options can be searched without clearing the selection. Existing import/PDF/site-data-deletion/backup/exclusion/responsive/security checks still pass. The Blob interception is test-only; runtime uses the normal browser download flow.
- Projection 3 / 7,800-examination volume run: cold rebuild 3.84 s / 86 MiB; warm open 1.49 s / 95 MiB retained Node heap, 520 index hits and zero source-record bytes/original hashes. Synthetic local disk/tiny PDFs; no hospital share guarantee. Source/static handoff is versioned 0.6.0.

## Version 0.7.0 workflow and trial preparation

- Both full-source and compact save paths track runtime-only attempted record ID/checksum/write phase. Tests distinguish pre-record failure, absent record after uncertain initiation, completed record with lost close acknowledgement, later descendant, truncated record, corrupt original, archive substitution, unavailable folder and rolled-back parent. Recheck is read-only and never replays a write. Receipt tests count skipped duplicates, new examinations and source revisions without counting patient creation as another examination.
- Display-label tests cover every eligible field in the handed-over 388-header catalogue, preserve exact keys, keep unknown fields unlabelled rather than inventing meanings, group fields by test and sort item numbers naturally. Eligibility/parser normalization/index projection are unchanged.
- Hospital-kit tests generate a fresh 7-patient/21-examination synthetic library, verify full file hashes and injected application/version hashes, exercise matching CSV/PDF names in the staged import exercises, and check the printable pages have no script/forms/external URLs. They do not simulate actual hospital approval.
- Chrome regression verifies default readers have no writer confirmation, requesting editing in a second tab is blocked while the first holds the lock, ending editing permits takeover without closing/reopening, and new readers can still browse. Lightweight refresh sees an externally added synthetic report without taking the writer lock. A multiple-report chooser and list direct report button render verified local PDFs with patient/stay context.
- Browser import completion contains exact IDs/counts/types and next-patient clears previous files. Multi-session receipts and CSV-only “Kein PDF” are exercised. Groups/readable labels are present in dynamic selectors; source keys remain searchable. Existing import/revision/exclusion/PDF/browser-data deletion/CSV/backup/responsive/no-external-request checks pass.
- Browser failure injection denies write permission before save, verifies persistent not-saved feedback across navigation, rechecks the same folder without a picker, then loses acknowledgement after actual record close. The UI blocks retry and confirms that exact saved record after reconnect; record count stays one and the receipt reappears. Managed Windows/SMB failures, realistic producer PDFs and automatic IT backup restoration still require the frozen manual test kit.

## Version 0.7.1 home screen

Browser regression verifies the home screen on launch, no-library navigation, zero-count active library, logo navigation, total counts including patients without examinations and excluded records, no double-counting source revisions, count-card navigation clearing prior filters, browser-data clearing returning to an empty home, and layout at 390/768/1440 pixels. A 22-patient/66-examination synthetic library matches the home totals. The 95 Node tests and prior import/recovery/report/CSV/backup/security workflow remain the release checks. User explicitly requested publishing the complete current version to v-neuro/NPT-Archiv main after verification.

## Version 0.8.0 complete assessment details

Four additional tests verify every one of the producer fixture's 388 headers appears once in the primary groups, including demographics, versions, flags and notes; version-before-result ordering; blank/default-only assessments without inferred administration; unknown/free-text values, inherited-property-like headers, precise numeric strings and missing/quoted-empty distinctions; and readable labels that keep manual/total/version fields separate. Grouping cannot mutate raw documents.

The browser regression compares every main-view field/cell with the actual synthetic original and revised CSVs, opens demographics/VLMT sections, checks visible version context, preserved open sections after metadata save, and literal HTML-like future notes alongside a zero-valued future measure. Existing patient comparison/filter eligibility remains numeric-only; complete assessment viewing is deliberately independent of it. The original local file had a stray `Ja ` before its first import, which prevented parsing; the prefix was removed while editing the detail view.

## Version 0.8.1 mode toggle and confirmation

Browser regression verifies the mode button is in the top bar, the former information card is absent, state labels/colors differ, and the popup starts unchecked with Fortfahren disabled. Checking alone cannot enable imports; unchecking disables continuation again. Cancel, Escape and repeated opening reset the confirmation and keep viewing. Denied permission is visible inside the popup. A second tab cannot switch to editing while the writer lock is held, then succeeds after the first returns to viewing. Cancelling unsaved-draft discard keeps editing and the draft intact. Popup and top-bar layout are checked at 390/768/1440 pixels. Existing complete assessment/import/export/report/recovery/backup/security tests remain included; Node suite remains 99 tests.

## Version 0.9.0 all-measure comparison and supplied icon

Two icon tests validate original artwork dimensions, every generated square PNG size, ICO directory offsets/sizes/bit depth and exact embedded PNG payloads, and local browser-mode manifest/icon metadata. Source artwork was compared byte-for-byte with the user attachment. Icons are generated on the development Mac; tests/builds consume the checked-in files without sips or other native generation requirements.

Chrome native Page.getAppManifest accepts the local manifest without errors; native image decoding accepts favicon.ico, the 16/32/180 PNGs and the declared 192/512 shortcut icons. The supplied sidebar image loads at its original natural dimensions and remains the home button. Requested copy/placeholder removals are asserted on real pages.

All-measure comparison is the first/default option and its rendered row set equals the numeric options. The browser compares each raw matrix cell against verified synthetic source documents, for the type-filtered visit and for all three patient visits, including zero/missing data and selected revisions. Search reduces the all-mode row set; single-measure mode retains one row. Matrix/page layout is checked at 390/768/1440 pixels. Existing export/PDF/recovery/backup/permissions/no-external-request regression passes. Real managed Windows Edge desktop shortcut creation and its shell icon cache still need the hospital trial; Chrome metadata/decoding is not that test.

## Version 0.10.0 optional clinical details and age ranges

111 Node tests pass, including 10 new clinical tests covering legacy all-null defaults, strict annotation validation, reversible edits/history, conditional fields, revisions/PDF-only preservation, source immutability, preflight rejection, cold/warm compact and full replay, deleted/rebuilt indexes, verified backup restoration, CSV metadata/formula escaping and selected-revision age filtering. Age cases cover zero, missing/ambiguous source text, inclusive/exclusive/comma-decimal ranges and invalid syntax.

The Chrome regression passes with real synthetic temporary disk folders and a simulated external folder picker. It exercises the optional import screen, both epilepsy types and Memory Clinic field visibility, mutually exclusive/unselected diagnosis checkboxes, editing and clearing clinical details, preservation across revised CSVs and browser-site-data deletion, and combined diagnosis/status/dementia/hemisphere/age filters. The invalid-age hint and filter-chip clearing are checked. Existing full import/recovery, selected-source values, CSV, PDF, modes/locks, backup, responsive layout, CSP and zero external/content-bearing request checks pass. A dropdown focus-restoration error found by this regression was fixed before the passing run.

Native Windows Edge permissions, actual network-share durability and hospital IT restoration remain the existing manual acceptance boundary.

## Version 0.11.0 assessment workflows and recent changes

121 Node tests pass. Ten additional tests cover typed exact-ID reassignment among 600 synthetic patients; leading zeros, new patient creation and explicit unlinking; no-change/invalid submissions; direct PDF signature/size/name-prefix checks and duplicate no-ops; disk-only patient/PDF recovery; settled-success-only feedback deadlines; complete read-only operation history, old/current patient search, event-revision dates, inclusive date ranges, invalid/undated events, loose-report/later-link history and warm/full/index-deleted replay.

The full disposable Chrome regression passes with synthetic temporary disk storage and simulated external picker/permission decisions. It checks the five-item sidebar, requested copy removals, free-text ID input and suggestions, existing-patient reassignment/restoration, direct PDF mismatch/replacement/addition/duplicate prevention, and saved PDF links after clearing browser site data. Successful re-verification disappears after a real five-second wait, stays hidden after navigation and leaves unsaved assignment text untouched. Recent-change edit-date/examination-date/ID filters, invalid ranges, empty/reset/navigation behavior, 50-event pagination and responsive layouts are exercised. Existing import, clinical details, revision, CSV, comparison, backup, recovery, permission/lock and no-external/content-bearing-request checks remain passing. Native managed Edge/network-share acceptance remains manual.

## Version 0.12.0 edit protection, session initials and PDF boundaries

127 Node tests pass. Six new safety tests cover RAM-only draft isolation/reverting/clearing, rebasing clean/new controls against fresh folder values while retaining local edits, strict frame/token/port initialization, bounded status-only protocol, exact bundled binary resources with denied network/traversal/unknown modules, and matching viewer/host CSP hashes plus the reviewed worker transformation. Build packages all runtime assets locally and fails when the bootstrap/style policy or pinned worker structure differs.

The disposable Chrome regression passes against the development server using the same path-specific CSP headers as the supplied host configuration. It requires initials plus the sole-writer checkbox, checks cancel/permission/lock behavior, read-only import actor reuse and the session actor on every UI mutation. Guard coverage includes invalid input without filesystem attempts, Cancel, atomic Save of two forms, preserving another form's draft, Discard, library refresh, native beforeunload and an actual canceled Page.reload browser warning. An injected lost close acknowledgement during guarded metadata Save retains the draft, resolves the exact saved record on full recheck and does not replay it. All earlier synthetic import/clinical/history/CSV/backup/recovery checks remain passing.

The test observes the main app, opaque renderer and dedicated parser-worker targets. Native CDP inspection proves the frame origin is null, parent DOM/localStorage access fails and the canvas really renders. The parser worker has no document or folder picker and rejects an attempted external fetch. Its actual response policy has connect-src none and no same-origin script imports. Synthetic PDF link/JavaScript actions cause no external requests. All frame/worker/app requests stay among static application assets or local Blob/data resources; no content-bearing requests or unexpected CSP/runtime errors. Repeated reports and reopening after site-data deletion work. Screenshots include the guard, isolated report and existing responsive workflows.

These results use a simulated external picker/permission bridge with real temporary disk folders. They do not establish managed Edge policies or actual SMB power-loss behavior. After deploying the complete matching static build/configuration, recheck production response headers and real synthetic iPad PDFs on the hospital's Edge/network share.

## Version 0.12.1 patient-history import shortcut and top bar

127 Node tests and the full Chrome regression pass. The new browser cases verify that the import action is below the selected timeline, absent before patient selection, protected by the pending-input guard and available through the existing view-to-edit confirmation. Cancel leaves the patient page untouched; success opens file selection with the exact selected ID, including leading zeros. Repeating from editing mode needs no second mode prompt. Stay/type/files start empty, existing-patient history and confirmation remain, and an end-to-end two-assessment import reuses the existing patient. The top bar contains no breadcrumb; library/mode controls and responsive layouts remain. No archive/source/export-format changes.
