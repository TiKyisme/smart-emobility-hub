# UC-04 - Reserve Shared Vehicle

Aligned with the UC-04 table of Submission #1, the activity and sequence diagrams and mockups of Submission #2 and the method descriptions and test cases (TC-UC04-01..11) of Submission #3.

| Field | Detail |
|---|---|
| Use Case ID | UC-04 |
| Use Case Name | Reserve Shared Vehicle |
| Primary Actor | Shared Vehicle User |
| Created By | Team |
| Last Updated By | Team |
| Date Created | 2026-09-19 |
| Date Last Updated | 2026-11-21 |
| Actors | Shared Vehicle User |
| Description | The Shared Vehicle User temporarily holds an available shared electric vehicle before pickup. Before confirming, the system rechecks the vehicle state so that the same vehicle is not reserved successfully by several users. |
| Trigger | The user selects a vehicle in *Find Suitable Hub / Vehicle* and proceeds to the reservation. |
| Preconditions | The selected vehicle exists. The user's identity is assumed (fixed demo identity, D-003); authentication is not a use case of this MVP. The user has no other active trip (D-014). |
| Postconditions | On success, one reservation is `ACTIVE` with `createdAt` and `expiresAt`, and the vehicle is `RESERVED` for that user. If the hold expires before pickup, the reservation becomes `EXPIRED` and the vehicle becomes `AVAILABLE` unless another operational state applies. On failure nothing is created. |
| Normal Flow | 1. The user selects a vehicle (`selectVehicle`). 2. The system shows the vehicle details: Hub, status, battery (`showVehicleDetails`). 3. The user confirms. 4. The system reads the current state (`getCurrentStatus`) and rechecks that the vehicle is still `AVAILABLE`. 5. The system creates the hold if no active hold exists (`createIfFree`) with `RESERVATION_HOLD_DURATION_MS` (15 minutes, ADR-04). 6. The system changes the vehicle to `RESERVED` (`changeStatus`). 7. The system shows the confirmed reservation: ID, status, created at, hold expiry, holder, countdown (`showReservationResult`). 8. The user continues to pickup (UC-06). |
| Alternative Flows | A1. The user cancels before confirming: no reservation is created and the vehicle stays `AVAILABLE`. A2. The user chooses another vehicle and returns to the search. A3. The hold expires before pickup: the reservation becomes `EXPIRED`, the vehicle is released and the user can choose again. The user can also cancel an active hold before pickup. |
| Exceptions | E1. The vehicle is no longer available (charging, failed, in use, being moved): the reservation is refused. E2. The current state cannot be read: nothing is created and the user is asked to retry later. E3. Concurrent reservation conflict (another user already holds the vehicle): the reservation is refused and the user chooses another vehicle. Unknown vehicle: refused without changing the state. |
| Notes and Issues | Pickup is handled by UC-06 and requires the same user's active, non-expired reservation. Return is handled by UC-07. `IN_USE` and `COMPLETED` reservations are never expired by the hold-expiry process. The hold duration is an MVP team decision (D-007); a demo may shorten it with `?holdSeconds=` (D-012). E2 and E3 are demonstrated through the Data Simulator (D-025). |

Authentication is only an assumed precondition for identifying the Shared Vehicle User in this MVP. It is not implemented as a separate use case or feature.
