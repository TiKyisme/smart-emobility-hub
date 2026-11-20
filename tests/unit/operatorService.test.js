// FR-01..FR-03, FR-10..FR-14 / AT-01..AT-03, AT-10..AT-14, D-016
import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState } from "../../src/data/simulatedData.js";
import { schedulePrivateEvCharging, submitChargingRequest } from "../../src/services/chargingService.js";
import { findSuitableHubs, findSuitableVehicles, listHubSummaries } from "../../src/services/hubService.js";
import {
  coordinateRedistribution,
  getCapacityRisks,
  getNetworkMetrics,
  reportChargingPointUnavailable,
  reportVehicleFailure,
  resolveIncident,
  suggestRedistribution,
} from "../../src/services/operatorService.js";
import { cancelParkingReservation, pickUpVehicle, reserveParking, reserveVehicle } from "../../src/services/reservationService.js";
import { CAMPUS, DORM, freshStore, hub, METRO, point, requestFor, T0, vehicle } from "./helpers.js";

test("AT-01..AT-03: Hub summaries and search use current availability and battery", () => {
  const state = createInitialState();
  assert.equal(listHubSummaries(state).length, 4);
  assert.deepEqual(findSuitableVehicles(state, { hubId: METRO, minimumBattery: 80 }).map((item) => item.id), ["EV-01"]);
  assert.deepEqual(findSuitableVehicles(state, { minimumBattery: 70 }).map((item) => item.id), ["EV-01", "EV-05"]);
  assert.deepEqual(findSuitableVehicles(state, { hubId: DORM, includeUnavailable: true }).map((item) => item.id), ["EV-03", "EV-04"]);
  assert.deepEqual(findSuitableHubs(state, { minimumParking: 5, chargingRequired: true }).map((item) => item.id), [CAMPUS]);
});

test("AT-10 / AT-11: network metrics reflect the seeded network", () => {
  assert.deepEqual(getNetworkMetrics(createInitialState()), {
    hubs: 4,
    vehicles: 6,
    availableVehicles: 5,
    chargingPoints: 5,
    availableChargingPoints: 4,
    openIncidents: 0,
    queuedChargingRequests: 0,
  });
});

test("AT-12: a Hub filled by physical + held spaces becomes the top risk and is flagged at capacity", () => {
  const store = freshStore();
  for (let i = 0; i < 3; i += 1) reserveParking(store, { studentId: "A", hubId: DORM });
  const [top] = getCapacityRisks(store.getState());
  assert.equal(top.id, DORM);
  assert.equal(top.utilization, 1);
  assert.equal(top.atCapacity, true);
});

test("AT-13: the seed recommendation moves one vehicle from Dormitory to University and respects capacity", () => {
  const store = freshStore();
  const recommendation = suggestRedistribution(store.getState());
  assert.equal(recommendation.fromHubId, DORM);
  assert.equal(recommendation.toHubId, CAMPUS);

  const result = coordinateRedistribution(store, recommendation);
  assert.equal(result.code, "redistribution_done");
  assert.equal(vehicle(store, "EV-03").hubId, CAMPUS);
  assert.equal(hub(store, DORM).occupiedParking, 6);
  assert.equal(hub(store, CAMPUS).occupiedParking, 6);
});

test("AT-13: coordination is refused when the destination is full, no vehicle can move, or no recommendation exists", () => {
  const store = freshStore();
  for (let i = 0; i < 3; i += 1) reserveParking(store, { studentId: "A", hubId: DORM });
  assert.equal(coordinateRedistribution(store, { fromHubId: METRO, toHubId: DORM }).code, "redistribution_destination_full");
  assert.equal(coordinateRedistribution(store, null).code, "redistribution_none");

  const waiting = freshStore();
  submitChargingRequest(waiting, { studentId: "A", hubId: METRO, vehicleId: "EV-02" });
  schedulePrivateEvCharging(waiting, { studentId: "A", hubId: METRO, vehicleLabel: "P", battery: 40 });
  submitChargingRequest(waiting, { studentId: "A", hubId: METRO, vehicleId: "EV-01" });
  assert.equal(coordinateRedistribution(waiting, { fromHubId: METRO, toHubId: CAMPUS }).code, "redistribution_no_vehicle",
    "a vehicle waiting for a charger is not moved away");
});

