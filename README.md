# Digitale NPT Archiv · 0.2.0 synthetic pilot

A new project, separate from the iPad assessment app. The handoff snapshot remains unchanged. A static, German-first browser app stores original CSV/PDF exports, patient/stay assignments, revisions and history in a hospital-selected folder. **No patient-data backend, browser database, telemetry, installation or extension.**

For the guided Mac workflow, start with [QUICKSTART](docs/QUICKSTART.md). The latest saved continuation notes are in [CHECKPOINT](docs/CHECKPOINT.md).

## Current result

- Capability gate, explicit folder selection, permission checks, synthetic write/close/read/reopen probe and recovery instructions.
- The probe uses a visible synthetic text file and keeps any failing operation on screen. After success the selected folder is retained in memory: activate its existing archive, or explicitly create a new archive there once, then navigate directly to import without another picker.
- Guided three-step import: choose files, assign/review, then save a readable summary. New CSV imports require one of the seven staff-selected assessment types; both examination lists and patient histories filter by type. Existing unclassified records remain explicitly unassigned.
- Compact, rebuildable folder indexes and on-demand source details reduce routine opening memory/I/O. Patient comparison values and original reports are verified on access; full integrity checking and backup remain available.
- Batch CSV/PDF preview with per-file errors, deliberate partial-batch selection, explicit patient/stay assignment, unresolved patients/PDFs, duplicate detection and reviewed source revisions/collisions.
- Numeric patient and stay identifiers are independent strings (leading zeroes survive). Patient identifiers stay on the PC and are never inferred from initials, age or iPad sessions.
- Durable originals, selected revisions, patient corrections and attachment links in a verified append-only commit chain. Reselecting the folder reconstructs the archive after browser-site-data deletion.
- Searchable assessments, patient history, grouped source values, cautious source-value comparison and a bundled PDF.js canvas viewer. No PDF scripting, interactive links, forms or embedded attachments are activated.
- Full integrity inspection and verified copy to another empty folder, preserving both referenced and unreferenced files. The copy can be reopened independently. No automatic deletion, garbage collection or commit repair.

This is a **synthetic milestone build**, not a hospital production release. Native managed Edge permissions, the actual network share, approved hosting and backup-restore behavior need the [hospital acceptance procedure](docs/ACCEPTANCE.md). Development automation simulates the external picker/permissions while writing to real temporary disk folders; it does not verify Windows network-share semantics. There is no general power-loss or multi-PC transaction guarantee.

## Hospital use / delivery

IT serves the contents of `dist/` from a separate approved static **HTTPS origin**. That can be an approved external static host if the hospital cannot provide internal hosting. The existing Vercel-hosted producer working there establishes internet access; it does not establish approval or folder permissions for a new origin. No hosting account or site has been created or deployed by this project.

