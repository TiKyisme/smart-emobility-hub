# Implementation Plan

The implementation order follows the lecturer's rule: requirements -> design -> implementation -> testing.

## Phase 0 - Freeze Submission #1 specification

Before feature coding diverges from the report:

- confirm actors and whole-system use-case list;
- confirm project context/objectives/scope;
- confirm FR/NFR IDs;
- resolve `[TEAM_DECISION]` placeholders.

## Phase 1 - Domain state and Student read flows

Implement:

- Hub list/state;
- vehicle list, availability, battery;
- find suitable Hub/vehicle.

Target: FR-01..FR-03.

## Phase 2 - Reservation lifecycle

Implement:

- reserve vehicle;
- reserve parking;
- pickup;
- return;
- capacity and status checks.

Target: FR-04..FR-07.

## Phase 3 - Charging

Implement:

- charging request;
- private EV charging session;
- charging capacity checks;
- priority scheduling based on low battery/upcoming usage.

Target: FR-08, FR-09, FR-15.

## Phase 4 - Operator operations

Implement:

- network monitoring;
- capacity risk display;
- incident handling;
- vehicle redistribution coordination.

Target: FR-10..FR-14.

## Phase 5 - What-if simulation

Implement the assignment-provided scenarios without mutating live state by default. Produce impact summary and recommendations.

Target: FR-16..FR-18.

## Phase 6 - System-wide behavior

Implement:

- simulated state update action/timer;
- interface mode customization;
- consistency checks and demo polish.

Target: FR-19, FR-20 and NFRs.

## Phase 7 - Verification and demonstration

Run all manual acceptance cases in `tests/ACCEPTANCE_TESTS.md`. Prepare a short end-to-end demo sequence that shows both Student and Operator workflows.
