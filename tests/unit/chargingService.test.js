// FR-08, FR-09, FR-15 / UC-08, UC-09, UC-16 / AT-08, AT-09, AT-15, NFR-03, D-008, D-009, D-015
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChargingSchedule,
  cancelChargingRequest,
  finishCharging,
  listChargeableVehicles,
  priorityScore,
  schedulePrivateEvCharging,
  submitChargingRequest,
} from "../../src/services/chargingService.js";
import { reportChargingPointUnavailable, reportVehicleFailure } from "../../src/services/operatorService.js";
import { expireReservations, RESERVATION_HOLD_DURATION_MS, reserveParking, reserveVehicle } from "../../src/services/reservationService.js";
import { DORM, freshStore, METRO, point, requestFor, SERVICE, T0, vehicle } from "./helpers.js";

const shared = (store, vehicleId, extra = {}) => submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId, ...extra });
const privateEv = (store, extra = {}) =>
  schedulePrivateEvCharging(store, { studentId: "A", hubId: METRO, vehicleLabel: "PRIV-A", battery: 35, upcomingUsage: false, ...extra });
const scheduledAt = (store, hubId) => store.getState().chargingRequests.filter((item) => item.hubId === hubId && item.status === "scheduled");

test("AT-08 / D-015: a request is charged immediately when a point is free, using the recorded battery", () => {
  const store = freshStore();
  const result = shared(store, "EV-02", { battery: 99, upcomingUsage: false });

  assert.equal(result.code, "charging_started");
  assert.equal(result.params.pointId, "CP-01");
  assert.equal(result.request.id, "CHG-002", "CHG-001 is EV-04's seeded session");
  assert.equal(result.request.battery, 28, "D-008: typed battery is ignored for shared vehicles");
  assert.equal(result.request.upcomingUsage, true, "EV-02 is flagged for upcoming usage in the seed data");
  assert.equal(vehicle(store, "EV-02").status, "charging");
  assert.equal(point(store, "CP-01").status, "occupied");
});

test("AT-08: without a free point the request waits and reports its queue position", () => {
  const store = freshStore();
  shared(store, "EV-02");
  privateEv(store);
  const waiting = shared(store, "EV-01");
  assert.equal(waiting.code, "charging_queued");
  assert.equal(waiting.params.position, 1);
  assert.equal(waiting.request.status, "queued");
  assert.equal(vehicle(store, "EV-01").status, "available");
});

test("no double allocation: a vehicle cannot have two open requests", () => {
  const store = freshStore();
  shared(store, "EV-02");
  privateEv(store);
  assert.equal(shared(store, "EV-01").code, "charging_queued");
  assert.equal(shared(store, "EV-01").code, "charging_duplicate");
  assert.equal(shared(store, "EV-02").code, "charging_vehicle_charging");
  assert.equal(store.getState().chargingRequests.filter((item) => item.vehicleId === "EV-01").length, 1);
});

test("FR-08 guards and the list of chargeable vehicles agree", () => {
  const store = freshStore();
  assert.deepEqual(listChargeableVehicles(store.getState(), DORM).map((item) => item.id), ["EV-03"], "EV-04 is already charging");
  assert.equal(submitChargingRequest(store, { studentId: "A", hubId: DORM, vehicleId: "EV-04" }).code, "charging_vehicle_charging");
  assert.equal(shared(store, "EV-01", { hubId: DORM }).code, "charging_hub_mismatch");
  assert.equal(shared(store, "").code, "vehicle_required");
  assert.equal(shared(store, "EV-99").code, "vehicle_not_found");
  assert.equal(submitChargingRequest(store, { hubId: METRO, vehicleId: "EV-01" }).code, "student_required");

  reserveVehicle(store, { studentId: "B", vehicleId: "EV-01", now: Date.now() });
  assert.equal(shared(store, "EV-01").code, "charging_vehicle_busy");
  reportVehicleFailure(store, "EV-02");
  assert.equal(shared(store, "EV-02").code, "charging_vehicle_failed");
  assert.deepEqual(listChargeableVehicles(store.getState(), METRO), []);
});

test("AT-15 / FR-15: a freed point goes to the highest-priority waiting request, never beyond capacity", () => {
  const store = freshStore();
  shared(store, "EV-02"); // CP-01
  privateEv(store); // CP-02
  shared(store, "EV-01"); // waits, priority 18
  const urgent = privateEv(store, { vehicleLabel: "PRIV-URGENT", battery: 10, upcomingUsage: true }); // priority 1090
  const medium = privateEv(store, { vehicleLabel: "PRIV-MID", battery: 50 }); // priority 50

  assert.equal(priorityScore(urgent.request), 1090);
  assert.equal(urgent.params.position, 1, "jumps ahead of the earlier EV-01 request");
  assert.deepEqual(buildChargingSchedule(store.getState(), METRO).waiting.map((item) => item.vehicleLabel), ["PRIV-URGENT", "PRIV-MID", "EV-01"]);

  const first = finishCharging(store, "CP-01");
  assert.equal(first.code, "charging_finished_next");
  assert.equal(first.params.nextLabel, "PRIV-URGENT");
  assert.equal(finishCharging(store, "CP-02").params.nextLabel, "PRIV-MID");
  assert.equal(requestFor(store, "EV-01").status, "queued");
  assert.ok(scheduledAt(store, METRO).length <= 2, "Metro never runs more sessions than points");
});