test("AT-14: vehicle failure cancels holds, frees its charger and opens a readable incident", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId: "EV-02" });
  assert.equal(point(store, "CP-01").status, "occupied");

  assert.equal(reportVehicleFailure(store, "EV-01").params.incidentId, "INC-001");
  assert.equal(store.getState().reservations[0].status, "cancelled");
  assert.equal(vehicle(store, "EV-01").status, "failed");

  assert.equal(reportVehicleFailure(store, "EV-02").code, "vehicle_failure_reported");
  assert.equal(point(store, "CP-01").status, "available");
  assert.equal(requestFor(store, "EV-02").status, "queued");
  assert.equal(reportVehicleFailure(store, "EV-02").code, "vehicle_already_failed");
  assert.equal(getNetworkMetrics(store.getState()).openIncidents, 2);
});

test("AT-14: a charger outage opens an incident; repeated or unknown reports are rejected", () => {
  const store = freshStore();
  assert.equal(reportChargingPointUnavailable(store, "CP-04").code, "point_unavailable_reported");
  assert.equal(point(store, "CP-04").status, "unavailable");
  assert.equal(reportChargingPointUnavailable(store, "CP-04").code, "point_already_unavailable");
  assert.equal(reportChargingPointUnavailable(store, "CP-99").code, "point_not_found");
  assert.deepEqual(store.getState().incidents.map((item) => [item.id, item.type, item.resourceId, item.status]), [
    ["INC-001", "charging_point_unavailable", "CP-04", "open"],
  ]);
});

test("D-016: resolving a vehicle failure returns the vehicle to service and resumes its charging request", () => {
  const store = freshStore();
  submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId: "EV-02" });
  reportVehicleFailure(store, "EV-02");
  assert.equal(requestFor(store, "EV-02").status, "queued");

  const repaired = resolveIncident(store, "INC-001");
  assert.equal(repaired.code, "vehicle_repaired");
  assert.equal(store.getState().incidents[0].status, "resolved");
  assert.ok(store.getState().incidents[0].resolvedAt);
  assert.equal(vehicle(store, "EV-02").status, "charging", "the repaired vehicle gets the free charger back");
  assert.equal(requestFor(store, "EV-02").chargingPointId, "CP-01");
  assert.equal(resolveIncident(store, "INC-001").code, "incident_already_resolved");
  assert.equal(resolveIncident(store, "INC-404").code, "incident_not_found");
});

test("D-016: restoring a charger hands it to the highest-priority waiting request", () => {
  const store = freshStore();
  reportChargingPointUnavailable(store, "CP-01");
  reportChargingPointUnavailable(store, "CP-02");
  submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId: "EV-01" });
  submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId: "EV-02" });

  const restored = resolveIncident(store, "INC-002");
  assert.equal(restored.code, "point_restored_next");
  assert.equal(restored.params.nextLabel, "EV-02", "EV-02 (28%, needed soon) outranks EV-01 (82%)");
  assert.equal(point(store, "CP-02").status, "occupied");
  assert.equal(point(store, "CP-01").status, "unavailable");
  assert.equal(getNetworkMetrics(store.getState()).openIncidents, 1);
});

test("D-016: a vehicle that failed during a trip needs a free space at its Hub to be repaired", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: Date.now() });
  pickUpVehicle(store, { studentId: "A", vehicleId: "EV-01" });
  reportVehicleFailure(store, "EV-01");
  assert.equal(store.getState().incidents[0].wasInUse, true);

  const holds = [];
  for (let i = 0; i < 5; i += 1) holds.push(reserveParking(store, { studentId: "P", hubId: METRO }).reservation.id); // 3/8 + 5 held = full
  assert.equal(resolveIncident(store, "INC-001").code, "repair_hub_full");
  assert.equal(vehicle(store, "EV-01").status, "failed");

  cancelParkingReservation(store, { studentId: "P", reservationId: holds[0] });
  assert.equal(resolveIncident(store, "INC-001").code, "vehicle_repaired");
  assert.equal(hub(store, METRO).occupiedParking, 4, "the repaired vehicle is parked at its Hub again");
  assert.equal(vehicle(store, "EV-01").status, "available");
});
