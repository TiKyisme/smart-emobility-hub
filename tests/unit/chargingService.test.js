// UC-09 Schedule Private EV Charging and Manage Smart Charging (FR-08, FR-09, FR-15; ADR-05, D-015, D-019).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ChargingPointStatus, ChargingRequestStatus, VehicleStatus } from "../../src/domain/status.js";
import {
  advanceChargingClock,
  buildChargingSchedule,
  cancelChargingRequest,
  checkAvailability,
  compareByPriority,
  createChargingSession,
  finishCharging,
  getAvailableSlots,
  isPriorityRequest,
  optimizeQueue,
  priorityScore,
  rescheduleChargingRequest,
  scheduleSharedVehicleCharging,
} from "../../src/services/chargingService.js";
import { reserveVehicle } from "../../src/services/reservationService.js";
import { simulateStateReadError } from "../../src/services/simulatorService.js";
import { DORM, freshStore, METRO, MINUTE, NVH, OTHER, point, request, requestFor, slotAt, STUDENT, T0, vehicle } from "./helpers.js";

const book = (store, label, { hubId = METRO, offset = 0, battery = 40, upcomingUsage = false, now = T0, studentId = STUDENT } = {}) =>
  createChargingSession(store, { studentId, hubId, slotStart: slotAt(offset), vehicleLabel: label, battery, upcomingUsage, now });

test("ADR-05 priority: battery below 20 % or early departure first, then lower battery, then registration time", () => {
  assert.equal(isPriorityRequest({ battery: 19, upcomingUsage: false }), true);
  assert.equal(isPriorityRequest({ battery: 20, upcomingUsage: false }), false);
  assert.equal(isPriorityRequest({ battery: 90, upcomingUsage: true }), true);
  assert.ok(priorityScore({ battery: 60, upcomingUsage: true }) > priorityScore({ battery: 25 }));
  assert.ok(priorityScore({ battery: 10 }) > priorityScore({ battery: 60, upcomingUsage: true }));
  const sorted = [
    { id: "C", battery: 50, createdAt: "2026-11-20T08:03:00Z" },
    { id: "A", battery: 50, createdAt: "2026-11-20T08:01:00Z" },
    { id: "B", battery: 15, createdAt: "2026-11-20T08:05:00Z" },
  ].sort(compareByPriority).map((item) => item.id);
  assert.deepEqual(sorted, ["B", "A", "C"]);
});

test("getAvailableSlots / checkAvailability: free ports per slot; a full slot offers other slots and Hubs (A1)", () => {
  const state = freshStore().getState();
  const metro = getAvailableSlots(state, METRO, T0);
  assert.equal(metro[0].slotStart, slotAt(0));
  assert.equal(metro[0].free, 2);
  assert.equal(checkAvailability(state, METRO, slotAt(0), T0).code, "slot_available");
  // KTX Khu A has one port and EM-201 charges on it in the current slot.
  const full = checkAvailability(state, DORM, slotAt(0), T0);
  assert.equal(full.code, "slot_full");
  assert.ok(full.alternatives.length > 0);
  assert.equal(Date.parse(full.alternatives[0].slotStart), slotAt(1));
  assert.ok(full.otherHubs.length > 0 && full.otherHubs.every((item) => item.hubId !== DORM && item.free > 0));
});

test("checkAvailability: no working port (E1), unreadable port status (E2), invalid slots", () => {
  const store = freshStore();
  store.update((draft) => { draft.chargingPoints.find((item) => item.id === "CP-14").status = ChargingPointStatus.UNAVAILABLE; });
  assert.equal(checkAvailability(store.getState(), NVH, slotAt(1), T0).code, "slot_no_port");
  simulateStateReadError(store, { hubId: METRO, now: T0, durationMs: 10000 });
  assert.equal(checkAvailability(store.getState(), METRO, slotAt(1), T0 + 1000).code, "port_status_unavailable");
  assert.equal(checkAvailability(store.getState(), METRO, slotAt(1), T0 + 10000).code, "slot_available");
  assert.equal(checkAvailability(store.getState(), METRO, slotAt(-1), T0).code, "slot_invalid", "a slot that has ended");
  assert.equal(checkAvailability(store.getState(), METRO, slotAt(0) + 30 * MINUTE, T0).code, "slot_invalid", "not on a full hour");
  assert.equal(checkAvailability(store.getState(), METRO, slotAt(60), T0).code, "slot_invalid", "after tomorrow");
});

