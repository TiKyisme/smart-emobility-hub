// UC-02 Find Suitable Hub / Vehicle (FR-01..FR-03, Submission #2 activity diagram and #3 methods).
import assert from "node:assert/strict";
import { test } from "node:test";
import { haversineKm, walkingMinutes } from "../../src/domain/geo.js";
import {
  checkResourceAvailability,
  fetchAvailableVehicles,
  getAvailableSlotsCount,
  listPlaces,
  requestNearbyHubs,
  summarizeHub,
  validateLocation,
} from "../../src/services/hubService.js";
import { reserveParkingSpace } from "../../src/services/reservationService.js";
import { DORM_B, freshStore, METRO, STUDENT, T0, UIT } from "./helpers.js";

test("seed data: 12 Mobility Hubs (Submission #1 team decision), vehicles with a type, every Hub has a charging port", () => {
  const state = freshStore().getState();
  assert.equal(state.hubs.length, 12);
  assert.ok(state.vehicles.every((item) => ["e_bike", "e_scooter"].includes(item.type)));
  for (const item of state.hubs) assert.ok(state.chargingPoints.some((port) => port.hubId === item.id), `${item.id} has a port`);
  assert.ok(state.hubs.every((item) => item.occupiedParking <= item.parkingCapacity));
});

test("Haversine distance and walking time", () => {
  const state = freshStore().getState();
  const metro = state.hubs.find((item) => item.id === METRO);
  const uit = state.hubs.find((item) => item.id === UIT);
  const km = haversineKm(metro, uit);
  assert.ok(km > 0.45 && km < 0.55, `${km}`);
  assert.equal(walkingMinutes(km), 7);
  assert.equal(haversineKm(metro, metro), 0);
});

test("validateLocation: location required (E2), known place, radius 0.1–5.0 km", () => {
  const state = freshStore().getState();
  assert.equal(validateLocation(state, { originId: "", radiusKm: 1 }).code, "location_required");
  assert.equal(validateLocation(state, { originId: "NOWHERE", radiusKm: 1 }).code, "location_unknown");
  assert.equal(validateLocation(state, { originId: METRO, radiusKm: 0.05 }).code, "radius_invalid");
  assert.equal(validateLocation(state, { originId: METRO, radiusKm: 5.1 }).code, "radius_invalid");
  assert.equal(validateLocation(state, { originId: METRO, radiusKm: "" }).code, "radius_invalid");
  assert.ok(validateLocation(state, { originId: "LOC-GATE", radiusKm: 0.1 }).ok);
  assert.ok(validateLocation(state, { originId: METRO, radiusKm: 5 }).ok);
  assert.ok(listPlaces(state).length > state.hubs.length);
});

test("requestNearbyHubs: Hubs inside the radius, nearest first, with resources and overload flag", () => {
  const state = freshStore().getState();
  const result = requestNearbyHubs(state, { originId: METRO, radiusKm: 1 });
  assert.equal(result.code, "hubs_found");
  assert.equal(result.hubs[0].id, METRO);
  assert.ok(result.hubs.some((item) => item.id === UIT));
  assert.ok(!result.hubs.some((item) => item.id === DORM_B), "KTX Khu B is farther than 1 km");
  for (let index = 1; index < result.hubs.length; index += 1) {
    assert.ok(result.hubs[index - 1].distanceKm <= result.hubs[index].distanceKm);
    assert.ok(result.hubs[index].distanceKm <= 1);
  }
  const wide = requestNearbyHubs(state, { originId: METRO, radiusKm: 5 });
  assert.equal(wide.hubs.length, 12);
  assert.equal(wide.hubs.find((item) => item.id === "HUB-UEL").overloaded, true, "88 % >= 85 %");
});

test("requestNearbyHubs: no Hub in the radius (E1) and parking near the destination (A2)", () => {
  const state = freshStore().getState();
  const none = requestNearbyHubs(state, { originId: "LOC-HEALTH", radiusKm: 1 });
  assert.equal(none.ok, false);
  assert.equal(none.code, "hubs_none");
  const withDestination = requestNearbyHubs(state, { originId: METRO, destinationId: "KTX-A", radiusKm: 1 });
  assert.ok(withDestination.destinationHubs.length > 0);
  assert.ok(withDestination.destinationHubs.every((item) => item.parkingAvailable > 0));
  assert.equal(withDestination.destinationHubs[0].id, "KTX-A");
});

test("fetchAvailableVehicles: available only, vehicle type and minimum battery, best battery first", () => {
  const state = freshStore().getState();
  assert.deepEqual(fetchAvailableVehicles(state, { hubId: METRO }).map((item) => item.id), ["EB-101", "EM-203", "EB-102"]);
  assert.deepEqual(fetchAvailableVehicles(state, { hubId: METRO, vehicleType: "e_bike" }).map((item) => item.id), ["EB-101", "EB-102"]);
  assert.deepEqual(fetchAvailableVehicles(state, { hubId: METRO, minBattery: 50 }).map((item) => item.id), ["EB-101", "EM-203"]);
  assert.deepEqual(fetchAvailableVehicles(state, { hubId: "KTX-A" }).map((item) => item.id), ["EB-105", "EB-103"], "EM-201 is charging");
  assert.deepEqual(fetchAvailableVehicles(state, { hubId: "HUB-NVH" }), []);
});

test("Check Resource Availability: held parking spaces count against capacity (D-004)", () => {
  const store = freshStore();
  assert.equal(getAvailableSlotsCount(store.getState(), METRO), 4);
  reserveParkingSpace(store, { studentId: STUDENT, hubId: METRO, now: T0 });
  assert.equal(getAvailableSlotsCount(store.getState(), METRO), 3);
  const summary = summarizeHub(store.getState(), METRO);
  assert.equal(summary.usedParking, 5);
  assert.equal(summary.reservedParking, 1);
  assert.deepEqual(checkResourceAvailability(store.getState(), METRO), {
    hubId: METRO, parkingAvailable: 3, availableVehicles: 3, availableChargingPoints: 2,
  });
});
