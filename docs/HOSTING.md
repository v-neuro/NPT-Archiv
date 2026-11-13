# Static delivery and controlled updates

No server-side patient service is implemented or planned. Publish **only `dist/`**, preferably on a distinct stable hospital-approved HTTPS origin. The hospital PC has internet and the existing producer's external host is reachable, so an approved external static host is a possible delivery path when internal hosting is unavailable. The user has already tested a hosted release on hospital infrastructure. Exact host ownership, access controls and production update approval still need to be confirmed with IT. Local changes are not deployed until explicitly published.

## Vercel setup

1. In Vercel, choose **Add New → Project** and import **v-neuro/NPT-Archiv**.
2. Leave **Root Directory** at the repository root (`./`). Framework is **Other**; `vercel.json` supplies installation, build, output directory and headers.
3. No environment variables, storage integration or database are needed. Deploy and open the resulting HTTPS address in Edge or Chrome.
4. Use synthetic files first: create a test archive folder, import CSV/PDF, reopen it, and check the PDF viewer and backup. Verify the configured response headers on the deployed URL. Hospital approval and network-drive acceptance remain separate.

The installation command is `npm ci --ignore-scripts --omit=optional`; the build command is `npm test && npm run build`; the output directory is `dist`. Node is needed only on the build service/development computer. Vercel serves the generated static files to hospital PCs. The checked-in configuration follows [Vercel's configuration reference](https://vercel.com/docs/project-configuration/vercel-json).

Keep Web Analytics, Speed Insights, Toolbar injection and other injected third-party scripts disabled for this application. No application telemetry is included; the restrictive CSP can block hosting-platform script injection. Choose a stable production address for routine use and retain control of future deployments. Git-connected deployments may update automatically after pushes; use reviewed releases and Vercel's deployment controls before hospital use.

Development happens on the user's private Mac. Refine and validate the complete synthetic workflow there, then transfer versioned source, a matching static build and the relevant test/acceptance notes for occasional hospital trials. Keep transferred source separate from the served static web root. Hospital-specific failures are collected during those trials and reproduced or diagnosed on the Mac for the next iteration. Routine development continues while hospital access or hosting decisions are pending.

Do not serve the project root, handoff, fixtures, archive folder, Git metadata, patient exports or backups. No patient folder belongs beneath a web root. Uploading this code to static hosting must never involve selecting patient files. HTML/JS/fonts/CMaps/WASM and PDF worker are all bundled; no CDN runtime dependency. Static hosting's ordinary access logs should contain asset paths, never patient/stay IDs or imported contents. The app makes no content-bearing network calls.

The response-header configuration in `vercel.json` now uses separate policies:

- `/` and `/index.html`: application scripts/styles only from this origin, `connect-src 'none'`, same-origin frames/workers, and `frame-ancestors 'none'`.
- `/pdf-viewer.html`: only the exact hashed bootstrap and stylesheet plus renderer Blob modules; no network connections, nested frames, fonts or worker creation. Framing is permitted only by the application origin. The iframe itself has `sandbox="allow-scripts"`, without allow-same-origin, so its runtime origin is opaque.
- `/pdf-worker.mjs`: `default-src 'none'; script-src blob: 'wasm-unsafe-eval'; connect-src 'none'; worker-src 'none'; object-src 'none'`. The parent creates this fixed local worker and transfers a MessagePort to the renderer. The worker gets no directory handles and no host action channel.
- Common headers retain nosniff, no-referrer, SAMEORIGIN and cache revalidation. CSP's app framing prohibition is more restrictive than the common X-Frame-Options value.

The viewer's document-level policy matches its host policy, apart from frame-ancestors which requires an HTTP header. `scripts/build-pdf.mjs` hashes the exact inline bootstrap and combined palette/viewer CSS, verifies that `vercel.json` contains the same policy, embeds the trusted runtime code, and packages fonts/CMaps/WASM and reviewed decoder fallbacks in the worker. A source/style change that invalidates the hashes fails the build until the reviewed header configuration is updated. A pinned-worker-layout assertion also fails when the decoder import transformation needs review. Original dependency files are not modified.

Do not replace these with a blanket policy for every response: blocking framing of the PDF document or permitting only same-origin scripts there would break the intended isolated renderer. Copy the matching host configuration with the matching static build. The development preview applies the same path-specific headers for testing. Verify actual production responses after deployment; local results do not establish a hosting account's active configuration.

No third-party scripts, tracking, remote error reporting, remote fonts or patient-data requests are introduced. A private, frame-created MessageChannel carries only trusted renderer code, the selected report and a dedicated parser port. Parent-bound renderer messages are bounded plain-text status only, with no file/permission/action commands. The parser worker's offline resource loader accepts only names present in the bundled map, with no network fallback. PDF actions/scripts/annotations/forms/links remain disabled. Closing or timing out a report terminates its worker and drops its ports/bytes.

Serve `.js/.mjs` as JavaScript, `.wasm` as `application/wasm`, `.css` as CSS, font/CMap binaries appropriately, and use HTTPS. Do not rewrite missing assets or nonexistent patient/export paths to SPA HTML. The app has no route rewrite requirement. Review HTTPS/HSTS/authentication according to IT's existing host policy. No custom headers are claimed to be active until verified on that origin.

Release procedure: run developer checks, build, retain exact release artifact/dependency lock and checksums, review the change, approve origin/update, then atomically replace static application files. Keep the previous known-compatible static release. Close archive tabs before an update; archive files never enter the release. Reopen the folder and verify the release/schema. A future unsupported schema must remain untouched; use the corresponding supported app release, or a copy-based migration. Browser permissions belong to the origin; a domain change requires reselection/permission, not data migration.

Browser runtime behavior was checked against current primary documentation during development:

- [Chrome File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access): explicit user choice, secure context and read/write permissions.
- [FileSystemFileHandle.createWritable](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable): file-write/close behavior; not a multi-file transaction or network power-loss guarantee.
- [Edge DefaultFileSystemWriteGuardSetting](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/DefaultFileSystemWriteGuardSetting): policy can deny writes even when APIs exist.
- [PDF.js byte-input and rendering API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html): local byte loading and canvas rendering. PDF.js 6.5.438 is pinned; review dependency updates before each production release.
