# Development validation · 10 November 2026

Only synthetic data was used. The producer app and handoff reference are unchanged. No site has been published. Current scope is a functional pilot with a static release and source.

## Automated checks

`npm test`: 50 passing parser/import/durability and File System Access adapter tests. Coverage includes the actual 388-column producer fixture, quoted Unicode/newlines/quotes, BOM/CRLF, numeric zero/negative/decimals, empty versus missing cells, reduced/reordered/future columns, dangerous/duplicate headers, malformed rows, legacy/missing source IDs, invalid dates, oversize input, duplicate/revised/equivalent files, explicit collisions, ambiguous/late PDFs and durable unlinked attachments.

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
- The three import steps block saving when type/assignment/confirmation is missing. A multi-patient browser exercise verifies all seven examination filters, patient filtering, unknown legacy types, verified on-demand comparison values and deliberate bulk assignment.
- The generated practice library has 80 fictional patients, 240 assessments, 264 source revisions and 457 unique original objects. Automated cohort checks cover repeat visits/stays, all types, unknown fields, revised/duplicate CSVs, missing/late reports and malformed input.
- `npm run export:hospital` runs checks/build and exports matching static/source ZIPs with checksums and version/test metadata. Patient archive folders, browser profiles, generated demo libraries, node_modules and private manual PDFs are excluded. ZIP integrity/inventory is checked separately.
- Development/refinement stays on the private Mac. Hospital trials and environment-specific troubleshooting happen later, as access permits.

## Unverified / acceptance pending

Native external directory picker, permission prompts/revocation in managed Edge on Windows 10; actual network filesystem behavior, disconnection, OS/network-server power loss; exact PDFs printed by the deployed producer; realistic multi-year PDF sizes; host HTTP headers/update controls and origin policy; IT automated backup restore. These require [hospital acceptance](ACCEPTANCE.md). No claim of offline availability, simultaneous cross-PC writers, unlimited capacity, authenticated/tamper-proof audit, application encryption, certification or clinical score interpretation is made.

Structured iPad-backup import is deliberately deferred. Optional transfer was not confirmed. Unsupported backup input is rejected; existing CSV/PDF workflows are complete for this pilot. The ordered checksum/drawing validation contract remains documented in the unchanged handoff for future implementation.
