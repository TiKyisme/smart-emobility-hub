# Manual Acceptance Tests

These tests are directly tied to the documented requirements and are intended for MVP demonstration/verification.

- **AT-01 (FR-01):** Open the app and verify all configured Hubs show parking, available vehicle, and charging-point state.
- **AT-02 (FR-02):** Search/filter for a suitable available vehicle/Hub and verify only matching resources are returned.
- **AT-03 (FR-03):** Verify each shared vehicle view shows availability/status and battery level.
- **AT-04 (FR-04 / UC-04):** Reserve an available vehicle; verify the reservation records `createdAt` and `expiresAt`, the vehicle becomes `reserved`, and the active hold is visible with its expiry time. Repeat for the same vehicle with a second user; the second active allocation must fail. After the configured hold expires before pickup, verify the reservation becomes `expired` and the vehicle becomes `available` again.
- **AT-05 (FR-05):** Reserve parking at a Hub with capacity; verify success. Attempt at a full Hub; verify rejection.
- **AT-06 (FR-06):** Pick up a vehicle with an active, non-expired reservation belonging to the selected student; verify status changes to in-use. Attempt pickup with no active reservation, the wrong student, or an expired reservation; verify rejection.
- **AT-07 (FR-07):** Return an in-use vehicle to a Hub with parking capacity; verify the vehicle location/status and parking state update and the reservation completes normally. Attempt at a full Hub; verify rejection.
- **AT-08 (FR-08):** Submit a charging request and verify it enters the charging queue.
- **AT-09 (FR-09):** For a private EV, reserve parking and schedule charging at a selected Hub.
- **AT-10 (FR-10):** Operator view shows the complete configured Hub network state.
- **AT-11 (FR-11):** Operator view shows vehicle and charging-point status.
- **AT-12 (FR-12):** Make one Hub full/high utilization and verify it becomes the top capacity risk.
- **AT-13 (FR-13):** Verify the operator can obtain/show a vehicle redistribution recommendation based on network state.
- **AT-14 (FR-14):** Mark a vehicle failed and a charging point unavailable; verify incident/state updates are visible.
- **AT-15 (FR-15):** Queue charging requests with different battery/upcoming-usage attributes; verify low battery/upcoming usage can receive higher scheduling priority.
- **AT-16 (FR-16):** Run each supported what-if scenario from current live state.
- **AT-17 (FR-17):** Verify simulation output shows changed hypothetical state/capacity impact.
- **AT-18 (FR-18):** Verify simulation output shows a relevant coordination recommendation where applicable.
- **AT-19 (FR-19):** Trigger a simulated data update and verify the visible state changes without reload/manual source editing.
- **AT-20 (FR-20):** Toggle interface mode and verify the display mode changes.

## How these cases are executed

- **Automated service and page checks:** `npm test` (Node built-in test runner, no dependencies) runs `tests/unit/*.test.js`, including the failure paths that need a second student or a fixed clock (AT-04 second user, AT-06 wrong student / expired hold).
- **Automated browser run:** `python tests/e2e/browser_acceptance.py` drives the real page in Chrome or Edge (optional dev tool: `pip install playwright`). Each scenario reloads the page so the in-memory state starts from the seed data.
- **Manual walk-through:** `docs/demo/DEMO_CHECKLIST.md` lists the same cases as clickable steps with expected results; results of the latest runs are recorded in `docs/demo/DEMO_EVIDENCE.md`.
- The demo identity is fixed (D-003), so the UI hides actions that belong to another student; the service-level rejection is covered by the automated checks.
