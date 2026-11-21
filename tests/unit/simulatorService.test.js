// Data Simulator — Synchronize Resource State (FR-19 / UC-20, D-005, D-010) and the exception
// demonstrations of UC-04 (E2, E3) and UC-09 (E2).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ChargingPointStatus } from "../../src/domain/status.js";
import { checkAvailability, createChargingSession } from "../../src/services/chargingService.js";
import { getAvailableSlotsCount } from "../../src/services/hubService.js";
import { reserveParkingSpace, reserveVehicle } from "../../src/services/reservationService.js";
import { simulateCompetingReservation, simulateStateReadError, tickSimulator } from "../../src/services/simulatorService.js";
import { freshStore, hub, METRO, point, slotAt, STUDENT, T0, vehicle } from "./helpers.js";

test("tickSimulator rotates battery, parking sensor, port telemetry and routine updates", () => {
  const store = freshStore();
  assert.equal(tickSimulator(store, T0).code, "sim_battery");
  assert.equal(vehicle(store, "EB-101").battery, 81);
  assert.equal(tickSimulator(store, T0).code, "sim_parking");
  assert.equal(hub(store, METRO).occupiedParking, 5);
  assert.equal(tickSimulator(store, T0).code, "sim_point_busy");
  assert.equal(point(store, "CP-01").simulatedOccupancy, true);
  assert.equal(tickSimulator(store, T0).code, "sim_routine");
  tickSimulator(store, T0);
  tickSimulator(store, T0);
  assert.equal(tickSimulator(store, T0).code, "sim_point_free", "temporary occupancy is released (D-010)");
  assert.equal(point(store, "CP-01").status, ChargingPointStatus.AVAILABLE);
  const state = store.getState();
  assert.equal(state.updateSequence, 7);
  assert.equal(state.lastUpdate.code, "sim_point_free");
  assert.equal(state.operationalEvents.length, 7);
});

test("the parking sensor never fills held spaces (D-004)", () => {
  const store = freshStore();
  const free = getAvailableSlotsCount(store.getState(), METRO);
  for (let index = 0; index < free; index += 1) reserveParkingSpace(store, { studentId: STUDENT, hubId: METRO, now: T0 });
  tickSimulator(store, T0);
  const update = tickSimulator(store, T0);
  assert.equal(update.code, "sim_parking");
  assert.notEqual(update.params.hubName, "Ga Metro ĐHQG");
  assert.equal(hub(store, METRO).occupiedParking, 4);
});

test("simulated port occupancy never touches a port with a charging session", () => {
  const store = freshStore();
  createChargingSession(store, { studentId: STUDENT, hubId: METRO, slotStart: slotAt(0), vehicleLabel: "A", battery: 40, now: T0 });
  tickSimulator(store, T0);
  tickSimulator(store, T0);
  const update = tickSimulator(store, T0);
  assert.equal(update.code, "sim_point_busy");
  assert.equal(update.params.pointId, "CP-02");
});

test("E3 demonstration: another student reserves the selected vehicle first", () => {
  const store = freshStore();
  const simulated = simulateCompetingReservation(store, { vehicleId: "EB-101", now: T0 });
  assert.equal(simulated.code, "sim_competing_reservation");
  assert.match(simulated.params.studentId, /^STUDENT-OTHER-\d{2}$/);
  assert.equal(reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 }).code, "reservation_conflict");
  assert.equal(simulateCompetingReservation(store, { vehicleId: "EM-203", now: T0 }).params.studentId, "STUDENT-OTHER-02");
});

test("E2 demonstration: the port status of a Hub cannot be read for a short time", () => {
  const store = freshStore();
  assert.equal(simulateStateReadError(store, { hubId: METRO, now: T0, durationMs: 10000 }).code, "sim_read_error_ports");
  assert.equal(checkAvailability(store.getState(), METRO, slotAt(1), T0 + 9999).code, "port_status_unavailable");
  assert.equal(checkAvailability(store.getState(), METRO, slotAt(1), T0 + 10000).code, "slot_available");
  assert.equal(simulateStateReadError(store, { vehicleId: "NOPE", now: T0 }).code, "vehicle_not_found");
});
