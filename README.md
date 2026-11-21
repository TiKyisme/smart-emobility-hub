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

Every page is a use case of the whole-system diagram in the reports, grouped by actor; in English the page names are the use-case names. Use case ↔ web ↔ report mapping: [docs/UC_UI_PDF_SYNC.md](docs/UC_UI_PDF_SYNC.md) (Vietnamese).

| Actor | Page (use case) | Requirements | What can be done |
|---|---|---|---|
| Shared Vehicle User | Find Suitable Hub / Vehicle (UC-02) | FR-01..FR-03 | Hubs within a radius of a chosen location (nearest first), parking near the destination, vehicle type and battery filters |
| Shared Vehicle User | Reserve Shared Vehicle (UC-04, UC-06, UC-07) | FR-04, FR-06, FR-07 | Confirmation step, confirmed reservation with ID/expiry/countdown, expiry, cancel, pick up, return, reservation history; E2/E3 demonstrations |
| Student | Reserve Parking Space (UC-05) | FR-05 | Hold/release parking spaces within capacity |
| Private EV Owner | Schedule Private EV Charging (UC-08, UC-09) | FR-08, FR-09 | Hub + date + one-hour slot, availability check, review and confirm, other slots/Hubs when full, session status and completion notice |
| Operator | Monitor Network Status (UC-11..UC-13) | FR-10..FR-12 | KPIs, configurable overload/shortage alerts, Hubs by utilization, fleet |
| Operator | Manage Smart Charging (UC-16) | FR-15 | Ports, schedule per slot, priority (early departure or battery < 20 %), add shared vehicles, move/cancel, finish, optimize |
| Operator | Redistribute Vehicles (UC-14) | FR-13 | Plan from alerts, redistribution tasks for the dispatch staff, tracking |
| Vehicle Dispatch Staff | Execute Redistribution Task | FR-13 | Start and complete assigned tasks |
| Operator | Handle Operational Incident (UC-15) | FR-14 | Record, confirm and classify, confirm unavailable, assign to maintenance or restore operationally, status counts |
| Maintenance Staff | Resolve Assigned Incident | FR-14 | Start and complete assigned repairs, resource back in service |
| Operator | Run What-if Simulation (UC-17, UC-18) | FR-16..FR-18 | Five templates with target Hub, demand increase, offline ports and horizon; impact cards; typed recommendations; save and apply |
| Data Simulator, all | top bar (UC-20, UC-10/19) | FR-19, FR-20 | Manual and 15-second automatic simulated updates; Light/Dark and VI/EN |

Out of scope by design: login/accounts, payment, real GPS/IoT, 3D maps, cloud services and a mandatory database. Known limitations are listed in the [lecturer FAQ](docs/demo/FAQ_FOR_LECTURER.md#13-hạn-chế-và-đánh-đổi-đã-biết).

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
src/ui/                    shell rendering, one view module per actor area, VI/EN text
src/services/              business rules: hub, reservation, charging, operator, what-if, simulator
src/domain/, src/state/    statuses, actors, time slots, distances, entity rules, in-memory store
src/data/                  simulated seed data
tests/unit/                automated checks (npm test)
tests/e2e/                 optional browser acceptance script
docs/                      specification, architecture, decisions, traceability
docs/demo/                 demo package and screenshots
submission2/, submission3/ published reports and UC-04 diagrams
```

## Project documents

- [Project specification](docs/PROJECT_SPEC.md) · [Requirements FR/NFR](docs/REQUIREMENTS.md) · [Use-case catalog](docs/USE_CASE_CATALOG.md) · [UC-04 detail](docs/UC-04_RESERVE_SHARED_VEHICLE.md)
- [Use case ↔ web ↔ report synchronization](docs/UC_UI_PDF_SYNC.md) · [Architecture](docs/ARCHITECTURE.md) · [Design decisions](docs/DECISIONS.md) · [Traceability](docs/TRACEABILITY.md) · [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Source grounding](docs/SOURCE_GROUNDING.md) · [Generative AI usage declaration](docs/AI_USAGE_DECLARATION.md) · [Submission #1 checklist](docs/SUBMISSION_1_CHECKLIST.md) and [template](docs/SUBMISSION_1_REPORT_TEMPLATE.md)
- [Release manifest](docs/RELEASE_MANIFEST.md) (which files are published, kept local or ignored) · [Release summary](docs/RELEASE_SUMMARY.md)
