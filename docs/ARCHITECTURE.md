# Architecture

## 1. Course grounding

The lecturer slides present multiple architectural views (4+1) and architectural patterns including MVC and Layered Architecture. This repository uses a simple **layered organization** because it maps cleanly to the small MVP and keeps responsibilities separated without adding unnecessary infrastructure.

## 2. Repository layers

### Presentation / UI layer

`index.html`, `src/main.js`, `src/ui/`

Responsibilities:

- application shell with a sidebar for the two portals and six pages, selected through the URL hash (`#find`, `#services`, `#network`, `#charging`, `#incidents`, `#whatif`) — `src/ui/render.js`;
- Student portal views: Find & reserve, Parking & charging — `src/ui/views/student.js`;
- Operator portal views: Network monitor, Smart charging, Incidents, What-if — `src/ui/views/operator.js`;
- collect user interaction and call services (`src/main.js`, one delegated click handler per action);
- display current state, short success/error notifications (toast), recommendations and simulation results;
- interface mode: Light/Dark and VI/EN text (`src/ui/i18n.js`, D-011); shared markup helpers in `src/ui/dom.js`.

### Application / Business Services layer

`src/services/`

Responsibilities:

- find suitable resources (`hubService.js`);
- reservation workflow: hold, expiry, cancel, pickup, return, parking holds (`reservationService.js`);
- charging requests, automatic priority allocation, session completion, cancellation (`chargingService.js`);
- operator monitoring, capacity risk, incidents and their resolution, redistribution (`operatorService.js`);
- what-if simulation orchestration (`simulationService.js`);
- simulated state updates (`simulatorService.js`).

Every service returns a result object `{ ok, code, params, message }` (`src/domain/result.js`). The `code` lets the presentation layer show the outcome in English or Vietnamese; the services themselves contain no presentation logic.

### Domain / State layer

`src/domain/` and `src/state/`

Responsibilities:

- statuses and result/identifier helpers (`status.js`, `result.js`, `ids.js`);
- live application state in a page-local store (`store.js`);
- state mutation through explicit service operations; subscribers re-render after each update.

### Data / Simulation layer

`src/data/`

Responsibilities:

- initial simulated Hub/vehicle/parking/charging data;
- deterministic demo input.

## 3. 4+1 mapping for later submissions

The course slides map views to UML artifacts as follows:

- **Logical view:** Class Diagram, Sequence Diagram.
- **Process view:** Activity Diagram.
- **Development view:** Component Diagram / Package Diagram.
- **Physical view:** Deployment Diagram.
- **Scenarios (+1):** Use Cases.

The group should keep future diagrams consistent with the repository instead of independently inventing a second design.

**Design-level vs code-level.** The class diagrams name classes such as `ReservationManager`, `ChargingScheduler`, `SimulationEngine` or `NetworkDatabase`. In the MVP these are realized as ES modules with exported functions (for example `ChargingScheduler` → `src/services/chargingService.js`) and the "database" abstraction is the in-memory store `src/state/store.js`. No database, server or network API exists in the executable code.

## 4. Development view candidate

At a high level:

```text
Browser
  -> Presentation/UI   (index.html, main.js, ui/render.js, ui/views/*.js, ui/i18n.js, ui/dom.js)
  -> Business Services (services/*.js)
  -> Domain State      (domain/*.js, state/store.js)
  -> Simulated Data    (data/simulatedData.js)
```

## 5. Deployment view candidate

Because the assignment permits a lightweight MVP with hard-coded data, the minimal deployment is a browser loading static HTML/CSS/JavaScript from a local/static web server (for the demo: `python -m http.server 5173 --bind 127.0.0.1`). No backend database is required. Each browser tab holds its own independent in-memory state; a reload resets it.

## 6. Verification

- `tests/unit/*.test.js` — Node built-in test runner (`npm test`), no dependencies: service rules, i18n completeness, DOM hooks, navigation, square-corner style rule and `node --check` of every module.
- `tests/e2e/browser_acceptance.py` — optional Playwright run against the real page in Chrome/Edge, covering the demo paths of AT-01..AT-20 and replaying the demo script.
- `tests/ACCEPTANCE_TESTS.md` — the manual acceptance cases.
