# Release manifest — branch `release/demo-readiness`

Inventory date: 2026-11-20 (ICT). The GitHub repository is **public**, so every published file is visible to anyone.

## Decision legend

| Decision | Meaning |
|---|---|
| **KEEP** | Tracked and published on this branch. |
| **KEEP-LOCAL** | Preserved unchanged on the owner's machine, **not published**. Publishing needs an explicit team decision (personal data, teammate ownership or unconfirmed final version). Never delete. |
| **LOCAL-ONLY** | Private working files kept out of Git through the local `.git/info/exclude` (not pushed, not shared). Never delete. |
| **IGNORE** | Regenerable build output, matched by `.gitignore`. Safe to delete only after the report is rebuilt and checked. |

## 1. Application, tests and documentation — KEEP

| Path | Content |
|---|---|
| `index.html` + `src/**` (1 + 15 files) | Static app: ES modules, CSS, simulated seed data. Entry point `src/main.js`. |
| `package.json` | Scripts only (`npm start`, `npm test`); **no dependencies**. |
| `tests/unit/` (7 `*.test.js` files + `helpers.js`) | 47 automated checks, Node built-in runner. |
| `tests/e2e/browser_acceptance.py` | Optional Playwright browser run (93 checks incl. demo-script replay). |
| `tests/ACCEPTANCE_TESTS.md` | Manual AT-01..AT-20. |
| `docs/*.md` | Specification, requirements, architecture, decisions (D-001..D-013), traceability, plans, AI usage declaration. |
| `docs/demo/*.md`, `docs/demo/screenshots/*.png` (8 images, ≈ 0.36 MB) | Demo package and browser evidence. |
| `docs/RELEASE_MANIFEST.md`, `docs/RELEASE_SUMMARY.md` | This manifest and the hand-over summary. |
| `README.md`, `.gitignore` | Navigation and ignore rules (README re-encoded as UTF-8; a trailing UTF-16 fragment with NUL bytes was removed). |
| `submission2/UC04_Activity.{puml,png}`, `submission2/UC04_Sequence.{puml,png}` | Owner's UC-04 activity/sequence diagrams (editable PlantUML + export), from local commit `04bf4c1`. |

Not reintroduced: the two instruction files that the owner deleted on GitHub `main` (commits `2e27bdf`, `e7e068b`) stay deleted on this branch.

## 2. Local-only working files — LOCAL-ONLY (`.git/info/exclude`)

16 private working files stay on the owner's machine only and are listed by pattern in the local `.git/info/exclude`: the two instruction files removed from GitHub (local copies identical to commit `04bf4c1`), a local hand-over notes folder (10 files, contains machine-specific paths) and 4 drafting-prompt files under `submission3/`. They are not deliverables and are never pushed.

## 3. `submission2/` (30 files, 14.6 MB)

