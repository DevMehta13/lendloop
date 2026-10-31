# Phase 8 — Report and viva preparation

Prepared and verified **31 October 2026**. All report, README and viva authoring work is complete. The original personal-practice requirement remains open until every member actually rehearses and records sign-off. Optional Phase 7 remains pending funded accounts and successful public receipts.

## Deliverables

- [12-page PDF report](../output/pdf/LendLoop_Report.pdf), matching the Section 9 outline: title/abstract, problem and blockchain rationale, roles, rental transition diagram/table, accounting, contract architecture, all 44 lab concepts, implementation screenshots, test results, security, limitations, future scope and conclusion.
- [Editable Markdown report](report.md), with explicit page divisions and source references. Academic identities were not provided and are explicitly marked as missing rather than invented.
- [Demo and viva guide](viva-preparation.md): opening explanation, manual demonstration checkpoints, wei/ETH accounting examples, 40 short-answer viva questions, failure recovery and an individual practice sheet.
- Updated [README](../README.md) with deliverable links and accurate phase status. Existing setup instructions, screenshot links and the complete clickable concept map are retained.
- Updated [implementation checklist](../LendLoop_Implementation_Plan.md), distinguishing completed preparation from unrecorded personal practice.
- Reproducible PDF generator at `scripts/build-report.py`; run with a Python environment containing ReportLab. It reads the editable source and recorded screenshots. The Markdown uses a `rental-diagram` comment to place a vector lifecycle diagram in the PDF.

## Validation

- `npm test --prefix tests` completed successfully: Phase 2, 3, 4, 6 and 7 suites all passed. Compiler output confirms Solidity 0.8.24, zero warnings/errors and 22,819-byte LendLoop runtime. The existing optional native-module messages lead to successful JavaScript fallbacks and did not fail any suite.
- All 21 planned cases are represented as Pass in the report, traced to the existing Phase 4 coverage table and freshly passing underlying suites. The report distinguishes deterministic local time advancement from the historic real-wait Remix rehearsals.
- The PDF was reopened with pypdf and confirmed to contain exactly 12 pages with the intended section boundaries. All pages were rendered with Poppler and visually reviewed; the dense concept/security tables and the final vector state diagram received enlarged inspection. No clipping or unintended page overflow was observed.
- The 44-entry concept map was derived from the README source references; the guide contains 40 viva answers. Report and guide figures use existing screenshots, with captions identifying their provenance and verification limits.
- Local Markdown destinations in the README, report, guide and this record were checked for existence. All selected screenshot files exist. No contract or frontend implementation was changed for Phase 8.
- The PDF generator was rerun after the final content/layout edits. Historic Phase 5 evidence was reused with explicit provenance; no new Remix or manual wallet rehearsal is claimed.

## Human handoff items

1. Add team names, roll numbers, institution/course and guide before submission, then regenerate the PDF and recheck layout if the title-page content grows.
2. Each team member independently practises the full manual demo and the viva questions, then records the actual result/date in the guide. Scripted rehearsals cannot satisfy this personal action.
3. Continue optional Sepolia deployment only once funded test accounts are available; keep it marked pending until successful public receipt links exist.

The authored Phase 8 package is ready. The full Phase 8 checklist is not represented as unconditionally complete because individual rehearsal has not been observed or signed off.
