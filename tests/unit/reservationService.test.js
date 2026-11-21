// UC-04 Reserve Shared Vehicle (incl. TC-UC04-01..11 of the Submission #3 appendix), UC-05 parking,
// UC-06 pickup and UC-07 return.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ChargingRequestStatus, ReservationStatus, VehicleStatus } from "../../src/domain/status.js";
import { createChargingSession, scheduleSharedVehicleCharging } from "../../src/services/chargingService.js";
import { getAvailableSlotsCount } from "../../src/services/hubService.js";
import {
  cancelParkingReservation,
  cancelReservation,
  expireReservations,
  getActiveTrip,
  getStudentReservations,
  getTripHistory,
  pickUpVehicle,
  RESERVATION_HOLD_DURATION_MS,
  reserveParkingSpace,
  reserveVehicle,
  returnVehicle,
} from "../../src/services/reservationService.js";
import { simulateStateReadError } from "../../src/services/simulatorService.js";
import { freshStore, hub, LIB, METRO, MINUTE, NVH, OTHER, slotAt, STUDENT, T0, UEL, vehicle } from "./helpers.js";

test("TC-UC04-01: an available vehicle is reserved, held and time-stamped", () => {
  const store = freshStore();
  const result = reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  assert.equal(result.ok, true);
  assert.equal(result.code, "vehicle_reserved");
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.RESERVED);
  assert.equal(result.reservation.status, ReservationStatus.ACTIVE);
  assert.equal(result.reservation.createdAt, new Date(T0).toISOString());
  assert.equal(Date.parse(result.reservation.expiresAt) - T0, RESERVATION_HOLD_DURATION_MS);
});

test("TC-UC04-02 / E3: a vehicle held by another student is refused as a conflict; nothing changes", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: OTHER, vehicleId: "EB-101", now: T0 });
  const before = JSON.stringify(store.getState());
  const result = reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + MINUTE });
  assert.equal(result.ok, false);
  assert.equal(result.code, "reservation_conflict");
  assert.equal(JSON.stringify(store.getState()), before);
});

test("TC-UC04-03: an unknown vehicle id is refused without touching the store", () => {
  const store = freshStore();
  const before = JSON.stringify(store.getState());
  assert.equal(reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-999", now: T0 }).code, "vehicle_not_found");
  assert.equal(JSON.stringify(store.getState()), before);
});

test("TC-UC04-04 / A3: an expired hold becomes Expired and the vehicle is available again", () => {
  const store = freshStore();
  const { reservation } = reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  const expiresAt = Date.parse(reservation.expiresAt);
  assert.deepEqual(expireReservations(store, expiresAt - 1).expired, []);
  const result = expireReservations(store, expiresAt);
  assert.deepEqual(result.expired, [reservation.id]);
  assert.equal(store.getState().reservations[0].status, ReservationStatus.EXPIRED);
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.AVAILABLE);
});

test("TC-UC04-05: expiry never touches trips in use or completed", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  pickUpVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + MINUTE });
  reserveVehicle(store, { studentId: OTHER, vehicleId: "EM-203", now: T0 });
  pickUpVehicle(store, { studentId: OTHER, vehicleId: "EM-203", now: T0 + MINUTE });
  returnVehicle(store, { vehicleId: "EM-203", destinationHubId: METRO, studentId: OTHER, now: T0 + 2 * MINUTE });
  const result = expireReservations(store, T0 + 10 * RESERVATION_HOLD_DURATION_MS);
  assert.deepEqual(result.expired, []);
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.IN_USE);
  assert.deepEqual(store.getState().reservations.map((item) => item.status), [ReservationStatus.IN_USE, ReservationStatus.COMPLETED]);
});

test("TC-UC04-06: two students reserving the same vehicle — exactly one succeeds", () => {
  const store = freshStore();
  const results = [STUDENT, OTHER].map((studentId) => reserveVehicle(store, { studentId, vehicleId: "EB-102", now: T0 }));
  assert.deepEqual(results.map((item) => item.ok), [true, false]);
  assert.equal(store.getState().reservations.filter((item) => item.vehicleId === "EB-102").length, 1);
});

test("TC-UC04-07: pickup before expiry starts the trip (Reserved → In use)", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  const result = pickUpVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + 14 * MINUTE });
  assert.equal(result.code, "vehicle_picked_up");
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.IN_USE);
  assert.equal(getActiveTrip(store.getState(), STUDENT, T0 + 14 * MINUTE).status, ReservationStatus.IN_USE);
  assert.equal(hub(store, METRO).occupiedParking, 3, "the vehicle left its space");
});

test("TC-UC04-08: pickup after expiry is refused and the vehicle is not put in use", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  const result = pickUpVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + RESERVATION_HOLD_DURATION_MS });
  assert.equal(result.code, "reservation_expired");
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.AVAILABLE);
});

test("TC-UC04-09 (A1): without confirmation no reservation exists — the confirm step is tested in the browser run (S2)", () => {
  const store = freshStore();
  assert.equal(store.getState().reservations.length, 0);
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.AVAILABLE);
});