| Path | Decision | Notes |
|---|---|---|
| `UC04_Activity.*`, `UC04_Sequence.*` (4) | KEEP | See section 1. |
| `Phase2_L03_13.pdf` (5.6 MB, 32 pages, SHA-256 `cb3a633848ca…`) | KEEP-LOCAL | Submission #2 report; cover page lists the five members' student IDs. |
| `main.tex` | KEEP-LOCAL | Report source; contains the same student IDs. |
| `Activity_UC09.png`, `Sequence_UC09.png`, `UC02_Activity.png`, `UC02_Sequence.png`, `UC12_Activity.png`, `UC12_sequence.png`, `UC17_activity.png`, `UC17_sequence.png` (3.7 MB) | KEEP-LOCAL | Teammates' diagrams; publish with their agreement. |
| `Smart E Mobility Hub UseCase.text` | KEEP-LOCAL | Use-case diagram source. |
| `UC04_UI_Mockups/` (7 PNG, 1.3 MB) | KEEP-LOCAL | Figma mockups (show the owner's name). |
| `report_assets/` (8 PNG, 2.1 MB) | KEEP-LOCAL | TeX inputs; three are byte-identical copies of mockups. Keep exact names for `main.tex`. |

## 4. `submission3/` (115 files, 20.9 MB)

| Path | Decision | Notes |
|---|---|---|
| `L03_13.pdf` (40 pages, SHA-256 `19e4504998c9…`) | KEEP-LOCAL | Nominal Phase 3 output. **Page 7 (Development / Implementation View) renders as black blocks** in PyMuPDF and Poppler. Not modified. |
| `L03_13 (1).pdf` (40 pages, SHA-256 `1c786f443b5e…`) | KEEP-LOCAL | Text identical to `L03_13.pdf` on all 40 pages; only the page-7 image differs and is **readable**. Likely the corrected version — the team leader must confirm which file was submitted. |
| `L03_13_rotated.pdf` (39 pages), `L03_13_BAN_NHAP_CHUA_NOP.pdf` (16-page draft) | KEEP-LOCAL | Intermediate/draft versions. |
| `report_builder/L03_13.tex`, `methods.tex`, `consolidate_submission3.py`, `README_BUILD_REPORT.md` | KEEP-LOCAL | Report source and build script (TeX contains student IDs). |
| `report_builder/assets/` (12 files, 3.5 MB) | KEEP-LOCAL | TeX inputs (copies of diagrams); `page_7_preview.png` is a diagnostic image not referenced by the TeX. |
| `Development_Implementation_View.{drawio,png,puml,svg}`, `Implement View.png`, `Implement_View_extracted.xml`, `build_new_development_view.py` | KEEP-LOCAL | Development view sources/exports. The PNG used by the nominal build contains the black-block raster; the `.svg` is not well-formed XML. Re-export from the `.drawio` before any rebuild. |
| `Deployment view.drawio`, `Deployment_View.{png,puml,svg}`, `UC15_Implementation.drawio` | KEEP-LOCAL | Physical/implementation view sources. |
| `Overall System Class Diagram.png`, `Subsystem 1/2/3 - … .png`, `UC17_class.png`, three timestamp-named `.jpg` class figures (UC-02, UC-09, UC-15) | KEEP-LOCAL | Teammates' class diagrams; several PNGs embed editable diagrams.net data. |
| `UC02_Class_and_Method_Description.pdf`, `UC_09 Methods and Descriptions.pdf`, `UC_15 Methods and Descriptions.pdf`, `UC17_Method Descriptions.pdf` | KEEP-LOCAL | Individual method descriptions. |
| `UC04/` (7 files without the prompt) | KEEP-LOCAL | Owner's UC-04 class diagram (drawio/puml/png/svg), method descriptions, proposed test cases, integration notes. |
| `METHOD_COVERAGE_AUDIT.md`, `QA_REPORT.md`, `report_source_manifest.md` | KEEP-LOCAL | Report provenance; `QA_REPORT.md` contains student-ID-like numbers and predates the page-7 finding. |
| `Submission3_Group13_LaTeX_BuildKit.zip` (SHA-256 `a6ba92ee54c1…`) | KEEP-LOCAL | Historical build kit archive. |
| `report_builder/out/` (9 files), `report_builder/page_previews/` (46 PNG), `report_builder/L03_13.log` | IGNORE | LaTeX intermediates (`.aux/.toc/.lof/.lot/.out`, logs with local paths), a copy of the nominal PDF, preview renders. |

## 5. Repository root

| Path | Decision | Notes |
|---|---|---|
| `submission3.zip` (3.3 MB, SHA-256 `bf6e172472a5…`) | KEEP-LOCAL | Older input snapshot and draft; not a backup of the current report tree. |
| `test_amsmath.log` | IGNORE | LaTeX test log (`*.log`). |

Course files in the parent folder (assignment PDF, earlier group reports) are outside the Git repository and are not affected.

## 6. Preservation check

A SHA-256 snapshot of all 152 untracked and ignored files was taken before any change on 2026-11-20 and compared again before committing; the result is recorded in [demo/DEMO_EVIDENCE.md](demo/DEMO_EVIDENCE.md#5-bảo-toàn-tệp-của-nhóm). No file under `submission2/` or `submission3/` was modified, moved or deleted.

## 7. If the team decides to publish reports later

Publishing makes the student IDs public. With the team's agreement, stage exact paths only (never `git add .`):

```powershell
git switch release/demo-readiness
git add -- "submission2/Phase2_L03_13.pdf"           # Submission #2 report
git add -- "submission3/L03_13 (1).pdf"              # only after the leader confirms it is the submitted version
git diff --cached --stat                             # review before committing
git commit -m "docs: add approved submission reports"
git push
```
