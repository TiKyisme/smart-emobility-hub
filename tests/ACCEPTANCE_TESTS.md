# Manual Acceptance Tests

These tests are directly tied to the documented requirements and the use cases of the submitted reports, and are intended for MVP demonstration/verification. Page names are the sidebar entries (= use-case names).

- **AT-01 (FR-01):** On *Find Suitable Hub / Vehicle*, verify the Hubs in the radius show distance, free parking, available vehicles and free charging ports.
- **AT-02 (FR-02 / UC-02):** From a location and radius, verify only Hubs inside the radius are listed, nearest first; filter by vehicle type and minimum battery and verify only matching available vehicles are returned. Verify E1 (no Hub in the radius), E2 (no location chosen) and an invalid radius are reported.
- **AT-03 (FR-03):** Verify each listed vehicle shows its type, battery level and estimated range.
- **AT-04 (FR-04 / UC-04):** Select a vehicle, verify the confirmation step shows Hub, status and battery; *Cancel* creates nothing (A1). Confirm and verify the reservation shows its ID, `createdAt`, `expiresAt`, the holder and a countdown, and the vehicle becomes *Reserved*. A second user on the same vehicle must fail (E3). After the configured hold expires before pickup, verify the reservation becomes *Expired* and the vehicle *Available* (A3). An unreadable vehicle state creates nothing and asks to retry (E2).
- **AT-05 (FR-05 / UC-05):** Reserve parking at a Hub with capacity; verify success. Attempt at a full Hub; verify rejection. Release a hold.
- **AT-06 (FR-06):** Pick up a vehicle with an active, non-expired reservation belonging to the student; verify status changes to *In use*. Attempt pickup with no active reservation, the wrong student, or an expired reservation; verify rejection.
- **AT-07 (FR-07):** Return an in-use vehicle to a Hub with parking capacity; verify vehicle location/status, parking state and the completed entry in the reservation history. Attempt at a full Hub; verify rejection.
- **AT-08 (FR-08):** On *Schedule Private EV Charging*, submit a request (Hub, date, time slot, plate, battery) and verify the booking details are shown for confirmation; *Cancel* books nothing (A3).
- **AT-09 (FR-09 / UC-09):** Confirm a booking; verify *Scheduled* for a later slot or *Charging* on a port for the current slot. For a full slot verify other slots and Hubs are offered (A1); for a Hub without working ports verify E1; for unreadable port status verify E2. Verify the completion notice when the session ends.
- **AT-10 (FR-10):** *Monitor Network Status* shows KPIs and the state of all 12 Hubs.
- **AT-11 (FR-11):** The operator sees vehicle status (fleet) and charging-port status (*Manage Smart Charging*).
- **AT-12 (FR-12):** Verify alerts for overload and vehicle shortage at the configured thresholds; change the thresholds and verify the alerts change.
- **AT-13 (FR-13):** On *Redistribute Vehicles*, verify a plan based on network state and create a redistribution task from it or manually; cancel a task that has not started.
- **AT-14 (FR-14 / UC-15):** Record an incident for a vehicle and for a charging port; confirm and classify it; take the resource out of service; assign it to the Maintenance Staff or restore it through an operational action; verify the status counts New / Assigned / In progress / Resolved.
- **AT-15 (FR-15):** On *Manage Smart Charging*, verify requests with low battery or early departure receive higher priority, a booking can be moved or cancelled, a session can be finished and the port goes to the next request.
- **AT-16 (FR-16 / UC-17):** Run each scenario template with its parameters from the current live state; verify invalid parameters are refused.
- **AT-17 (FR-17):** Verify the impact cards (current → simulated, critical / warning / surplus) and that live data is unchanged.
- **AT-18 (FR-18):** Verify typed recommendations; save the scenario; apply the recommendations and verify the created tasks.
- **AT-19 (FR-19):** Trigger a simulated data update and verify the visible state changes without reload/manual source editing.
- **AT-20 (FR-20):** Toggle interface mode and language and verify the display changes.
- **AT-21 (FR-13, Execute Redistribution Task):** As the Vehicle Dispatch Staff, start and complete an assigned task; verify the vehicle and both Hubs are updated.
- **AT-22 (FR-14, Resolve Assigned Incident):** As the Maintenance Staff, start and complete an assigned incident; verify the incident is resolved and the resource is back in service.

## Proposed UC-04 test cases of the Submission #3 report

| Report case | Automated check |
|---|---|
| TC-UC04-01 … TC-UC04-11 | `tests/unit/reservationService.test.js` (tests named after each case); TC-UC04-09 also in the browser run (S2) |

## How these cases are executed

- **Automated service and page checks:** `npm test` (Node built-in test runner, no dependencies) runs `tests/unit/*.test.js`, including the failure paths that need a second student or a fixed clock.
- **Automated browser run:** `python tests/e2e/browser_acceptance.py` drives the real page in Chrome or Edge (optional dev tool: `pip install playwright`). Each scenario reloads the page so the in-memory state starts from the seed data.
- **Manual walk-through:** `docs/demo/DEMO_CHECKLIST.md` lists the same cases as clickable steps with expected results; results of the latest runs are recorded in `docs/demo/DEMO_EVIDENCE.md`.