test("createChargingSession: a later slot is booked (Scheduled); the current slot starts on a free port", () => {
  const store = freshStore();
  const later = book(store, "59A-123.45", { offset: 3 });
  assert.equal(later.code, "session_scheduled");
  assert.equal(later.request.status, ChargingRequestStatus.SCHEDULED);
  assert.equal(later.request.chargingPointId, null);
  const now = book(store, "51A-111.11");
  assert.equal(now.code, "session_started");
  assert.equal(now.request.status, ChargingRequestStatus.CHARGING);
  assert.equal(point(store, now.request.chargingPointId).status, ChargingPointStatus.OCCUPIED);
});

test("createChargingSession: input checks, duplicate label and slot capacity (NFR-03)", () => {
  const store = freshStore();
  assert.equal(book(store, " ").code, "private_label_required");
  assert.equal(book(store, "x".repeat(41)).code, "private_label_too_long");
  assert.equal(createChargingSession(store, { studentId: STUDENT, hubId: METRO, slotStart: slotAt(1), vehicleLabel: "A", battery: "", now: T0 }).code, "invalid_battery");
  assert.equal(book(store, "A", { offset: 1 }).ok, true);
  assert.equal(book(store, "a", { offset: 2 }).code, "private_duplicate");
  assert.equal(book(store, "B", { offset: 1 }).ok, true);
  assert.equal(book(store, "C", { offset: 1 }).code, "slot_full", "two ports at the Metro Hub");
});

test("advanceChargingClock: bookings start with their slot and end with it; the owner is notified (FR-PEV-5)", () => {
  const store = freshStore();
  const booking = book(store, "59A-123.45", { offset: 1 }).request;
  assert.deepEqual(advanceChargingClock(store, T0 + 10 * MINUTE).assigned, [], "nothing due yet");
  const started = advanceChargingClock(store, slotAt(1));
  assert.equal(started.assigned[0].requestId, booking.id);
  assert.equal(request(store, booking.id).status, ChargingRequestStatus.CHARGING);
  // The seeded session of EM-201 ended with the previous slot.
  assert.equal(request(store, "CHG-001").status, ChargingRequestStatus.COMPLETED);
  assert.equal(vehicle(store, "EM-201").battery, 100);
  assert.equal(vehicle(store, "EM-201").status, VehicleStatus.AVAILABLE);
  const ended = advanceChargingClock(store, slotAt(2));
  assert.equal(ended.completed[0].requestId, booking.id);
  assert.equal(point(store, request(store, booking.id).chargingPointId).status, ChargingPointStatus.AVAILABLE);
  const notice = store.getState().notifications.at(-1);
  assert.equal(notice.code, "notify_charging_complete");
  assert.equal(notice.recipientId, STUDENT);
  assert.equal(notice.params.label, "59A-123.45");
});

test("ports go to the highest-priority waiting request when a slot is over capacity", () => {
  const store = freshStore();
  // KTX Khu A: one port, busy with EM-201. Two shared vehicles wait in the current slot.
  store.update((draft) => {
    for (const id of ["EB-103", "EB-105"]) {
      draft.chargingRequests.push({
        id: `CHG-T${id}`, status: ChargingRequestStatus.QUEUED, source: "shared", studentId: null, hubId: DORM,
        vehicleId: id, vehicleLabel: id, battery: id === "EB-103" ? 61 : 90, upcomingUsage: id === "EB-105",
        chargingPointId: null, slotStart: new Date(slotAt(0)).toISOString(), slotEnd: new Date(slotAt(1)).toISOString(),
        createdAt: new Date(T0).toISOString(),
      });
    }
  });
  const schedule = buildChargingSchedule(store.getState(), DORM, T0);
  assert.deepEqual(schedule.waiting.map((item) => item.vehicleId), ["EB-105", "EB-103"], "upcoming usage first");
  const result = finishCharging(store, "CP-03", T0);
  assert.equal(result.code, "charging_finished_next");
  assert.equal(result.params.nextLabel, "EB-105");
  assert.equal(vehicle(store, "EB-105").status, VehicleStatus.CHARGING);
});

