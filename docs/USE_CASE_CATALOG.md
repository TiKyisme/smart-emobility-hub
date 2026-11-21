# Whole-System Use-Case Catalog

This catalog follows the whole-system use case diagram and the actor list of the Submission #1 report; the identifiers UC-01..UC-20 are the ones used in the Submission #3 traceability table. The web pages carry the same use-case names (sidebar, grouped by actor). Synchronization details: [UC_UI_PDF_SYNC.md](UC_UI_PDF_SYNC.md).

## Actors

| Actor | Role (Submission #1) | Demo identity in the MVP (D-003) |
|---|---|---|
| **Student** | Generalization of the two student actors; reserves parking, customizes the interface | `STUDENT-DEMO` |
| **Shared Vehicle User** (a Student) | Finds, reserves, picks up and returns shared vehicles; views reservation status and trip history | `STUDENT-DEMO` |
| **Private EV Owner** (a Student) | Reserves parking, schedules and follows charging sessions for a private EV | `STUDENT-DEMO` |
| **Operator** | Monitors the network, manages smart charging, redistributes vehicles, handles incidents, runs what-if simulations | `OPERATOR-DEMO` |
| **Vehicle Dispatch Staff** | Executes the redistribution tasks created by the Operator | `DISPATCH-DEMO` |
| **Maintenance Staff** | Resolves the incidents assigned by the Operator | `MAINT-DEMO` |
| **Data Simulator** | Supplies periodic simulated state (battery, parking sensors, port status, events) | top bar: *Update data*, *Auto* |

## Use cases and web pages

| ID | Use case | Primary actor | Web page (sidebar) |
|---|---|---|---|
| UC-01 | View Mobility Hubs (part of Find Suitable Hub / Vehicle) | Shared Vehicle User | Find Suitable Hub / Vehicle |
| UC-02 | **Find Suitable Hub / Vehicle** — detailed in Submissions #1–#3 | Shared Vehicle User | Find Suitable Hub / Vehicle |
| UC-03 | View Vehicle Availability and Battery (part of UC-02) | Shared Vehicle User | Find Suitable Hub / Vehicle |
| — | Check Resource Availability («include» from UC-02, UC-04, UC-05) | — | shared rule (`checkResourceAvailability`, `getAvailableSlotsCount`, `getCurrentStatus`) |
| UC-04 | **Reserve Shared Vehicle** — detailed | Shared Vehicle User | Reserve Shared Vehicle |
| UC-05 | Reserve Parking Space | Student | Reserve Parking Space |
| UC-06 | Pick Up Shared Vehicle | Shared Vehicle User | Reserve Shared Vehicle (next step) |
| UC-07 | Return Shared Vehicle (with reservation status / trip history) | Shared Vehicle User | Reserve Shared Vehicle (next step, history) |
| UC-08 | Submit Charging Request — for the private EV (FR-PEV-2) | Private EV Owner | Schedule Private EV Charging |
| UC-09 | **Schedule Private EV Charging** — detailed (with View Charging Status) | Private EV Owner | Schedule Private EV Charging |
| UC-10 | Customize Interface Mode (student) | Student | top bar |
| UC-11 | Monitor Network Status | Operator | Monitor Network Status |
| UC-12 | Monitor Vehicle / Charging-Point Status | Operator | Monitor Network Status (fleet), Manage Smart Charging (ports) |
| UC-13 | Identify Hub Capacity Risk (configured alert thresholds) | Operator | Monitor Network Status (alerts) |
| UC-14 | Redistribute Vehicles | Operator | Redistribute Vehicles |
| — | Execute Redistribution Task | Vehicle Dispatch Staff | Execute Redistribution Task |
| UC-15 | **Handle Operational Incident** — detailed (UC-12 in Submission #2, standardized as UC-15 in Submission #3) | Operator | Handle Operational Incident |
| — | Resolve Assigned Incident | Maintenance Staff | Resolve Assigned Incident |
| UC-16 | Manage Smart Charging | Operator | Manage Smart Charging |
| UC-17 | **Run What-if Simulation** — detailed | Operator | Run What-if Simulation |
| UC-18 | Review / apply coordination recommendations (part of UC-17) | Operator | Run What-if Simulation |
| UC-19 | Customize Interface Mode (operator) | Operator | top bar |
| UC-20 | Synchronize Resource State | Data Simulator | top bar (*Update data*, *Auto*) |

The two staff use cases and the included *Check Resource Availability* have no number in the reports; they are listed without one here as well.

## Assignment-provided what-if scenarios

The scenario templates represent:

- sudden increase in student arrivals at the Metro station during peak hours;
- a Mobility Hub reaching full parking capacity;
- surge in charging demand;
- partial charging-point failures;
- excessive concentration of vehicles at a location.

Each template takes the parameters of the Submission #2 mockup: target Hub, expected demand increase (%), simulated offline charging ports and time horizon.

## Detailed use-case scenario template

For each group member's individual use case, use the lecturer's tabular fields:

- Use Case ID
- Use Case Name
- Created By
- Last Updated By
- Date Created
- Date Last Updated
- Actors
- Description
- Trigger
- Preconditions
- Postconditions
- Normal Flow
- Alternative Flows
- Exceptions
- Notes and Issues

Do not fabricate relationships such as `include` or `extend` merely to make the diagram look complex. Add a relationship only when the team can explain its meaning consistently with the modeled behavior.
