# Traceability Matrix

The lecturer slides emphasize traceable, verifiable requirements. This file keeps the design and implementation tied to requirements.

Automated checks: `tests/unit/` runs with `npm test` (Node built-in runner); browser checks live in `tests/e2e/browser_acceptance.py` (scenario tags S1–S12; S11 replays the demo script).

| Requirement | Use case | Primary module | UI page | Acceptance case | Automated check |
|---|---|---|---|---|---|
| FR-01 | UC-01 | `hubService.js` | Find & reserve (Hub tiles) | AT-01 | `operatorService.test.js`; browser S1 |
| FR-02 | UC-02 | `hubService.js` | Find & reserve (filters) | AT-02 | `operatorService.test.js`; browser S1 |
| FR-03 | UC-03 | `hubService.js` | Find & reserve (vehicle table) | AT-03 | `operatorService.test.js`; browser S1 |
| FR-04 | UC-04 | `reservationService.js` | Find & reserve (My trip) | AT-04 | `reservationService.test.js`; browser S2, S3 |
| FR-05 | UC-05 | `reservationService.js` | Parking & charging | AT-05 | `reservationService.test.js`; browser S4 |
| FR-06 | UC-06 | `reservationService.js` | Find & reserve (My trip) | AT-06 | `reservationService.test.js`; browser S2 |
| FR-07 | UC-07 | `reservationService.js` | Find & reserve (My trip) | AT-07 | `reservationService.test.js`; browser S2, S4 |
| FR-08 | UC-08 | `chargingService.js` | Parking & charging | AT-08 | `chargingService.test.js`; browser S5 |
| FR-09 | UC-09 | `chargingService.js` | Parking & charging | AT-09 | `chargingService.test.js`; browser S5 |
| FR-10 | UC-11 | `operatorService.js` | Network monitor | AT-10 | `operatorService.test.js`; browser S6 |
| FR-11 | UC-12 | `operatorService.js` | Network monitor (fleet), Smart charging (chargers) | AT-11 | `operatorService.test.js`; browser S6 |
| FR-12 | UC-13 | `operatorService.js` | Network monitor (Hub network) | AT-12 | `operatorService.test.js`; browser S4 |
| FR-13 | UC-14 | `operatorService.js` | Network monitor (redistribution) | AT-13 | `operatorService.test.js`; browser S6 |
| FR-14 | UC-15 | `operatorService.js` | Incidents | AT-14 | `operatorService.test.js`; browser S6 |
| FR-15 | UC-16 | `chargingService.js` | Smart charging | AT-15 | `chargingService.test.js`; browser S5, S5b |
| FR-16 | UC-17 | `simulationService.js` | What-if simulation | AT-16 | `simulationService.test.js`; browser S7 |
| FR-17 | UC-17 | `simulationService.js` | What-if simulation | AT-17 | `simulationService.test.js`; browser S7 |
| FR-18 | UC-18 | `simulationService.js` | What-if simulation | AT-18 | `simulationService.test.js`; browser S7 |
| FR-19 | UC-20 | `simulatorService.js`, `state/store.js`, simulated data | Top bar (Update data, Auto) | AT-19 | `simulatorService.test.js`; browser S8 |
| FR-20 | UC-10, UC-19 | UI (`ui/render.js`, `ui/i18n.js`) | Top bar (Dark mode, VI/EN) | AT-20 | `i18n.test.js`; browser S10 |
