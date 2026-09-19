# Software Requirements

The wording below keeps each requirement focused on one system service/constraint and uses `shall` for traceability.

## A. Functional Requirements

### Student-facing

- **FR-01 - View Hub state:** The system shall allow a student to view Mobility Hubs and their current resource state.
- **FR-02 - Find suitable mobility resources:** The system shall allow a student to find a suitable Hub and shared electric vehicle for a journey using current resource state.
- **FR-03 - View vehicle state:** The system shall allow a student to view vehicle availability and battery level.
- **FR-04 - Reserve shared vehicle:** The system shall allow a student to reserve an available shared electric vehicle. A successful reservation shall temporarily hold the vehicle for that user; if the hold expires before pickup, the reservation shall become expired and the vehicle shall become available again.
- **FR-05 - Reserve parking:** The system shall allow a student to reserve an available parking space at a selected Hub.
- **FR-06 - Pick up shared vehicle:** The system shall allow a student with a valid reservation to pick up the reserved shared vehicle.
- **FR-07 - Return shared vehicle:** The system shall allow a student to return a shared vehicle to a Hub with available parking capacity.
- **FR-08 - Submit charging request:** The system shall allow a student to submit a charging request.
- **FR-09 - Private EV parking/charging:** The system shall allow a student using a privately owned EV to reserve parking and schedule a charging session at a selected Hub.

### Operator-facing

- **FR-10 - Monitor network:** The system shall allow an operator to monitor the overall Mobility Hub network.
- **FR-11 - Monitor resources:** The system shall allow an operator to monitor vehicle and charging-point status.
- **FR-12 - Capacity risk:** The system shall identify Hubs that are approaching their capacity limits using the current system state.
- **FR-13 - Redistribute vehicles:** The system shall support the operator in coordinating vehicle redistribution between Hubs.
- **FR-14 - Handle incidents:** The system shall support handling operational incidents including vehicle failures and unavailable charging points.
- **FR-15 - Smart charging scheduling:** The system shall support charging schedules that can give higher priority to vehicles with low battery levels or upcoming usage requirements.
- **FR-16 - Run what-if simulation:** The system shall allow an operator to evaluate a hypothetical operating scenario using the current network state as the starting point.
- **FR-17 - Evaluate simulation impact:** The system shall evaluate how a simulated scenario affects service capacity and network state.
- **FR-18 - Coordination recommendations:** The system shall provide appropriate coordination recommendations after a simulation, such as vehicle redistribution, charging schedule adjustment, or redirection to an alternative Hub.

### System-wide

- **FR-19 - State updates:** The system shall update vehicle, parking, charging, and operational-event state from simulated input data for the MVP.
- **FR-20 - Interface mode:** The system shall allow supported users to customize the interface mode.

## B. General Non-Functional Requirements

The lecturer slides distinguish non-functional requirements as system properties/constraints and emphasize measurable/verifiable wording. The assignment does not provide numerical thresholds, so unresolved values are marked as team decisions instead of being invented.

- **NFR-01 - Status update timeliness:** A simulated state update shall become visible in the user interface within **[TEAM_DECISION: maximum update delay]**.
- **NFR-02 - Reservation consistency:** The system shall prevent two successful active reservations from allocating the same shared vehicle at the same time.
- **NFR-03 - Capacity consistency:** The system shall not confirm parking or charging allocation beyond the configured capacity of a Hub.
- **NFR-04 - Demonstrability:** The MVP shall support the required workflows using simulated/hard-coded data without requiring a backend database.
- **NFR-05 - UI clarity:** The team shall define a measurable acceptance criterion for whether the main student and operator workflows can be completed through the mockup/MVP. **[TEAM_DECISION: criterion]**.

## C. Requirements intentionally not added

The source material does not require login, payment, real GPS navigation, a 3D map, cloud infrastructure, or machine-learning prediction. They must not be treated as project requirements unless the lecturer later changes the scope.
