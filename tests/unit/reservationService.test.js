// FR-04..FR-07 / UC-04..UC-07 / AT-04..AT-07, NFR-02, NFR-03, D-014
import assert from "node:assert/strict";
import { test } from "node:test";
import { schedulePrivateEvCharging, submitChargingRequest } from "../../src/services/chargingService.js";
import { summarizeHub } from "../../src/services/hubService.js";
import {
  cancelParkingReservation,
  cancelReservation,
  expireReservations,
  getActiveTrip,
  pickUpVehicle,
  RESERVATION_HOLD_DURATION_MS,
  reserveParking,
  reserveVehicle,
  returnVehicle,
} from "../../src/services/reservationService.js";
import { CAMPUS, DORM, freshStore, hub, METRO, point, requestFor, SERVICE, T0, vehicle } from "./helpers.js";

test("AT-04: reserving an available vehicle records createdAt/expiresAt and holds it for the student", () => {
  const store = freshStore();
  const result = reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });

  assert.equal(result.ok, true);
  assert.equal(result.code, "vehicle_reserved");
  assert.equal(result.reservation.id, "RSV-001");
  assert.equal(RESERVATION_HOLD_DURATION_MS, 15 * 60 * 1000, "D-007 default hold is 15 minutes");
  assert.equal(Date.parse(result.reservation.createdAt), T0);
  assert.equal(Date.parse(result.reservation.expiresAt), T0 + RESERVATION_HOLD_DURATION_MS);
  assert.equal(result.reservation.status, "active");
  assert.equal(vehicle(store, "EV-01").status, "reserved");
});

test("NFR-02: a second student cannot reserve a vehicle that is already held", () => {
  const store = freshStore();
  assert.equal(reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 }).ok, true);
  const second = reserveVehicle(store, { studentId: "B", vehicleId: "EV-01", now: T0 + 1_000 });
  assert.equal(second.ok, false);
  assert.equal(second.code, "vehicle_not_available");
  assert.equal(store.getState().reservations.filter((item) => item.status === "active").length, 1);
});

test("D-014: a student holds or uses one vehicle at a time", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  const second = reserveVehicle(store, { studentId: "A", vehicleId: "EV-02", now: T0 + 1 });
  assert.equal(second.ok, false);
  assert.equal(second.code, "student_has_trip");
  assert.equal(vehicle(store, "EV-02").status, "available");

  pickUpVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 + 2 });
  assert.equal(reserveVehicle(store, { studentId: "A", vehicleId: "EV-02", now: T0 + 3 }).code, "student_has_trip");
  returnVehicle(store, { vehicleId: "EV-01", destinationHubId: DORM, studentId: "A" });
  assert.equal(getActiveTrip(store.getState(), "A", T0 + 4), null);
  assert.equal(reserveVehicle(store, { studentId: "A", vehicleId: "EV-02", now: T0 + 5 }).ok, true);
});

test("FR-04 expiry boundary: active 1 ms before expiresAt, expired exactly at expiresAt", () => {
  const store = freshStore();
  const { reservation } = reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  const expiresAt = Date.parse(reservation.expiresAt);

  assert.deepEqual(expireReservations(store, expiresAt - 1).expired, []);
  assert.equal(vehicle(store, "EV-01").status, "reserved");

  const expired = expireReservations(store, expiresAt);
  assert.deepEqual(expired.expired, [reservation.id]);
  assert.deepEqual(expired.vehicles, ["EV-01"]);
  assert.equal(vehicle(store, "EV-01").status, "available");
  assert.equal(store.getState().reservations[0].status, "expired");
});

test("FR-04 alternative flow: after expiry another student may reserve the released vehicle", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  const later = reserveVehicle(store, { studentId: "B", vehicleId: "EV-01", now: T0 + RESERVATION_HOLD_DURATION_MS });
  assert.equal(later.ok, true);
  assert.deepEqual(store.getState().reservations.map((item) => item.status), ["expired", "active"]);
});

test("UC-04 A1: the student can cancel a hold before pickup", () => {
  const store = freshStore();
  assert.equal(cancelReservation(store, { studentId: "A", vehicleId: "EV-01", now: T0 }).code, "hold_not_found");
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  assert.equal(cancelReservation(store, { studentId: "B", vehicleId: "EV-01", now: T0 + 1 }).code, "hold_not_found");

  const cancelled = cancelReservation(store, { studentId: "A", vehicleId: "EV-01", now: T0 + 2 });
  assert.equal(cancelled.code, "hold_cancelled");
  assert.equal(store.getState().reservations[0].status, "cancelled");
  assert.equal(vehicle(store, "EV-01").status, "available");
});

test("D-007: a demo hold duration is honoured; invalid values fall back to the 15-minute default", () => {
  const store = freshStore();
  const short = reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0, holdDurationMs: 30_000 });
  assert.equal(Date.parse(short.reservation.expiresAt) - T0, 30_000);

  for (const invalid of [-5, 0, Number.NaN, "60"]) {
    const other = freshStore();
    const result = reserveVehicle(other, { studentId: "A", vehicleId: "EV-01", now: T0, holdDurationMs: invalid });
    assert.equal(Date.parse(result.reservation.expiresAt) - T0, RESERVATION_HOLD_DURATION_MS, `fallback for ${invalid}`);
  }
});

test("AT-06: pickup requires the same student's active, unexpired hold", () => {
  const store = freshStore();
  assert.equal(pickUpVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 }).code, "reservation_required");

  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  const wrongStudent = pickUpVehicle(store, { studentId: "B", vehicleId: "EV-01", now: T0 + 1 });
  assert.equal(wrongStudent.code, "reservation_other_student");
  assert.equal(vehicle(store, "EV-01").status, "reserved");

  const pickup = pickUpVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 + 2 });
  assert.equal(pickup.code, "vehicle_picked_up");
  assert.equal(vehicle(store, "EV-01").status, "in_use");
  assert.equal(store.getState().reservations[0].status, "in_use");
  assert.equal(hub(store, METRO).occupiedParking, 3, "the vehicle leaves its origin parking space");
  assert.deepEqual(expireReservations(store, T0 + 10 * RESERVATION_HOLD_DURATION_MS).expired, [], "an in-use trip never expires");
});

