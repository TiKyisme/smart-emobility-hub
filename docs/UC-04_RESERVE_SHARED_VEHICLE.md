# UC-04 - Reserve Shared Vehicle

| Field | Detail |
|---|---|
| Use Case ID | UC-04 |
| Use Case Name | Reserve Shared Vehicle |
| Primary Actor | Shared Vehicle User |
| Created By | Team |
| Last Updated By | Team |
| Date Created | 2026-09-19 |
| Date Last Updated | 2026-09-19 |
| Actors | Shared Vehicle User |
| Description | The Shared Vehicle User temporarily holds an available shared electric vehicle before pickup. |
| Trigger | The user selects an available shared vehicle and requests a reservation. |
| Preconditions | The selected vehicle exists and is `AVAILABLE`. The user's identity is assumed as an existing precondition for this MVP; authentication/account management is not implemented as a separate use case. |
| Postconditions | On success, one reservation is `ACTIVE`, the reservation contains `createdAt` and `expiresAt`, and the vehicle is `RESERVED` for that user. If the hold expires before pickup, the reservation becomes `EXPIRED` and the vehicle becomes `AVAILABLE`. |
| Normal Flow | 1. The user views vehicle availability. 2. The user selects a vehicle. 3. The system checks that the vehicle is still `AVAILABLE`. 4. The system records the user, vehicle, `createdAt`, and `expiresAt` using the configurable `RESERVATION_HOLD_DURATION_MS` MVP value. 5. The system changes the vehicle to `RESERVED`. 6. The system shows the active reservation and expiry time. |
| Alternative Flows | If the hold has expired before another reservation request, the system processes the expiry first, releases the vehicle, and may accept the new reservation. If a different user already holds the vehicle, the request is rejected. |
| Exceptions | Vehicle not found; vehicle is not `AVAILABLE`; the requested hold cannot be allocated without violating reservation consistency. |
| Notes and Issues | Pickup is handled by UC-06 and requires the same user's active, non-expired reservation. Return is handled by UC-07. `IN_USE` and `COMPLETED` reservations are never expired by the hold-expiry process. The exact hold duration is an MVP team decision because the assignment does not specify one. |

Authentication is only an assumed precondition for identifying the Shared Vehicle User in this MVP. It is not implemented as a separate use case or feature.
