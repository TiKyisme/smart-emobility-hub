# Release summary — use cases, web UI and reports synchronized (2026-11-21)

| Item | Value |
|---|---|
| Repository | https://github.com/TiKyisme/smart-emobility-hub (public) |
| Branch | `feature/uc-ui-sync`, based on `main` @ `3738c79` (merge of PR #2); normal push, no force |
| Pull request | https://github.com/TiKyisme/smart-emobility-hub/pull/3 — into `main`, **not merged** (owner review) |
| Tested commit | `9a7ad682d0c0a9224d2cb3aafc0e27926ed92c83`; the evidence, this summary and the manifest are added by the next commit on the same branch (`git log -1`) |
| Previous releases | PR #1 (`c15cb0c`), PR #2 (`3738c79`), both merged by the owner |

## Goal

Check whether the use cases, the web UI and the submitted reports (Submission #1, [Submission #2](../submission2/Phase2_L03_13.pdf), [Submission #3](<../submission3/L03_13 (1).pdf>)) agree, and make them agree **without changing the submitted PDFs**. Full mapping and the remaining differences: [UC_UI_PDF_SYNC.md](UC_UI_PDF_SYNC.md) (Vietnamese).

## How to run

`python -m http.server 5173 --bind 127.0.0.1` from the repository root, then open http://127.0.0.1:5173/. Guide: [docs/demo/START_HERE.md](demo/START_HERE.md). Demo script: [docs/demo/DEMO_SCRIPT_8_TO_12_MIN.md](demo/DEMO_SCRIPT_8_TO_12_MIN.md).

## Verified

| Check | Result |
|---|---|
| `npm test` (73 unit checks, no dependencies) | 73 pass / 0 fail |
| Browser run, Chrome 157 | 130 PASS / 0 FAIL (incl. 23-step demo-script replay, no console/network errors) |
| Browser run, Edge 157 | 130 PASS / 0 FAIL |
| Static server on port 5173 | 28/28 assets HTTP 200 |
| Submitted reports | unchanged |

Evidence and screenshots: [docs/demo/DEMO_EVIDENCE.md](demo/DEMO_EVIDENCE.md).

## What was out of sync and what changed

| Area | Before | Now (matches the reports) |
|---|---|---|
| Actors / navigation | 2 portals, 6 self-named pages | 11 pages named like the use cases, grouped by actor, including the **Vehicle Dispatch Staff** and **Maintenance Staff** of the Submission #1 diagram |
| UC-02 | Hub and battery filter | Location, destination, radius 0.1–5 km (Haversine), Hubs nearest first, type + battery filters, E1/E2/E3 |
| UC-04 | One-click hold | Confirmation step, confirmed reservation details, A1/A2/A3, E1/E2/E3, reservation history; TC-UC04-01..11 automated |
| UC-09 | Queue request | Hub + date + one-hour slot, availability check, review and confirm, alternatives, E1/E2, completion notice |
| Smart charging | Upcoming usage first | ADR-05 priority, schedule per slot, operator adds shared vehicles, move/cancel/optimize |
| Redistribution | Instant move | Plan → redistribution task → dispatch staff starts/completes |
| UC-15 | Report → repaired | New → Assigned → In progress → Resolved, classification, confirm unavailable, operational branch |
| UC-17 | Scenario + Hub | Demand %, offline ports, horizon, validation, impact cards, typed recommendations, save and apply |
| Data | 4 Hubs, 6 vehicles | 12 Mobility Hubs (Submission #1 decision), 23 typed vehicles, 14 ports |
| Design traceability | Different function names | Table 12 method names present in the code |

## Commits

1. `6122f72` — web app aligned with the use cases (pages, services, data).
2. `dc67752` — 73 unit checks, 130 browser checks, AT-01..AT-22.
3. `02266df` — synchronization report, use case catalog, traceability, decisions D-019..D-026 with the ADR-01..06 mapping, architecture, requirement notes, README.
4. `9a7ad68` — demo package and screenshots.
5. (next) — test evidence, this summary, release manifest.

## Open items for the owner

1. Review and merge the pull request; rehearse once with [the checklist](demo/DEMO_CHECKLIST.md).
2. The Submission #3 report lists `submission3/report_source_manifest.md` and `submission3/METHOD_COVERAGE_AUDIT.md` as repository documents; they exist locally but are not published. Publish them only if the team agrees ([manifest](RELEASE_MANIFEST.md)).
3. Points that are wrong inside the submitted PDFs (UC-12 vs UC-15 in Submission #2, UC IDs of FR-10..FR-13 in Table 12) are documented, not fixable in the PDFs.

## Next steps for a teammate

```powershell
git fetch origin
git switch feature/uc-ui-sync      # or main after the pull request is merged
npm test                           # expect 73 pass
python -m http.server 5173 --bind 127.0.0.1
```

The owner's local `main` still points at `04bf4c1` (its only extra commit is the UC-04 diagram commit already contained in `origin/main` as `75fc30b`). A non-destructive way to align it:

```powershell
git fetch origin
git branch -m main old-main-04bf4c1
git switch -c main --track origin/main
```

Never use `git add .` in this folder: `submission2/` and `submission3/` still hold unpublished files; stage exact paths only.
