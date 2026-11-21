# Traceability Matrix

The lecturer slides emphasize traceable, verifiable requirements. This file ties each requirement to its use case, the web page, the design methods named in the Submission #3 traceability table (Table 12) and the automated checks.

Automated checks: `tests/unit/` runs with `npm test` (Node built-in runner); browser checks live in `tests/e2e/browser_acceptance.py` (scenario tags S1–S13; S12 replays the demo script). Use-case IDs follow [USE_CASE_CATALOG.md](USE_CASE_CATALOG.md); note that Table 12 of the Submission #3 report shows UC-10..UC-13 for FR-10..FR-13, which should read UC-11..UC-14 ([UC_UI_PDF_SYNC.md](UC_UI_PDF_SYNC.md#5-lỗi-hoặc-điểm-lệch-nằm-trong-pdf-không-sửa-được-vì-đã-nộp)).

| Requirement | Use case | Web page | Design methods (Table 12) → module | Acceptance | Automated check |
|---|---|---|---|---|---|
| FR-01 | UC-01 | Find Suitable Hub / Vehicle | displayNearbyHubs (`ui/views/search.js`), getAvailableSlotsCount, summarizeHub (`hubService.js`) | AT-01 | `hubService.test.js`; browser S1 |
| FR-02 | UC-02 | Find Suitable Hub / Vehicle | requestNearbyHubs, validateLocation, fetchHubsInRadius, fetchAvailableVehicles (`hubService.js`) | AT-02 | `hubService.test.js`; browser S1 |
| FR-03 | UC-03 | Find Suitable Hub / Vehicle | displayVehicleResults (`ui/views/search.js`), getBatteryLevel (`domain/vehicle.js`) | AT-03 | `hubService.test.js`; browser S1 |
| FR-04 | UC-04 | Reserve Shared Vehicle | reserveVehicle, getCurrentStatus, createIfFree, expireReservations (`reservationService.js`); showVehicleDetails, showReservationResult (`ui/views/trip.js`) | AT-04 | `reservationService.test.js` (TC-UC04-01..11); browser S2, S3 |
| FR-05 | UC-05 | Reserve Parking Space | reserveParkingSpace (`reservationService.js`), getAvailableSlotsCount (`hubService.js`) | AT-05 | `reservationService.test.js`, `hubService.test.js`; browser S4 |
| FR-06 | UC-06 | Reserve Shared Vehicle | pickUpVehicle (`reservationService.js`), changeStatus (`domain/vehicle.js`) | AT-06 | `reservationService.test.js`; browser S2 |
| FR-07 | UC-07 | Reserve Shared Vehicle | returnVehicle, getTripHistory (`reservationService.js`), changeStatus | AT-07 | `reservationService.test.js`; browser S2 |
| FR-08 | UC-08 | Schedule Private EV Charging | createChargingSession (`chargingService.js`) | AT-08 | `chargingService.test.js`; browser S5 |
| FR-09 | UC-09 | Schedule Private EV Charging | checkAvailability, getAvailableSlots, updateChargingAllocation (`chargingService.js`); renderScheduleForm, displayBookingDetails (`ui/views/studentServices.js`) | AT-09 | `chargingService.test.js`, `simulatorService.test.js`; browser S5 |
| FR-10 | UC-11 | Monitor Network Status | renderDashboard (`ui/views/operator.js`), summarizeHub, getNetworkMetrics | AT-10 | `operatorService.test.js`; browser S7 |
| FR-11 | UC-12 | Monitor Network Status, Manage Smart Charging | getBatteryLevel, isOperational (`domain/vehicle.js`, re-exported by `operatorService.js`) | AT-11 | `operatorService.test.js`; browser S6, S7 |
| FR-12 | UC-13 | Monitor Network Status | detectCapacityRisks, identifyBottlenecks, updateAlertThresholds (`operatorService.js`) | AT-12 | `operatorService.test.js`; browser S7 |
| FR-13 | UC-14 + Execute Redistribution Task | Redistribute Vehicles, Execute Redistribution Task | planRedistribution, createRedistributionOrder, start/completeRedistributionTask, applyCoordination (`operatorService.js`) | AT-13, AT-21 | `operatorService.test.js`; browser S8 |
| FR-14 | UC-15 + Resolve Assigned Incident | Handle Operational Incident, Resolve Assigned Incident | recordIncident, classifyIncident, markResourceUnavailable, assignMaintenance, applyOperationalAction, start/completeMaintenanceTask (`operatorService.js`); displayIncidentDetails (`ui/views/incidents.js`) | AT-14, AT-22 | `operatorService.test.js`; browser S9 |
| FR-15 | UC-16 | Manage Smart Charging | buildChargingSchedule, optimizeQueue, scheduleSharedVehicleCharging, rescheduleChargingRequest, finishCharging (`chargingService.js`) | AT-15 | `chargingService.test.js`; browser S6 |
| FR-16 | UC-17 | Run What-if Simulation | requestSimulation, validateParams, runSimulationAlgorithm (`simulationService.js`); renderSetupForm (`ui/views/whatif.js`) | AT-16 | `simulationService.test.js`; browser S10 |
| FR-17 | UC-17 | Run What-if Simulation | evaluateScenarioImpact, calculateMetrics (`simulationService.js`); displayResultsAndRecommendations | AT-17 | `simulationService.test.js`; browser S10 |
| FR-18 | UC-18 | Run What-if Simulation | generateRecommendations, saveToLibrary, applyCoordination (`simulationService.js`) | AT-18 | `simulationService.test.js`; browser S10 |
| FR-19 | UC-20 | top bar (*Update data*, *Auto*) | tickSimulator, updateResourceStatus, simulateStateReadError, simulateCompetingReservation (`simulatorService.js`) | AT-19 | `simulatorService.test.js`; browser S11 |
| FR-20 | UC-10, UC-19 | top bar (Dark mode, VI/EN) | setInterfaceMode (`main.js`), renderApp (`ui/render.js`), `ui/i18n.js` | AT-20 | `i18n.test.js`; browser S11 |

## Submission #1 actor requirements

| Group (Submission #1) | Where it is covered |
|---|---|
| FR-STA-1..5 resource state | in-memory store and services; Data Simulator (FR-19) |
| FR-STU-1..4 find Hub, Hub info, reservation status, trip history | Find Suitable Hub / Vehicle; Reserve Shared Vehicle (details, history) |
| FR-SVU-1..11 shared vehicle use | Find Suitable Hub / Vehicle; Reserve Shared Vehicle; Reserve Parking Space (FR-SVU-11) |
| FR-PEV-1..5 private EV | Reserve Parking Space (FR-PEV-1); Schedule Private EV Charging (request, booking, status, completion notice) |
| FR-OPT-1..18 operator | Monitor Network Status (1–6), Redistribute Vehicles (7–9), Handle Operational Incident (10–14), Manage Smart Charging (15–18) |
| FR-DIS-1..8 dispatch staff | Execute Redistribution Task |
| FR-MNT-1..6 maintenance staff | Resolve Assigned Incident |
| FR-CHG-1..5 smart charging | Manage Smart Charging; automatic allocation per slot (D-015, D-019) |
| FR-SIM-1..6 what-if | Run What-if Simulation |
| FR-UI-1 interface mode | top bar |
