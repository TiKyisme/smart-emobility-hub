# Release manifest

Inventory updated 2026-11-21 (ICT). The GitHub repository is **public**, so every published file is visible to anyone.

## Decision legend

| Decision | Meaning |
|---|---|
| **KEEP** | Tracked and published. |
| **KEEP-LOCAL** | Preserved unchanged on the owner's machine, **not published** (teammate ownership, intermediate version or not needed for the repository). Never delete. |
| **LOCAL-ONLY** | Private working files kept out of Git through the local `.git/info/exclude`. Never delete. |
| **IGNORE** | Regenerable build output, matched by `.gitignore`. Safe to delete only after the report is rebuilt and checked. |

## 1. Application, tests and documentation — KEEP

| Path | Content |
|---|---|
| `index.html` + `src/**` (1 + 27 files) | Static app: shell with eleven use-case pages, ES modules (`main.js`, `ui/`, `ui/views/`, `services/`, `domain/`, `state/`, `data/`), `styles.css`. |
| `package.json` | Scripts only (`npm start`, `npm test`); **no dependencies**. |
| `tests/unit/` (8 `*.test.js` files + `helpers.js`) | 73 automated checks, Node built-in runner (incl. TC-UC04-01..11 of the Submission #3 appendix). |
| `tests/e2e/browser_acceptance.py` | Optional Playwright browser run (130 checks incl. demo-script replay). |
| `tests/ACCEPTANCE_TESTS.md` | Manual AT-01..AT-22. |
| `docs/*.md` | Specification, requirements, architecture, decisions (D-001..D-026, ADR-01..06 mapping), traceability, use case ↔ web ↔ report synchronization (`UC_UI_PDF_SYNC.md`), plans, AI usage declaration. |
| `docs/demo/*.md`, `docs/demo/screenshots/*.png` (11 images) | Demo package and browser evidence of the current interface. |
| `docs/RELEASE_MANIFEST.md`, `docs/RELEASE_SUMMARY.md` | This manifest and the hand-over summary. |
| `README.md`, `.gitignore` | Navigation and ignore rules. |
| `submission2/UC04_Activity.{puml,png}`, `submission2/UC04_Sequence.{puml,png}` | UC-04 activity/sequence diagrams (editable PlantUML + export). |

## 2. Published reports — KEEP (team approval 2026-11-20)

| Path | Notes |
|---|---|
| `submission2/Phase2_L03_13.pdf` (32 pages, SHA-256 `cb3a633848ca…`) | Submission #2 report. Contains the members' names and student IDs; the team agreed to publish it. |
| `submission3/L03_13 (1).pdf` (40 pages, SHA-256 `1c786f443b5e…`) | Submission #3 report, **the version submitted to the LMS** (confirmed by the owner). Published under its original file name, content unchanged. |

## 3. Local-only working files — LOCAL-ONLY (`.git/info/exclude`)

16 private working files stay on the owner's machine only and are listed by pattern in the local `.git/info/exclude`: the two instruction files removed from GitHub (local copies identical to commit `04bf4c1`), a local hand-over notes folder (contains machine-specific paths) and 4 drafting-prompt files under `submission3/`. They are not deliverables and are never pushed.

## 4. `submission2/` — remaining files

| Path | Decision | Notes |
|---|---|---|
| `main.tex` | KEEP-LOCAL | Report source (the PDF is published). |
| `Activity_UC09.png`, `Sequence_UC09.png`, `UC02_*.png`, `UC12_*.png`, `UC17_*.png` | KEEP-LOCAL | Teammates' diagram exports; their content is visible in the published PDF. |
| `Smart E Mobility Hub UseCase.text`, `UC04_UI_Mockups/` (7 PNG), `report_assets/` (8 PNG) | KEEP-LOCAL | Diagram source, Figma mockups and TeX inputs. |

## 5. `submission3/` — remaining files

| Path | Decision | Notes |
|---|---|---|
| `L03_13.pdf` (SHA-256 `19e4504998c9…`) | Removed by the owner | Earlier build whose **page 7 renders as black blocks**. The owner deleted it through Windows Explorer on 2026-11-20 07:39 (it is in the Recycle Bin); a byte-identical copy remains at `report_builder/out/L03_13.pdf` (ignored build output). Never published. |
| `L03_13_rotated.pdf`, `L03_13_BAN_NHAP_CHUA_NOP.pdf` | KEEP-LOCAL | Intermediate and draft versions. |
| `report_builder/L03_13.tex`, `methods.tex`, `consolidate_submission3.py`, `README_BUILD_REPORT.md`, `report_builder/assets/` | KEEP-LOCAL | Report source and build inputs. |
| `Development_Implementation_View.*`, `Implement View.png`, `Implement_View_extracted.xml`, `build_new_development_view.py`, `Deployment*`, `UC15_Implementation.drawio` | KEEP-LOCAL | Architecture view sources/exports (the `.svg` of the development view is not well-formed XML; the `.png` used by the earlier build contains the black-block raster). |
| Class diagrams (`Overall System Class Diagram.png`, `Subsystem 1/2/3 …png`, `UC17_class.png`, three timestamp-named `.jpg`), method-description PDFs, `UC04/` | KEEP-LOCAL | Teammates' design inputs; content visible in the published report. |
| `METHOD_COVERAGE_AUDIT.md`, `QA_REPORT.md`, `report_source_manifest.md`, `Submission3_Group13_LaTeX_BuildKit.zip` | KEEP-LOCAL | Provenance notes and archive. The Submission #3 report (section 6.3) names `report_source_manifest.md` and `METHOD_COVERAGE_AUDIT.md` as repository documents; publish them only after the team agrees. |
| `report_builder/out/`, `report_builder/page_previews/`, `report_builder/L03_13.log` | IGNORE | LaTeX intermediates, logs with local paths, preview renders. |

## 6. Repository root

| Path | Decision | Notes |
|---|---|---|
| `submission3.zip` | KEEP-LOCAL | Older input snapshot and draft. |
| `test_amsmath.log` | IGNORE | LaTeX test log (`*.log`). |

## 7. Preservation and publishing rules

- This release work did not modify, move or delete any file under `submission2/` or `submission3/`; SHA-256 snapshots are compared before every commit ([demo/DEMO_EVIDENCE.md](demo/DEMO_EVIDENCE.md#5-bảo-toàn-tệp-của-nhóm)). The only difference found is the owner's own deletion of `submission3/L03_13.pdf` described above.
- To publish another file later, stage its exact path (never `git add .`), review `git diff --cached --stat`, then commit.
