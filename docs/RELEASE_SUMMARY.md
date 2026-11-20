# Release summary — UI redesign and complete flows (2026-11-20)

| Item | Value |
|---|---|
| Repository | https://github.com/TiKyisme/smart-emobility-hub (public) |
| Branch | `feature/ui-redesign`, based on `main` @ `c15cb0c` (merge of PR #1); normal push, no force |
| Pull request | https://github.com/TiKyisme/smart-emobility-hub/pull/2 — open into `main`, **not merged** (owner review) |
| Tested commit | `4b08beb459e979ae0f4268534ee0c23383e17d38`; this summary and the test evidence are added by the next commit on the same branch (`git log -1`) |
| Previous release | PR #1 (`release/demo-readiness`) merged by the owner as `c15cb0c` |

## How to run

`python -m http.server 5173 --bind 127.0.0.1` from the repository root, then open http://127.0.0.1:5173/. Guide: [docs/demo/START_HERE.md](demo/START_HERE.md). Demo script: [docs/demo/DEMO_SCRIPT_8_TO_12_MIN.md](demo/DEMO_SCRIPT_8_TO_12_MIN.md).

## Verified

| Check | Result |
|---|---|
| `npm test` (60 unit checks, no dependencies) | 60 pass / 0 fail |
| Browser run, Chrome 157 | 101 PASS / 0 FAIL (incl. 25-step demo-script replay, no console/network errors) |
| Browser run, Edge 157 | 101 PASS / 0 FAIL |
| Static server on port 5173 | 20/20 assets HTTP 200 |
| Published PDFs | committed byte-identical to the files on disk |

Evidence and screenshots: [docs/demo/DEMO_EVIDENCE.md](demo/DEMO_EVIDENCE.md).

| Requirement | Status |
|---|---|
| FR-01..FR-03 Hub state, search, vehicle availability | Verified (unit + browser) |
| FR-04, FR-06, FR-07 hold with countdown, cancel, expiry, pickup, return | Verified |
| FR-05 parking holds within capacity, release | Verified |
| FR-08, FR-09, FR-15 charging requests with automatic priority allocation, finish, cancel | Verified. Private-EV **time-slot selection** from the design is not implemented. |
| FR-10..FR-13 KPIs, utilization ranking, redistribution, fleet | Verified. No numeric "approaching capacity" threshold (none in the assignment). |
| FR-14 incidents: report and resolve (repair/restore) | Verified. Technician assignment from the mockup is design-only. |
| FR-16..FR-18 five What-if scenarios on a copy | Verified; Save/Apply of a scenario is design-only. |
| FR-19 simulated updates (manual, every 15 s) | Verified |
| FR-20 Light/Dark + VI/EN (Vietnamese default) | Verified |

## What changed (on top of PR #1)

1. `d0c5f4b` — interface redesign (sidebar, six pages, square corners, less text) and complete flows: automatic charging allocation, finish, cancellations, incident resolution, one trip per student, reset data.
2. `26b2771` — tests: 60 unit checks, 101 browser checks.
3. `aaf1112` — decisions D-014..D-018, architecture, traceability, demo package, screenshots, README.
4. `4b08beb` — published reports `submission2/Phase2_L03_13.pdf` and `submission3/L03_13 (1).pdf` (team approval), release manifest.

## Open items

1. Review and merge PR #2; rehearse once on the presentation laptop with [the checklist](demo/DEMO_CHECKLIST.md).
2. `submission3/L03_13.pdf` (broken page 7) was deleted by the owner on 2026-11-20 07:39 (Recycle Bin); an identical copy stays at `submission3/report_builder/out/L03_13.pdf`.
3. Not published (by choice, see [manifest](RELEASE_MANIFEST.md)): report sources, teammates' diagram files, mockups, archives.
4. Design-only items to mention if asked: time slots, technician assignment, What-if Save/Apply, multi-user server, persistence.

## Next steps for a teammate

```powershell
git fetch origin
git switch feature/ui-redesign      # or main after PR #2 is merged
npm test                            # expect 60 pass
python -m http.server 5173 --bind 127.0.0.1
```

The owner's local `main` still points at `04bf4c1`. After merging, a non-destructive way to align it:

```powershell
git fetch origin
git branch -m main old-main-04bf4c1
git switch -c main --track origin/main
```

Never use `git add .` in this folder: `submission2/` and `submission3/` still hold unpublished files; stage exact paths only.