For Vercel, import this repository as a new project, keep the repository root as the Root Directory, and deploy. The included `vercel.json` selects the Other/static preset, installs locked dependencies without lifecycle scripts or optional native packages, runs tests and the build, and publishes only `dist/` with the documented response headers. No environment variables or database are required. See [Vercel setup](docs/HOSTING.md#vercel-setup). A successful deployment still needs a synthetic browser/folder trial on its actual URL.

Staff only open the URL in existing **Microsoft Edge**, choose the hospital network folder, and grant directory access. Firefox shows the capability/recovery screen; it cannot write this archive. Do not double-click `index.html` or use `file://`. No Node/Python/Docker/localhost service, extension or PWA installation is required on the hospital PC. Internet is allowed for application delivery; offline reopening is not promised. Patient data stays in folder files and browser memory. Browser storage is not used for patient content or required handles.

`npm run export:hospital` creates a new versioned folder under `releases/` with matching static-application and source-code ZIPs, SHA-256 checksums, release metadata and available browser evidence. Source and synthetic fixtures stay separate from the served static application. The bundles contain no patient archive or generated practice library.

Use a new empty folder to create an archive. After the write/read probe, click “Archiv hier anlegen & fortfahren” in the selected-folder card; this reuses the selected handle and opens import. A probe alone does not initialize archive files. Existing archives offer “Ausgewähltes Archiv öffnen” instead. Opening an empty folder through the existing-archive button also offers explicit creation without repeating selection. Unrelated or unreadable contents are never initialized over. Confirm that you are the sole writer, follow Importieren → Dateien auswählen → Zuordnen & prüfen → Gemeinsam speichern. Assign a numerical patient ID, numerical stay ID and explicit assessment type; review PDF relationships and confirm each included file. Clear browser-site data and reopen the same archive folder. Patient links, stay IDs, revision choices and original PDF links must still be there.

The color palette follows the user's Corporate Design Kurzmanual 2024, pages 14–15. See [color mapping](docs/DESIGN.md); logo structure and fonts are unchanged.

The archive folder must be **outside every web root, Git checkout, `dist/` and public hosting directory**. Keep real exports out of this development project. Hospital filesystem permissions and IT backup/encryption procedures protect the data; this app adds no authenticated identity or folder encryption.

## Development computer only

The user's private Mac is the primary development and testing environment. Hospital access is occasional: develop, run, refine and troubleshoot the complete synthetic workflow on the Mac first, then prepare a versioned source-and-static-build handoff when a hospital trial is practical. Hospital testing is a later release-validation stage; outstanding hospital hosting, policy and network-drive questions do not block independent local implementation or refinement.

Continue local work on import review, patient/stay assignment, records/history, report access, backup/recovery, usability and capacity. Exercise these with synthetic data, real local folder selection and automated failure tests. Record which behavior was tested locally and reserve hospital-specific conclusions for actual hospital trials. Carry findings from each trial back into the Mac project and the next handoff.

Use a maintained Node release with built-in test runner, WebSocket, Web Crypto and ES modules. No framework or bundler is required. The only application dependency is pinned PDF.js; npm's optional native canvas dependency is not needed.

```sh
npm ci --ignore-scripts --omit=optional
npm test
npm run build
npm run dev
```

For a realistic local practice library, run `npm run demo`: 80 fictional patients, 240 assessments, all seven types, repeat visits/stays, source revisions, missing reports and an import exercise. The new folder path is printed and recorded in ignored `test-results/demo-latest.json`. These are generated synthetic artifacts outside the static build; no existing archive is overwritten.

Prepare an occasional hospital handoff on the Mac with `npm run export:hospital`. It runs unit/integration tests, builds and packages the matching source/static artifacts. Existing installed dependencies suffice; there are no network calls in this command.

The included [synthetic fixtures](fixtures/README.md) provide CSV and a benign one-page PDF for the milestone demonstration. They are excluded from the static release.

Preview: `http://127.0.0.1:5186` on the **development computer**. Localhost is a development secure-context exception, not the hospital deployment plan. The build explicitly includes only application files and vendored PDF assets. Synthetic fixtures and reference source are excluded.

For browser QA, launch a separate disposable Chrome profile with remote debugging enabled, then:

```sh
npm run test:browser
```

The harness expects a development preview on port 5186 and Chrome debugger on 9246; override with `ARCHIVE_APP_URL` and `ARCHIVE_CDP_URL`. It creates and removes only its own synthetic temporary data. It exercises the actual UI with real browser File inputs, mocks picker/permission decisions, and bridges folder calls to actual disk. It also tests native file streams in OPFS separately. Results and synthetic screenshots go to ignored `test-results/`. See [validation](docs/VALIDATION.md) for scope and limits.

## Confirmed deployment context and remaining decisions

Confirmed 10 November 2026: Windows 10, Edge and Firefox available, network drive automatically backed up by IT, internet access, about 15 assessments/week (~780/year), indefinite library retention, and numeric individual patient IDs plus separate stay IDs entered only in the archive. One writer is acceptable; concurrent writing would be preferable but is not supported by this release.

Assumptions pending confirmation: exact Edge version/policies; approved external static origin and controlled updates; network filesystem behavior and IT restore process; identifier uniqueness/length conventions; allowed optional display labels; full-iPad-backup transfer; first comparison measures; institutional access/retention rules. CSV/PDF is the initial import contract. Full `.npt-backup.json/.txt` files are explicitly rejected by this version rather than partially interpreted. The original optional backup fixture remains in the handoff.

Comparison defaults are TMT A/B, PHQ-9, MoCA and QOLIE-31 **as source values**, loaded on request from verified CSV sources, with units and variant/mode/scoring/completion evidence where exported. They are provisional, contain no clinical interpretation and make no automatic comparability claim. Missing data stays missing. Full precision and unknown fields are retained; no scores are recomputed.

## Architecture and limitations

Read [archive format and recovery](docs/ARCHITECTURE.md) and [deployment headers](docs/HOSTING.md). One writer is a necessary operating boundary. Web Locks block a second tab in the same origin/browser profile; they cannot coordinate PCs, profiles or another origin. Head-change/fork detection reduces accidental conflicts and fails closed; a network lock file is not treated as a distributed lock.

Records have no retention expiry or fixed archive-count limit. Version 0.2.0 opens a compact folder index and loads full source details on demand. All source records and originals remain authoritative and reconstructible; no browser database is required. See [index design and integrity boundary](docs/INDEXING.md). A normal cached overview is not a full integrity check: source size/mtime fingerprints detect ordinary changes, while same-size/same-time modifications require source access or full verification. Full checks and backups bypass the index. On a 7,800-assessment local synthetic benchmark, indexed opening took about 1.27 s and 85 MiB retained Node heap versus 4.43 s and 632 MiB for the full-source/hash path. These use tiny PDF fixtures and do not establish hospital network performance or unlimited practical capacity.

The handoff describes actual producer source at commit `6d72df1872049089e298ff9a082db412f8f64351`, not a verified deployed exporter. CSV source release remains **unknown** even when its header signature is recognized. Legacy truthiness/rounding omissions cannot be recovered. Backup, archive schema, app and parser versions are independent.
