# Design Decisions

Record only decisions needed to resolve ambiguity. Do not use this file to invent new requirements.

| ID | Decision | Reason | Requirement impact |
|---|---|---|---|
| D-001 | The MVP uses simulated in-memory data and no backend database. | Explicitly permitted by assignment. | FR-19, NFR-04 |
| D-002 | The implementation uses a simple layered module organization in plain HTML/CSS/JavaScript. | Layered architecture is present in lecturer slides and supports a small demonstrable MVP without unnecessary infrastructure. | All |
| D-003 | The page uses a fixed `STUDENT-DEMO` identity for student actions; authentication and account management are not implemented. | Student workflows need an actor identifier for reservation ownership, while account management is explicitly out of scope. | FR-04..FR-09, NFR-04 |
| D-004 | Active parking reservations hold capacity separately from physical occupancy; both are included when deciding whether another space can be allocated or a Hub is at risk. | The specifications require capacity-safe reservation and return behavior but do not define whether reserved spaces are included in the occupancy field. This keeps the invariant explicit without changing simulated physical state. | FR-05, FR-07, FR-12, NFR-03 |
| D-005 | Manual simulated updates are immediate; optional automatic updates run every 15 seconds and show the latest simulator message in the UI. | NFR-01 leaves the maximum delay for team decision, and a short deterministic cadence makes near-real-time behavior demonstrable without external hardware. | FR-19, NFR-01 |
| D-006 | UI clarity is accepted when the main Student and Operator flows are available on one page, each action has visible success/failure feedback, and the resulting resource state is rendered immediately. | NFR-05 requires a measurable team criterion but does not supply one. | NFR-05, all workflows |
| D-007 | The shared-vehicle hold duration is configurable through `RESERVATION_HOLD_DURATION_MS`; the MVP default is 15 minutes. | The assignment requires expiry but does not specify an exact duration, so the value is an explicit team decision rather than a lecturer-provided threshold. | FR-04, NFR-02 |
