# Smart E-Mobility Hub

Course project for **Software Engineering (CO3001) – HK261, class L03, group 13**.

A static web MVP that coordinates shared electric vehicles, parking capacity and charging resources across the VNU-HCM urban area. It is built with **plain HTML, CSS and JavaScript ES modules**, uses **simulated in-memory data** and needs **no backend, database, account or build step**, as permitted by the assignment.

## Run the demo (Windows PowerShell)

From the repository root (the folder that contains `index.html`):

```powershell
python -m http.server 5173 --bind 127.0.0.1
```

Open **http://127.0.0.1:5173/** (Vietnamese by default; switch with *VI / EN*). Use **Đặt lại dữ liệu / Reset data** or reload the page to restore the seed data. Stop the server with Ctrl+C.
For the reservation-expiry demo, open `http://127.0.0.1:5173/?holdSeconds=20` (default hold: 15 minutes).

Presenter material (Vietnamese): [start here](docs/demo/START_HERE.md) · [8–12 minute demo script](docs/demo/DEMO_SCRIPT_8_TO_12_MIN.md) · [checklist](docs/demo/DEMO_CHECKLIST.md) · [test evidence](docs/demo/DEMO_EVIDENCE.md) · [lecturer FAQ](docs/demo/FAQ_FOR_LECTURER.md)

## Reports

| Submission | File |
|---|---|
| Submission #2 – requirements, use cases, activity/sequence diagrams, UI mockups | [submission2/Phase2_L03_13.pdf](submission2/Phase2_L03_13.pdf) |
| Submission #3 – architecture, class and method design (submitted version) | [submission3/L03_13 (1).pdf](<submission3/L03_13 (1).pdf>) |

## What the MVP demonstrates

| Page | Requirements | What can be done |
|---|---|---|
| Student · Find & reserve | FR-01..FR-04, FR-06, FR-07 | Hub overview, vehicle search by Hub/battery/free charger/free parking, hold with live countdown, cancel, pick up, return to a Hub with capacity |
| Student · Parking & charging | FR-05, FR-08, FR-09 | Hold/release parking spaces; charging requests for shared vehicles and private EVs; a free charger is assigned immediately by priority |
| Operator · Network monitor | FR-10..FR-13 | KPIs, Hubs ranked by parking utilization, redistribution suggestion and coordination, fleet status |
| Operator · Smart charging | FR-15 | Chargers and sessions, priority queue (needed soon first, then lowest battery), finish a session to hand the charger to the next request |
| Operator · Incidents | FR-14 | Report vehicle failures and charger outages, then mark repaired / restore to put them back in service |
| Operator · What-if simulation | FR-16..FR-18 | Five assignment scenarios on a copy of the live state with before/after impact and recommendations |
| Top bar | FR-19, FR-20 | Manual and 15-second automatic simulated updates; Light/Dark and VI/EN |

Out of scope by design: login/accounts, payment, real GPS/IoT, 3D maps, cloud services and a mandatory database. Known limitations are listed in the [lecturer FAQ](docs/demo/FAQ_FOR_LECTURER.md#10-hạn-chế-và-đánh-đổi-đã-biết).

## Tests

```powershell
npm test                                  # Node built-in test runner, no dependencies to install
python tests/e2e/browser_acceptance.py    # optional real-browser run (pip install playwright; uses Chrome/Edge)
```

Latest recorded results: [docs/demo/DEMO_EVIDENCE.md](docs/demo/DEMO_EVIDENCE.md). Manual acceptance cases: [tests/ACCEPTANCE_TESTS.md](tests/ACCEPTANCE_TESTS.md).

## Repository map

```text
index.html                 application shell, page sections and static controls
src/main.js                event wiring and routing (controller)
src/ui/                    shell rendering, student/operator views, VI/EN text
src/services/              business rules: hub, reservation, charging, operator, what-if, simulator
src/domain/, src/state/    statuses, result objects, ids, in-memory store
src/data/                  simulated seed data
tests/unit/                automated checks (npm test)
tests/e2e/                 optional browser acceptance script
docs/                      specification, architecture, decisions, traceability
docs/demo/                 demo package and screenshots
submission2/, submission3/ published reports and UC-04 diagrams
```

## Project documents

- [Project specification](docs/PROJECT_SPEC.md) · [Requirements FR/NFR](docs/REQUIREMENTS.md) · [Use-case catalog](docs/USE_CASE_CATALOG.md) · [UC-04 detail](docs/UC-04_RESERVE_SHARED_VEHICLE.md)
- [Architecture](docs/ARCHITECTURE.md) · [Design decisions](docs/DECISIONS.md) · [Traceability](docs/TRACEABILITY.md) · [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Source grounding](docs/SOURCE_GROUNDING.md) · [Generative AI usage declaration](docs/AI_USAGE_DECLARATION.md) · [Submission #1 checklist](docs/SUBMISSION_1_CHECKLIST.md) and [template](docs/SUBMISSION_1_REPORT_TEMPLATE.md)
- [Release manifest](docs/RELEASE_MANIFEST.md) (which files are published, kept local or ignored) · [Release summary](docs/RELEASE_SUMMARY.md)
