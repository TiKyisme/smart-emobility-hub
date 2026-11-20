// FR-08, FR-09, FR-15 / UC-08, UC-09, UC-16 / AT-08, AT-09, AT-15, NFR-03
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyChargingSchedule,
  buildChargingSchedule,
  priorityScore,
  schedulePrivateEvCharging,
  submitChargingRequest,
} from "../../src/services/chargingService.js";
import { reportChargingPointUnavailable, reportVehicleFailure } from "../../src/services/operatorService.js";
import {
  expireReservations,
  pickUpVehicle,
  RESERVATION_HOLD_DURATION_MS,
  reserveParking,
  reserveVehicle,
  returnVehicle,
} from "../../src/services/reservationService.js";
import { DORM, freshStore, METRO, point, requestFor, SERVICE, T0, vehicle } from "./helpers.js";

const shared = (store, vehicleId, extra = {}) => submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId, ...extra });
const privateEv = (store, extra = {}) =>
  schedulePrivateEvCharging(store, { studentId: "A", hubId: METRO, vehicleLabel: "Private EV 01", battery: 35, upcomingUsage: false, ...extra });

test("AT-08: a shared request is queued with the vehicle's recorded battery and upcoming-usage flag", () => {
  const store = freshStore();
  const result = shared(store, "EV-02", { battery: 99, upcomingUsage: false });

  assert.equal(result.ok, true);
  assert.equal(result.code, "charging_queued");
  assert.equal(result.request.status, "queued");
  assert.equal(result.request.battery, 28, "typed battery is ignored; the vehicle telemetry is used");
  assert.equal(result.request.upcomingUsage, true, "EV-02 is flagged for upcoming usage in the seed data");
});

test("no double allocation: a vehicle cannot have two open charging requests", () => {
  const store = freshStore();
  assert.equal(shared(store, "EV-01").ok, true);
  const duplicate = shared(store, "EV-01");

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "charging_duplicate");
  assert.equal(store.getState().chargingRequests.length, 1);
});

test("FR-08 guards: ineligible vehicles or inconsistent input are rejected at submission", () => {
  const store = freshStore();
  assert.equal(submitChargingRequest(store, { studentId: "A", hubId: DORM, vehicleId: "EV-04" }).code, "charging_vehicle_charging");
  assert.equal(shared(store, "EV-01", { hubId: DORM }).code, "charging_hub_mismatch");
  assert.equal(shared(store, "").code, "vehicle_required");
  assert.equal(shared(store, "EV-99").code, "vehicle_not_found");
  assert.equal(submitChargingRequest(store, { hubId: METRO, vehicleId: "EV-01" }).code, "student_required");

  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: Date.now() });
  assert.equal(shared(store, "EV-01").code, "charging_vehicle_busy");
  reportVehicleFailure(store, "EV-02");
  assert.equal(shared(store, "EV-02").code, "charging_vehicle_failed");
  assert.equal(store.getState().chargingRequests.length, 0);
});

test("AT-15 / FR-15: upcoming usage first, then lowest battery; never more assignments than free points", () => {
  const store = freshStore();
  const privateResult = privateEv(store); // 35%, priority 65
  shared(store, "EV-01"); // 82%, priority 18
  shared(store, "EV-02"); // 28% + upcoming usage, priority 1072

  assert.equal(priorityScore(requestFor(store, "EV-02")), 1072);
  assert.equal(priorityScore(privateResult.request), 65);
  assert.equal(priorityScore(requestFor(store, "EV-01")), 18);

  const applied = applyChargingSchedule(store, METRO);
  assert.equal(applied.code, "schedule_applied");
  assert.equal(applied.assigned.length, 2, "Metro has exactly two free charging points");
  assert.equal(requestFor(store, "EV-02").chargingPointId, "CP-01");
  assert.equal(requestFor(store, "Private EV 01").chargingPointId, "CP-02");
  assert.equal(requestFor(store, "EV-01").status, "queued");
  assert.deepEqual(applied.waiting.map((item) => item.vehicleLabel), ["EV-01"]);
  assert.equal(point(store, "CP-01").status, "occupied");
  assert.equal(point(store, "CP-02").status, "occupied");
  assert.equal(vehicle(store, "EV-02").status, "charging");

  const again = applyChargingSchedule(store, METRO);
  assert.equal(again.code, "schedule_nothing");
  assert.equal(again.assigned.length, 0);
  assert.equal(store.getState().chargingRequests.filter((item) => item.status === "scheduled").length, 2);
});