test("finishing a session: shared vehicle charged to 100%, private EV leaves its space", () => {
  const store = freshStore();
  const seeded = finishCharging(store, "CP-03");
  assert.equal(seeded.code, "charging_finished");
  assert.equal(vehicle(store, "EV-04").battery, 100);
  assert.equal(vehicle(store, "EV-04").status, "available");
  assert.equal(requestFor(store, "EV-04").status, "completed");
  assert.equal(point(store, "CP-03").status, "available");

  const parked = privateEv(store);
  finishCharging(store, parked.request.chargingPointId);
  assert.equal(store.getState().parkingReservations[0].status, "completed");
  assert.equal(finishCharging(store, "CP-03").code, "point_not_charging");
  assert.equal(finishCharging(store, "CP-99").code, "point_not_found");
});

test("D-009: a waiting request whose vehicle was reserved is skipped until the hold ends", () => {
  const store = freshStore();
  shared(store, "EV-02");
  privateEv(store);
  shared(store, "EV-01");
  reserveVehicle(store, { studentId: "B", vehicleId: "EV-01", now: T0 });
  assert.deepEqual(buildChargingSchedule(store.getState(), METRO).blocked.map((item) => item.blockedReason), ["vehicle_reserved"]);

  finishCharging(store, "CP-01");
  assert.equal(point(store, "CP-01").status, "available", "the reserved vehicle does not take the freed point");
  assert.equal(vehicle(store, "EV-01").status, "reserved");

  expireReservations(store, T0 + RESERVATION_HOLD_DURATION_MS);
  assert.equal(requestFor(store, "EV-01").chargingPointId, "CP-01", "allocated automatically once the hold expires");
  assert.equal(vehicle(store, "EV-01").status, "charging");
});

test("D-009: a waiting request whose vehicle failed consumes no capacity", () => {
  const store = freshStore();
  shared(store, "EV-02");
  privateEv(store);
  shared(store, "EV-01");
  reportVehicleFailure(store, "EV-01");
  finishCharging(store, "CP-01");
  assert.equal(point(store, "CP-01").status, "available");
  assert.deepEqual(buildChargingSchedule(store.getState(), METRO).blocked.map((item) => item.blockedReason), ["vehicle_failed"]);
});

test("FR-14 + FR-15: a charger outage moves its session to another free point automatically", () => {
  const store = freshStore();
  shared(store, "EV-02");
  assert.equal(requestFor(store, "EV-02").chargingPointId, "CP-01");
  reportChargingPointUnavailable(store, "CP-01");
  assert.equal(requestFor(store, "EV-02").chargingPointId, "CP-02");
  assert.equal(vehicle(store, "EV-02").status, "charging");
});

test("AT-09 / FR-09: a private EV holds a space and charges when a point is free", () => {
  const store = freshStore();
  const result = privateEv(store);
  assert.equal(result.code, "private_started");
  assert.equal(result.parkingReservation.status, "active");
  assert.equal(result.parkingReservation.linkedChargingRequest, result.request.id);
  assert.equal(result.request.source, "private");
  assert.equal(result.request.battery, 35);

  privateEv(store, { vehicleLabel: "PRIV-B" });
  assert.equal(privateEv(store, { vehicleLabel: "PRIV-C" }).code, "private_queued");
});

test("FR-09 input validation: battery 0..100 and a short, non-empty label", () => {
  const store = freshStore();
  for (const battery of ["", null, undefined, -1, 101, 150, "abc"]) {
    assert.equal(privateEv(store, { battery }).code, "invalid_battery", `battery=${battery}`);
  }
  assert.equal(privateEv(store, { vehicleLabel: "   " }).code, "private_label_required");
  assert.equal(privateEv(store, { vehicleLabel: "x".repeat(41) }).code, "private_label_too_long");
  assert.equal(privateEv(store, { battery: 0 }).ok, true);
  assert.equal(privateEv(store, { battery: "100" }).ok, true);
  assert.equal(store.getState().parkingReservations.length, 2, "rejected requests hold no parking");
});

test("FR-09: a private EV is rejected when the Hub has no free parking", () => {
  const store = freshStore();
  for (let i = 0; i < 3; i += 1) reserveParking(store, { studentId: "B", hubId: SERVICE });
  assert.equal(privateEv(store, { hubId: SERVICE }).code, "private_parking_full");
  assert.equal(store.getState().chargingRequests.length, 1, "only the seeded session exists");
});

test("a student can cancel a waiting request; a private EV also releases its space", () => {
  const store = freshStore();
  shared(store, "EV-02");
  privateEv(store);
  const waiting = privateEv(store, { vehicleLabel: "PRIV-WAIT" });
  const charging = requestFor(store, "EV-02");

  assert.equal(cancelChargingRequest(store, { studentId: "B", requestId: waiting.request.id }).code, "request_not_found");
  assert.equal(cancelChargingRequest(store, { studentId: "A", requestId: charging.id }).code, "charging_cancel_not_allowed");
  assert.equal(cancelChargingRequest(store, { studentId: "A", requestId: waiting.request.id }).code, "charging_cancelled");
  assert.equal(requestFor(store, "PRIV-WAIT").status, "cancelled");
  assert.equal(store.getState().parkingReservations.find((item) => item.id === waiting.parkingReservation.id).status, "cancelled");
});
