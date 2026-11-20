// FR-01..FR-03, FR-10..FR-14 / AT-01..AT-03, AT-10..AT-14
import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState } from "../../src/data/simulatedData.js";
import { applyChargingSchedule, submitChargingRequest } from "../../src/services/chargingService.js";
import { findSuitableHubs, findSuitableVehicles, listHubSummaries } from "../../src/services/hubService.js";
import {
  coordinateRedistribution,
  getCapacityRisks,
  getNetworkMetrics,
  reportChargingPointUnavailable,
  reportVehicleFailure,
  suggestRedistribution,
} from "../../src/services/operatorService.js";
import { reserveParking, reserveVehicle } from "../../src/services/reservationService.js";
import { CAMPUS, DORM, freshStore, hub, METRO, point, requestFor, T0, vehicle } from "./helpers.js";

test("AT-01..AT-03: Hub summaries and search use current availability and battery", () => {
  const state = createInitialState();
  assert.equal(listHubSummaries(state).length, 4);
  assert.deepEqual(findSuitableVehicles(state, { hubId: METRO, minimumBattery: 80 }).map((item) => item.id), ["EV-01"]);
  assert.deepEqual(findSuitableVehicles(state, { minimumBattery: 70 }).map((item) => item.id), ["EV-01", "EV-05"]);
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
  assert.equal(recommendation.code, "redistribution_suggested");

  const result = coordinateRedistribution(store, recommendation);
  assert.equal(result.ok, true);
  assert.equal(result.code, "redistribution_done");
  assert.equal(vehicle(store, "EV-03").hubId, CAMPUS);
  assert.equal(hub(store, DORM).occupiedParking, 6);
  assert.equal(hub(store, CAMPUS).occupiedParking, 6);
});

test("AT-13: coordination is refused when the destination is full or no recommendation exists", () => {
  const store = freshStore();
  for (let i = 0; i < 3; i += 1) reserveParking(store, { studentId: "A", hubId: DORM });
  const blocked = coordinateRedistribution(store, { fromHubId: METRO, toHubId: DORM });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "redistribution_destination_full");
  assert.equal(vehicle(store, "EV-01").hubId, METRO);
  assert.equal(coordinateRedistribution(store, null).code, "redistribution_none");
});

test("AT-14: vehicle failure cancels holds, frees its charging point and opens one incident", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId: "EV-02" });
  applyChargingSchedule(store, METRO);
  assert.equal(point(store, "CP-01").status, "occupied");

  assert.equal(reportVehicleFailure(store, "EV-01").ok, true);
  assert.equal(store.getState().reservations[0].status, "cancelled");
  assert.equal(vehicle(store, "EV-01").status, "failed");

  assert.equal(reportVehicleFailure(store, "EV-02").code, "vehicle_failure_reported");
  assert.equal(point(store, "CP-01").status, "available");
  assert.equal(requestFor(store, "EV-02").status, "queued");

  assert.equal(reportVehicleFailure(store, "EV-02").code, "vehicle_already_failed");
  assert.equal(getNetworkMetrics(store.getState()).openIncidents, 2);
});

test("AT-14: an unavailable charging point opens an incident; repeated or unknown reports are rejected", () => {
  const store = freshStore();
  assert.equal(reportChargingPointUnavailable(store, "CP-04").ok, true);
  assert.equal(point(store, "CP-04").status, "unavailable");
  assert.equal(reportChargingPointUnavailable(store, "CP-04").code, "point_already_unavailable");
  assert.equal(reportChargingPointUnavailable(store, "CP-99").code, "point_not_found");
  assert.deepEqual(store.getState().incidents.map((item) => [item.type, item.resourceId, item.status]), [
    ["charging_point_unavailable", "CP-04", "open"],
  ]);
});
