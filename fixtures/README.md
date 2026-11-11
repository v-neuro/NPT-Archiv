# Synthetic import material only

The three CSVs are unchanged copies of the supplied actual-exporter fixtures. They use invented demographics, partial/manual-zero examples and quoted multiline Unicode/formula-safe notes. `revised-same-session.csv` changes TMT A for the same source session. `empty-assessment.csv` contains defaults that do not establish administration.

The PDF sharing the long CSV's stem is a minimal benign, generated one-page file containing only “SYNTHETIC NPT archive report - no patient data”. It is provided for the first import/attachment/reopen demonstration. It is **not** a report printed by the producer and its matching name is only an association hint. It contains no scripts, links, clinical findings, test materials or real person. Its generator is `syntheticPdf(false)` in `tests/support.mjs`.

The automated PDF viewer test uses a separate adversarial synthetic PDF generated in a temporary directory, including a JavaScript action and a link to `example.invalid`. That PDF is not the benign manual fixture. The original iPad full backup remains in `../../archive-handoff/fixtures/`; structured backup import is not implemented.

Never replace these fixtures with real exports or store patient data inside the source tree or release folder. The build excludes this directory completely.