test("TC-UC04-10 / E2: an unreadable vehicle state creates no reservation; a retry after the error succeeds", () => {
  const store = freshStore();
  simulateStateReadError(store, { vehicleId: "EB-101", now: T0, durationMs: 10000 });
  const failed = reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + 5000 });
  assert.equal(failed.code, "state_unavailable");
  assert.equal(store.getState().reservations.length, 0);
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.AVAILABLE);
  assert.equal(reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + 10000 }).ok, true);
});

test("TC-UC04-11: a student's history contains only that student's reservations, newest first", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  reserveVehicle(store, { studentId: OTHER, vehicleId: "EM-203", now: T0 });
  cancelReservation(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + MINUTE });
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-102", now: T0 + 2 * MINUTE });
  const mine = getStudentReservations(store.getState(), STUDENT).vehicles;
  assert.deepEqual(mine.map((item) => item.vehicleId), ["EB-101", "EB-102"]);
  assert.ok(mine.every((item) => item.studentId === STUDENT));
  assert.deepEqual(getTripHistory(store.getState(), STUDENT).map((item) => item.vehicleId), ["EB-102", "EB-101"]);
});

test("E1: a vehicle that is no longer available (charging, failed) is refused", () => {
  const store = freshStore();
  assert.equal(reserveVehicle(store, { studentId: STUDENT, vehicleId: "EM-201", now: T0 }).code, "vehicle_not_available");
  store.update((draft) => { draft.vehicles.find((item) => item.id === "EB-101").status = VehicleStatus.FAILED; });
  assert.equal(reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 }).code, "vehicle_not_available");
});

test("D-014: one trip per student; cancelling the hold frees the vehicle", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  assert.equal(reserveVehicle(store, { studentId: STUDENT, vehicleId: "EM-203", now: T0 }).code, "student_has_trip");
  assert.equal(cancelReservation(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + MINUTE }).code, "hold_cancelled");
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.AVAILABLE);
  assert.equal(reserveVehicle(store, { studentId: STUDENT, vehicleId: "EM-203", now: T0 + 2 * MINUTE }).ok, true);
});

test("pickup requires the student's own active hold", () => {
  const store = freshStore();
  assert.equal(pickUpVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 }).code, "reservation_required");
  reserveVehicle(store, { studentId: OTHER, vehicleId: "EB-101", now: T0 });
  assert.equal(pickUpVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 }).code, "reservation_other_student");
});

test("UC-07: return only to a Hub with a free space; the trip is completed", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  pickUpVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + MINUTE });
  store.update((draft) => { draft.hubs.find((item) => item.id === UEL).occupiedParking = 8; });
  assert.equal(returnVehicle(store, { vehicleId: "EB-101", destinationHubId: UEL, studentId: STUDENT }).code, "return_hub_full");
  assert.equal(returnVehicle(store, { vehicleId: "EB-101", destinationHubId: LIB, studentId: OTHER }).code, "return_not_owner");
  const result = returnVehicle(store, { vehicleId: "EB-101", destinationHubId: LIB, studentId: STUDENT, now: T0 + 30 * MINUTE });
  assert.equal(result.code, "vehicle_returned");
  assert.equal(vehicle(store, "EB-101").hubId, LIB);
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.AVAILABLE);
  assert.equal(hub(store, LIB).occupiedParking, 4);
  const trip = store.getState().reservations[0];
  assert.equal(trip.status, ReservationStatus.COMPLETED);
  assert.equal(trip.returnHubId, LIB);
});

test("UC-05: parking holds stay within capacity and can be released", () => {
  const store = freshStore();
  const free = getAvailableSlotsCount(store.getState(), NVH);
  for (let index = 0; index < free; index += 1) {
    assert.equal(reserveParkingSpace(store, { studentId: STUDENT, hubId: NVH, now: T0 }).code, "parking_reserved");
  }
  assert.equal(reserveParkingSpace(store, { studentId: STUDENT, hubId: NVH, now: T0 }).code, "parking_full");
  const [first] = getStudentReservations(store.getState(), STUDENT).parking;
  assert.equal(cancelParkingReservation(store, { studentId: OTHER, reservationId: first.id }).code, "parking_not_found");
  assert.equal(cancelParkingReservation(store, { studentId: STUDENT, reservationId: first.id }).code, "parking_cancelled");
  assert.equal(getAvailableSlotsCount(store.getState(), NVH), 1);
});

test("pickup withdraws the vehicle's charging request that has not started", () => {
  const store = freshStore();
  // Fill both METRO ports for the current slot so the shared request is booked for a later slot.
  createChargingSession(store, { studentId: OTHER, hubId: METRO, slotStart: slotAt(0), vehicleLabel: "59A-1", battery: 40, now: T0 });
  createChargingSession(store, { studentId: OTHER, hubId: METRO, slotStart: slotAt(0), vehicleLabel: "59A-2", battery: 40, now: T0 });
  const booked = scheduleSharedVehicleCharging(store, { vehicleId: "EB-102", now: T0 });
  assert.equal(booked.code, "charging_scheduled");
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-102", now: T0 });
  pickUpVehicle(store, { studentId: STUDENT, vehicleId: "EB-102", now: T0 + MINUTE });
  assert.equal(store.getState().chargingRequests.find((item) => item.vehicleId === "EB-102").status, ChargingRequestStatus.CANCELLED);
});
