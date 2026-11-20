# Release summary — demo readiness (2026-11-20)

| Item | Value |
|---|---|
| Repository | https://github.com/TiKyisme/smart-emobility-hub (public) |
| Branch | `release/demo-readiness`, based on `main` @ `e7e068b` (fast-forward, no force push) |
| Pull request | https://github.com/TiKyisme/smart-emobility-hub/pull/1 — open into `main`, **not merged** (needs the owner's review) |
| Tested commit | `841246eaeada9162f11b9b27ed4088937ee41c6a` (code and tests unchanged since `bb842eb`); this summary and the test evidence are added by the next commit on the same branch — see `git log -1` |
| Local `main` | untouched at `04bf4c1` (its UC-04 diagram commit is included on the branch as `75fc30b`) |

## How to run

`python -m http.server 5173 --bind 127.0.0.1` from the repository root, then open http://127.0.0.1:5173/. Full guide: [docs/demo/START_HERE.md](demo/START_HERE.md). Demo script: [docs/demo/DEMO_SCRIPT_8_TO_12_MIN.md](demo/DEMO_SCRIPT_8_TO_12_MIN.md).

## Verified

| Check | Result |
|---|---|
| `npm test` (47 unit checks, no dependencies) | 47 pass / 0 fail |
| Browser run, Chrome 157 (`python tests/e2e/browser_acceptance.py`) | 93 PASS / 0 FAIL, incl. 27-step demo-script replay, no console/network errors |
| Browser run, Edge 157 | 93 PASS / 0 FAIL |
| Static server on port 5173 | 17/17 assets HTTP 200, JS served as JavaScript |
| Untracked team files | 152/152 byte-identical before/after (SHA-256) |

Evidence and screenshots: [docs/demo/DEMO_EVIDENCE.md](demo/DEMO_EVIDENCE.md).

| Requirement | Status on this branch |
|---|---|
| FR-01..FR-03 view/search Hubs and vehicles | Verified in browser and unit tests |
| FR-04 hold + expiry, FR-06 pickup, FR-07 return | Verified (expiry shown live with `?holdSeconds=`) |
| FR-05 parking within capacity | Verified |
| FR-08 shared charging request, FR-15 smart schedule | Verified (priority, capacity, eligibility, no duplicates) |
| FR-09 private EV parking + charging | Verified as two steps (student queues, operator applies schedule). **Time-slot selection from the design is not implemented.** |
| FR-10..FR-14 monitoring, capacity risk, redistribution, incidents | Verified. No numeric "approaching capacity" threshold (none given by the assignment); incident resolution/maintenance flow is design-only. |
| FR-16..FR-18 five what-if scenarios with impact and recommendations | Verified; live state proven unchanged. Apply/Save of a scenario is design-only. |
| FR-19 simulated updates (manual and every 15 s) | Verified |
| FR-20 interface mode Light/Dark + VI/EN | Verified |

## What changed

1. `75fc30b` UC-04 activity/sequence diagrams (owner's earlier local commit).
2. `848aecf` fixes: charging eligibility at assignment, duplicate requests, telemetry battery for shared requests, private EV validation, simulator parking vs held capacity, temporary simulated charging occupancy, verified what-if isolation, return-destination reset on re-render, specific feedback, VI/EN, dark-mode contrast.
3. `bb842eb` tests: `tests/unit` (node:test) and `tests/e2e/browser_acceptance.py` (optional Playwright).
4. `9612ef2` architecture, decisions D-008..D-013, traceability.
5. `b3816ba` demo package (`docs/demo`).
6. `841246e` README encoding repair, targeted `.gitignore`, [release manifest](RELEASE_MANIFEST.md).

## Open decisions and risks (team)

1. **Publishing reports:** Submission #2/#3 PDFs and TeX contain the five members' student IDs; the repository is public. They are kept locally and not published ([manifest](RELEASE_MANIFEST.md) section 7 has the exact commands if the team agrees).
2. **Canonical Submission #3 PDF:** `submission3/L03_13.pdf` page 7 shows black blocks; `L03_13 (1).pdf` has identical text and a readable page 7. Confirm which file was submitted to the LMS (not verifiable from the repository).
3. **Human rehearsal:** the browser run replays the script automatically, but the team should rehearse once on the presentation laptop and projector ([checklist](demo/DEMO_CHECKLIST.md)).
4. Design items not implemented (state them honestly if asked): private-EV time slots, incident resolution, charging completion, scenario Apply/Save, multi-user server, persistence.
5. Rule change to mention if asked: shared-vehicle charging priority now uses the recorded battery (D-008), so typed battery values no longer affect shared requests.

## Next steps for a teammate

```powershell
git fetch origin
git switch release/demo-readiness       # or open PR #1 on GitHub
npm test                                # expect 47 pass
python -m http.server 5173 --bind 127.0.0.1
```

After the owner merges PR #1 on GitHub, the owner's local `main` (`04bf4c1`) has diverged from `origin/main`. A non-destructive way to align it:

```powershell
git fetch origin
git branch -m main old-main-04bf4c1     # keeps the old commit; nothing is deleted
git switch -c main --track origin/main
```

Never use `git add .` in this folder: `submission2/` and `submission3/` hold unpublished reports; stage exact paths only.
