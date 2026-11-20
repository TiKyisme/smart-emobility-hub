// FR-19 / UC-20 / AT-19, D-004, D-005
import assert from "node:assert/strict";
import { test } from "node:test";
import { submitChargingRequest } from "../../src/services/chargingService.js";
import { summarizeHub } from "../../src/services/hubService.js";
import { reserveParking } from "../../src/services/reservationService.js";
import { applySimulatedUpdate, AUTO_UPDATE_INTERVAL_MS } from "../../src/services/simulatorService.js";
import { DORM, freshStore, hub, METRO, point, vehicle } from "./helpers.js";

test("AT-19: the four update phases change telemetry, parking, charging and the event log", () => {
  const store = freshStore();
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });

  assert.equal(applySimulatedUpdate(store).code, "sim_battery");
  assert.equal(vehicle(store, "EV-01").battery, 81);
  assert.equal(applySimulatedUpdate(store).code, "sim_parking");
  assert.equal(hub(store, METRO).occupiedParking, 5);
  assert.equal(applySimulatedUpdate(store).code, "sim_point_busy");
  assert.equal(point(store, "CP-01").status, "occupied");
  assert.equal(applySimulatedUpdate(store).code, "sim_routine");

  assert.equal(notifications, 4, "every update notifies the UI immediately (D-005)");
  assert.equal(store.getState().operationalEvents.length, 4);
  assert.equal(store.getState().lastUpdate.code, "sim_routine");
  assert.equal(AUTO_UPDATE_INTERVAL_MS, 15_000);
});

test("GUARD (D-004): a simulated arrival never pushes a Hub beyond capacity when spaces are held", () => {
  const store = freshStore();
  for (let i = 0; i < 4; i += 1) assert.equal(reserveParking(store, { studentId: "A", hubId: METRO }).ok, true);

  applySimulatedUpdate(store);
  const parking = applySimulatedUpdate(store);
  const metro = summarizeHub(store.getState(), METRO);
  assert.ok(metro.usedParking <= metro.parkingCapacity, `Metro used ${metro.usedParking}/${metro.parkingCapacity}`);
  assert.equal(parking.params.hubName, "Dormitory Hub", "the arrival goes to the first Hub with a free space");
  assert.equal(hub(store, DORM).occupiedParking, 8);
});

test("GUARD: when every Hub is full the parking sensor reports it and changes nothing", () => {
  const store = freshStore();
  store.update((state) => {
    for (const item of state.hubs) item.occupiedParking = item.parkingCapacity;
  });
  applySimulatedUpdate(store);
  const before = store.getState().hubs.map((item) => item.occupiedParking);

  assert.equal(applySimulatedUpdate(store).code, "sim_parking_full");
  assert.deepEqual(store.getState().hubs.map((item) => item.occupiedParking), before);
});

test("simulated charging occupancy is temporary and never frees a real charging session", () => {
  const store = freshStore();
  for (let tick = 1; tick <= 40; tick += 1) {
    applySimulatedUpdate(store);
    const simulatedBusy = store.getState().chargingPoints.filter((item) => item.simulatedOccupancy);
    assert.ok(simulatedBusy.length <= 1, `tick ${tick}: at most one point is held by the simulator`);
    assert.equal(point(store, "CP-03").status, "occupied", `tick ${tick}: EV-04's session on CP-03 is untouched`);
  }
  assert.equal(store.getState().chargingPoints.filter((item) => item.status === "available").length >= 3, true);

  const fresh = freshStore();
  for (let i = 0; i < 3; i += 1) applySimulatedUpdate(fresh);
  assert.equal(point(fresh, "CP-01").status, "occupied");
  for (let i = 0; i < 4; i += 1) applySimulatedUpdate(fresh);
  assert.equal(point(fresh, "CP-01").status, "available", "released on the next charging tick");
});

test("D-015: when the simulator frees a charger, a waiting request is allocated immediately", () => {
  const store = freshStore();
  submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId: "EV-02" }); // CP-01
  for (let i = 0; i < 3; i += 1) applySimulatedUpdate(store); // tick 3 occupies CP-02 (simulated)
  assert.equal(point(store, "CP-02").simulatedOccupancy, true);
  assert.equal(submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId: "EV-01" }).code, "charging_queued");

  for (let i = 0; i < 4; i += 1) applySimulatedUpdate(store); // tick 7 releases CP-02
  const request = store.getState().chargingRequests.find((item) => item.vehicleId === "EV-01");
  assert.equal(request.status, "scheduled");
  assert.equal(request.chargingPointId, "CP-02");
});

test("the operational event log keeps the latest eight events, newest first", () => {
  const store = freshStore();
  for (let i = 0; i < 11; i += 1) applySimulatedUpdate(store);
  const events = store.getState().operationalEvents;
  assert.equal(events.length, 8);
  assert.deepEqual(events.map((item) => item.sequence), [11, 10, 9, 8, 7, 6, 5, 4]);
});