test("Manage Smart Charging: a shared vehicle gets the earliest free slot; busy or duplicate vehicles are refused", () => {
  const store = freshStore();
  assert.equal(scheduleSharedVehicleCharging(store, { vehicleId: "EB-102", now: T0 }).code, "charging_started");
  assert.equal(scheduleSharedVehicleCharging(store, { vehicleId: "EB-102", now: T0 }).code, "charging_vehicle_charging");
  assert.equal(scheduleSharedVehicleCharging(store, { vehicleId: "EB-103", now: T0 }).code, "charging_scheduled", "KTX Khu A is full now");
  assert.equal(scheduleSharedVehicleCharging(store, { vehicleId: "EB-103", now: T0 }).code, "charging_duplicate");
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  assert.equal(scheduleSharedVehicleCharging(store, { vehicleId: "EB-101", now: T0 }).code, "charging_vehicle_busy");
  assert.equal(scheduleSharedVehicleCharging(store, { hubId: DORM, vehicleId: "EM-203", now: T0 }).code, "charging_hub_mismatch");
  assert.equal(requestFor(store, "EB-102").upcomingUsage, true, "D-008: taken from the vehicle record");
});

test("D-009: a shared request whose vehicle is reserved stays on hold and does not take a port", () => {
  const store = freshStore();
  scheduleSharedVehicleCharging(store, { vehicleId: "EB-103", now: T0 }); // booked for the next slot at KTX Khu A
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-103", now: T0 });
  advanceChargingClock(store, slotAt(1));
  const schedule = buildChargingSchedule(store.getState(), DORM, slotAt(1));
  assert.equal(schedule.blocked[0]?.vehicleId, "EB-103");
  assert.equal(schedule.blocked[0].blockedReason, "vehicle_reserved");
  assert.equal(point(store, "CP-03").status, ChargingPointStatus.AVAILABLE);
});

test("cancel and reschedule: the student cancels an own booking; the operator moves a booking later", () => {
  const store = freshStore();
  const mine = book(store, "59A-1", { offset: 2 }).request;
  assert.equal(cancelChargingRequest(store, { requestId: mine.id, studentId: OTHER, now: T0 }).code, "request_not_found");
  assert.equal(cancelChargingRequest(store, { requestId: mine.id, studentId: STUDENT, now: T0 }).code, "charging_cancelled");
  const charging = book(store, "59A-2").request;
  assert.equal(cancelChargingRequest(store, { requestId: charging.id, now: T0 }).code, "charging_cancel_not_allowed");
  const later = book(store, "59A-3", { offset: 1 }).request;
  const moved = rescheduleChargingRequest(store, { requestId: later.id, now: T0 });
  assert.equal(moved.code, "charging_rescheduled");
  assert.equal(Date.parse(request(store, later.id).slotStart), slotAt(2));
});

test("optimizeQueue: after a port failure, the lowest-priority booking of an over-capacity slot moves later", () => {
  const store = freshStore();
  const urgent = book(store, "URGENT", { offset: 2, battery: 10 }).request;
  const normal = book(store, "NORMAL", { offset: 2, battery: 70 }).request;
  store.update((draft) => { draft.chargingPoints.find((item) => item.id === "CP-02").status = ChargingPointStatus.UNAVAILABLE; });
  const slot = buildChargingSchedule(store.getState(), METRO, T0).upcoming.find((item) => Date.parse(item.slotStart) === slotAt(2));
  assert.deepEqual(slot.bookings.map((item) => [item.vehicleLabel, item.overbooked]), [["URGENT", false], ["NORMAL", true]]);
  const result = optimizeQueue(store, METRO, T0);
  assert.equal(result.code, "queue_optimized");
  assert.equal(Date.parse(request(store, urgent.id).slotStart), slotAt(2));
  assert.equal(Date.parse(request(store, normal.id).slotStart), slotAt(3));
  assert.equal(optimizeQueue(store, METRO, T0).code, "queue_optimal");
});