test("AT-06: pickup after the hold expired is rejected and the vehicle is released", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  const late = pickUpVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 + RESERVATION_HOLD_DURATION_MS });
  assert.equal(late.code, "reservation_expired");
  assert.equal(vehicle(store, "EV-01").status, "available");
});

test("pickup withdraws the vehicle's charging request that is still waiting at the Hub", () => {
  const store = freshStore();
  submitChargingRequest(store, { studentId: "X", hubId: METRO, vehicleId: "EV-02" }); // takes CP-01
  schedulePrivateEvCharging(store, { studentId: "X", hubId: METRO, vehicleLabel: "PRIV-1", battery: 50 }); // takes CP-02
  submitChargingRequest(store, { studentId: "X", hubId: METRO, vehicleId: "EV-01" }); // waits
  assert.equal(requestFor(store, "EV-01").status, "queued");

  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: Date.now() });
  pickUpVehicle(store, { studentId: "A", vehicleId: "EV-01" });
  assert.equal(requestFor(store, "EV-01").status, "cancelled");
});

test("AT-07: return needs an in-use vehicle and a destination with free capacity (physical + held)", () => {
  const store = freshStore();
  assert.equal(returnVehicle(store, { vehicleId: "EV-01", destinationHubId: DORM }).code, "return_not_in_use");

  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  pickUpVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 + 1 });
  for (let i = 0; i < 3; i += 1) assert.equal(reserveParking(store, { studentId: "P", hubId: DORM }).ok, true);

  const full = returnVehicle(store, { vehicleId: "EV-01", destinationHubId: DORM, studentId: "A" });
  assert.equal(full.code, "return_hub_full");
  assert.equal(vehicle(store, "EV-01").status, "in_use");

  const done = returnVehicle(store, { vehicleId: "EV-01", destinationHubId: CAMPUS, studentId: "A" });
  assert.equal(done.code, "vehicle_returned");
  assert.equal(vehicle(store, "EV-01").hubId, CAMPUS);
  assert.equal(vehicle(store, "EV-01").status, "available");
  assert.equal(store.getState().reservations[0].status, "completed");
  assert.equal(store.getState().reservations[0].returnHubId, CAMPUS);
  assert.equal(hub(store, CAMPUS).occupiedParking, 6);
});

test("AT-07 ownership: another student cannot return a vehicle that is in use", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  pickUpVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 + 1 });
  assert.equal(returnVehicle(store, { vehicleId: "EV-01", destinationHubId: CAMPUS, studentId: "B" }).code, "return_not_owner");
});

test("AT-05 / NFR-03: parking holds never exceed Hub capacity, and cancelling frees the space", () => {
  const store = freshStore();
  const ids = [];
  for (let i = 0; i < 4; i += 1) ids.push(reserveParking(store, { studentId: "A", hubId: METRO }).reservation.id);
  assert.deepEqual(ids, ["PRK-001", "PRK-002", "PRK-003", "PRK-004"]);

  assert.equal(reserveParking(store, { studentId: "A", hubId: METRO }).code, "parking_full");
  assert.equal(summarizeHub(store.getState(), METRO).parkingAvailable, 0);

  assert.equal(cancelParkingReservation(store, { studentId: "B", reservationId: "PRK-001" }).code, "parking_not_found");
  assert.equal(cancelParkingReservation(store, { studentId: "A", reservationId: "PRK-001" }).code, "parking_cancelled");
  assert.equal(summarizeHub(store.getState(), METRO).parkingAvailable, 1);
  assert.equal(reserveParking(store, { studentId: "A", hubId: SERVICE }).params.available, 2);
});

test("releasing a private EV's space stops its session and hands the point to the next request", () => {
  const store = freshStore();
  submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId: "EV-02" }); // CP-01
  const charging = schedulePrivateEvCharging(store, { studentId: "A", hubId: METRO, vehicleLabel: "PRIV-1", battery: 40 }); // CP-02
  submitChargingRequest(store, { studentId: "A", hubId: METRO, vehicleId: "EV-01" }); // waits
  assert.equal(charging.request.chargingPointId, "CP-02");

  cancelParkingReservation(store, { studentId: "A", reservationId: charging.parkingReservation.id });
  assert.equal(requestFor(store, "PRIV-1").status, "cancelled");
  assert.equal(requestFor(store, "EV-01").chargingPointId, "CP-02");
  assert.equal(point(store, "CP-02").status, "occupied");
});

test("input guards: unknown vehicle/Hub and missing identity are rejected without state changes", () => {
  const store = freshStore();
  const before = JSON.stringify(store.getState());
  assert.equal(reserveVehicle(store, { studentId: "A", vehicleId: "EV-99", now: T0 }).code, "vehicle_not_found");
  assert.equal(reserveVehicle(store, { vehicleId: "EV-01", now: T0 }).code, "student_required");
  assert.equal(reserveParking(store, { studentId: "A", hubId: "H-NOPE" }).code, "hub_not_found");
  assert.equal(pickUpVehicle(store, { studentId: "A", vehicleId: "EV-99", now: T0 }).code, "vehicle_not_found");
  assert.equal(returnVehicle(store, { vehicleId: "EV-01", destinationHubId: "H-NOPE" }).code, "return_not_found");
  assert.equal(JSON.stringify(store.getState()), before);
});