test("GUARD: a queued request whose vehicle was reserved meanwhile is put on hold, not scheduled", () => {
  const store = freshStore();
  assert.equal(shared(store, "EV-01").ok, true);
  assert.equal(reserveVehicle(store, { studentId: "B", vehicleId: "EV-01", now: T0 }).ok, true);

  const applied = applyChargingSchedule(store, METRO);
  assert.equal(applied.assigned.length, 0);
  assert.equal(requestFor(store, "EV-01").status, "queued");
  assert.deepEqual(applied.blocked.map((item) => item.blockedReason), ["vehicle_reserved"]);
  assert.equal(point(store, "CP-01").status, "available");
  assert.equal(vehicle(store, "EV-01").status, "reserved");

  // Once the hold expires the vehicle is available again and the request can be served.
  expireReservations(store, T0 + RESERVATION_HOLD_DURATION_MS);
  assert.equal(applyChargingSchedule(store, METRO).assigned.length, 1);
  assert.equal(vehicle(store, "EV-01").status, "charging");
});

test("GUARD: a queued request whose vehicle failed is put on hold and consumes no capacity", () => {
  const store = freshStore();
  shared(store, "EV-01");
  reportVehicleFailure(store, "EV-01");

  const applied = applyChargingSchedule(store, METRO);
  assert.equal(applied.assigned.length, 0);
  assert.equal(requestFor(store, "EV-01").status, "queued");
  assert.deepEqual(applied.blocked.map((item) => item.blockedReason), ["vehicle_failed"]);
  assert.equal(buildChargingSchedule(store.getState(), METRO).capacity, 2);
});

test("GUARD: a vehicle returned to another Hub is not charged at its old Hub", () => {
  const store = freshStore();
  shared(store, "EV-01");
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: Date.now() });
  pickUpVehicle(store, { studentId: "A", vehicleId: "EV-01" });
  assert.equal(returnVehicle(store, { vehicleId: "EV-01", destinationHubId: DORM, studentId: "A" }).ok, true);

  const applied = applyChargingSchedule(store, METRO);
  assert.equal(applied.assigned.length, 0);
  assert.deepEqual(applied.blocked.map((item) => item.blockedReason), ["vehicle_moved"]);
});

test("AT-09 / FR-09: a private EV holds a parking space and its linked request can be scheduled", () => {
  const store = freshStore();
  const result = privateEv(store);

  assert.equal(result.ok, true);
  assert.equal(result.code, "private_scheduled");
  assert.equal(result.parkingReservation.status, "active");
  assert.equal(result.parkingReservation.linkedChargingRequest, result.request.id);
  assert.equal(result.request.source, "private");
  assert.equal(result.request.battery, 35);

  const applied = applyChargingSchedule(store, METRO);
  assert.equal(applied.assigned.length, 1);
  assert.equal(requestFor(store, "Private EV 01").status, "scheduled");
});

test("FR-09 input validation: battery must be 0..100 and the label must be present and short", () => {
  const store = freshStore();
  for (const battery of ["", null, undefined, -1, 101, 150, "abc"]) {
    assert.equal(privateEv(store, { battery }).code, "invalid_battery", `battery=${battery}`);
  }
  assert.equal(privateEv(store, { vehicleLabel: "   " }).code, "private_label_required");
  assert.equal(privateEv(store, { vehicleLabel: "x".repeat(41) }).code, "private_label_too_long");
  assert.equal(privateEv(store, { battery: 0 }).ok, true, "0% is a valid (urgent) battery level");
  assert.equal(privateEv(store, { battery: "100" }).ok, true);
  assert.equal(store.getState().parkingReservations.length, 2, "rejected requests hold no parking");
});

test("FR-09: a private EV is rejected when the Hub has no free parking", () => {
  const store = freshStore();
  for (let i = 0; i < 3; i += 1) reserveParking(store, { studentId: "B", hubId: SERVICE }); // 3/6 + 3 held
  const result = privateEv(store, { hubId: SERVICE });
  assert.equal(result.ok, false);
  assert.equal(result.code, "private_parking_full");
  assert.equal(store.getState().chargingRequests.length, 0);
});

test("FR-14 + FR-15: an unavailable point re-queues its request and frees the vehicle for rescheduling", () => {
  const store = freshStore();
  shared(store, "EV-02");
  applyChargingSchedule(store, METRO);
  assert.equal(requestFor(store, "EV-02").chargingPointId, "CP-01");

  assert.equal(reportChargingPointUnavailable(store, "CP-01").ok, true);
  assert.equal(requestFor(store, "EV-02").status, "queued");
  assert.equal(requestFor(store, "EV-02").chargingPointId, null);
  assert.equal(vehicle(store, "EV-02").status, "available");

  const applied = applyChargingSchedule(store, METRO);
  assert.equal(applied.assigned.length, 1);
  assert.equal(requestFor(store, "EV-02").chargingPointId, "CP-02");
});
