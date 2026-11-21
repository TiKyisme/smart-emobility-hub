# Architecture

## 1. Course grounding

The lecturer slides present multiple architectural views (4+1) and architectural patterns including MVC and Layered Architecture. This repository uses a simple **layered organization** because it maps cleanly to the small MVP and keeps responsibilities separated without adding unnecessary infrastructure.

## 2. Repository layers

### Presentation / UI layer

`index.html`, `src/main.js`, `src/ui/`

Responsibilities:

- application shell with a sidebar of eleven pages, one per use case of the Submission #1 diagram and grouped by actor (Student portal, Operator portal, Field staff), selected through the URL hash (`#find`, `#reserve`, `#parking`, `#evcharge`, `#network`, `#charging`, `#redistribution`, `#incidents`, `#whatif`, `#dispatch`, `#maintenance`) — `src/ui/render.js`;
- Student portal views: Find Suitable Hub / Vehicle (`ui/views/search.js`), Reserve Shared Vehicle (`ui/views/trip.js`), Reserve Parking Space and Schedule Private EV Charging (`ui/views/studentServices.js`);
- Operator portal views: Monitor Network Status, Manage Smart Charging, Redistribute Vehicles (`ui/views/operator.js`), Handle Operational Incident (`ui/views/incidents.js`), Run What-if Simulation (`ui/views/whatif.js`);
- Field staff views: Execute Redistribution Task, Resolve Assigned Incident (`ui/views/staff.js`);
- collect user interaction and call services (`src/main.js`, one delegated click handler for every `data-action` button);
- display current state, short success/error notifications (toast), recommendations and simulation results;
- interface mode: Light/Dark and VI/EN text (`src/ui/i18n.js`, D-011); shared markup helpers in `src/ui/dom.js`.

View functions carry the boundary-class method names of the Submission #3 design where one exists (for example `displayNearbyHubs`, `showReservationResult`, `displayBookingDetails`, `displayIncidentDetails`, `renderSetupForm`).

### Application / Business Services layer

`src/services/`

Responsibilities:

- Hub search by location and radius, vehicle filters, resource availability (`hubService.js`);
- reservation workflow: confirmation, hold, expiry, cancel, pickup, return, parking holds, trip history (`reservationService.js`);
- charging time slots, availability check, booking, automatic priority allocation per slot, schedule, optimization, completion (`chargingService.js`);
- operator monitoring and alert thresholds, redistribution orders for the dispatch staff, incident lifecycle and maintenance tasks (`operatorService.js`);
- what-if simulation: parameter validation, run on a copy, impact, recommendations, scenario library (`simulationService.js`);
- Data Simulator: periodic state updates and the exception demonstrations (`simulatorService.js`).

Every service returns a result object `{ ok, code, params, message }` (`src/domain/result.js`). The `code` lets the presentation layer show the outcome in English or Vietnamese; the services themselves contain no presentation logic.

### Domain / State layer

`src/domain/` and `src/state/`

Responsibilities:

- statuses and result/identifier helpers (`status.js`, `result.js`, `ids.js`);
- demo identities of the actors (`actors.js`), time slots (`time.js`), distances (`geo.js`) and entity operations such as `changeStatus`, `getBatteryLevel`, `isOperational` (`vehicle.js`);
- live application state in a page-local store (`store.js`);
- state mutation through explicit service operations; subscribers re-render after each update.

### Data / Simulation layer

`src/data/`

Responsibilities:

- initial simulated data: 12 Mobility Hubs and other campus places with simulated coordinates, typed vehicles, charging ports and the seeded charging session;
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

- `tests/unit/*.test.js` — Node built-in test runner (`npm test`), no dependencies: service rules (including the TC-UC04-01..11 cases of the Submission #3 appendix), i18n completeness, navigation names equal to the use-case names, DOM hooks and actions, square-corner style rule and `node --check` of every module.
- `tests/e2e/browser_acceptance.py` — optional Playwright run against the real page in Chrome/Edge, covering AT-01..AT-22, the alternative and exception flows of the five detailed use cases, and a replay of the demo script.
- `tests/ACCEPTANCE_TESTS.md` — the manual acceptance cases.
