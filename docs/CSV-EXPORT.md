# Local CSV export · 0.7.0

This is a derived table for selected examinations, not a replacement for the permanent library or its complete verified backup. It contains no PDF bytes and does not contain earlier, unselected source revisions. The producer importer still accepts only its own one-examination CSV contract; this multirow analysis CSV is not an import/restore file.

## Selection

- **Untersuchungen:** exactly the checked examinations. Use Archivstatus → Alle/Nur ausgeschlossene to find and select excluded records. Each checked examination stays selected when filters/pages change, including when hidden; the interface states the hidden-selection count.
- **Patienten:** every examination of the checked patients, including excluded examinations and types not visible under the current history filter. Patients with no examinations contribute no rows; a selection with no examinations is rejected clearly.
- **Alle gefilterten Treffer auswählen:** every matching examination/patient, across all pages and beyond the first 20 patient suggestions. A partially selected result set has an indeterminate checkbox. Unchecking it removes only the matching selections; “Auswahl aufheben” clears the entire selection for that page.
- Patient and examination selections are separate, exist in memory only and clear on library close/change. No selection is saved in browser storage or archive records.

One row is the currently selected source revision of one examination. Rows are ordered by hospital patient-ID string (numeric-aware with an exact-string tie break), then date and internal examination ID. Duplicate checkbox IDs cannot multiply rows. Excluded rows remain in either export when they belong to the explicit selection; status never silently drops them.

## Encoding and columns

UTF-8 with BOM, semicolon separator, CRLF record endings, doubled embedded quotes and quoted text including multiline cells. Browser downloads use a generic date-based filename without patient IDs. The browser's configured download location/policy applies; there is no network upload or archive write.

Original headers follow the metadata columns, in a deterministic union across the selected source revisions. Every original field is included, even text/notes, unknown fields, flags, versions and empty columns; the numeric-selector restriction does **not** restrict CSV export. No number conversion, rounding, imputation, clinical recalculation or label-based merging is performed. Positive/negative zero, comma/dot decimals, exponents and raw precision stay as source text.

Archive metadata is prefixed `archive.`. The dot cannot occur in an accepted producer header, so these columns cannot overwrite source fields.

| Column | Meaning |
| --- | --- |
| `archive.format` | `digitale-npt-tabular-export/1` |
| `archive.app_version` | Version creating this table |
| `archive.patient_id`, `archive.stay_id` | iMed patient/stay identifier strings, including leading zeros |
| `archive.assessment_id` | Internal examination identity (distinct from source session) |
| `archive.assessment_type_id`, `archive.assessment_type` | Staff-assigned category ID and label; unassigned stays explicit |
| `archive.excluded` | `1` excluded, `0` included |
| `archive.date`, `archive.original_date` | Validated local ISO date if known, and original date text; no invented timezone |
| `archive.source_session_id`, `archive.selected_revision_id` | Original source session and chosen durable revision identity |
| `archive.csv_name`, `archive.csv_sha256` | Original CSV filename and immutable byte hash |
| `archive.parser_version`, `archive.producer_version` | Saved source-adapter/producer version; unknown producer stays empty |
| `archive.imported_at`, `archive.import_actor` | Revision-addition timestamp and saved operator abbreviation; older unknown/empty actor stays empty |
| `archive.snapshot_head` | Verified archive head used for this export |
| `archive.absent_fields` | JSON array: source columns absent in this row's original revision |
| `archive.missing_fields` | JSON array: columns present but unquoted/missing in the original row |
| `archive.escaped_fields` | JSON array: field names protected for spreadsheet formula handling in this export |

Missing and absent cells remain unquoted empty cells. An explicitly quoted empty source string remains `""`. The metadata arrays distinguish absent columns from original missing values even if a downstream reader treats both as null. Original quoting of other nonempty cells is represented with canonical CSV quoting; the original CSV bytes remain unchanged in the library.

To discourage spreadsheet formula evaluation, nonnumeric strings beginning with formula characters (`=`, `+`, `-`, `@`, including full-width forms/leading whitespace) or leading tab/CR/LF receive one extra apostrophe in the derived cell. Affected source/metadata keys are recorded in `archive.escaped_fields`; those columns can be reconstructed by removing exactly one added apostrophe. Existing producer safety apostrophes are not removed or doubled unnecessarily. Ordinary numeric strings such as `-2`, `+2` and `-0` are unchanged. Raw notes with line breaks remain multiline quoted cells. This does not provide a guarantee about every spreadsheet application's interpretation; use text import when exact literals matter.

CSV does not carry a spreadsheet schema. In Excel use **Data → From Text/CSV**, UTF-8 and semicolon, and declare identifier/source-text columns as **Text** before loading. Double-clicking a CSV can cause Excel itself to strip leading zeros or round long numeric-looking values, although the exported file retains the strings. These are analysis files containing patient information and belong in the same approved local storage workflow as the originals.

## Verification and limits

The exporter bypasses overview caches, checks the authoritative source-record chain, requires the open archive ID/head, reads/verifies the selected CSV originals and reconstructs rows from complete saved raw source documents. A fresh reader and bounded eight-record detail cache avoid reuse of stale loaded details. It rechecks inventory/head before offering the local Blob download. Missing/corrupt sources and changed/unavailable libraries abort the whole export and give a library-recheck/reopen path; no partial download is offered. Read permission is sufficient, even if another tab holds the same-browser writer lock. No cache/source file is modified.

The assembled UTF-8 output is limited to 128 MiB. Select fewer rows if the limit is reached; values are never truncated. Output strings are held temporarily in browser memory and the generated Blob URL is revoked after download initiation. This is not a streaming unlimited-data exporter. As with other folder operations, one writer is the supported boundary; head checks are not a cross-PC lock or a claim of power-loss safety. Full integrity checking/backup also verifies PDFs and other retained originals, whereas tabular export verifies the data it reads.
