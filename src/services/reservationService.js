import { nextId } from "../domain/ids.js";
import { failure, success } from "../domain/result.js";
import { ChargingRequestStatus, ReservationStatus, VehicleStatus } from "../domain/status.js";
import { toIso, toTimestamp } from "../domain/time.js";
import { changeStatus, readErrorActive } from "../domain/vehicle.js";
import { updateChargingAllocation } from "./chargingService.js";
import { getAvailableSlotsCount } from "./hubService.js";

// Traceability: FR-04..FR-07 / UC-04..UC-07 (Reserve Shared Vehicle, Reserve Parking Space,
// Pick Up / Return Shared Vehicle). Submission #3 names: ReservationService.reserveVehicle /
// expireReservations / getStudentReservations, Reservation.createIfFree / expireIfActive,
// Vehicle.getCurrentStatus / changeStatus, reserveParkingSpace.
// D-007 / ADR-04: hold duration of 15 minutes by default.
export const RESERVATION_HOLD_DURATION_MS = 15 * 60 * 1000;

function resolveHoldDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : RESERVATION_HOLD_DURATION_MS;
}

function hasActiveHold(reservation, now) {
  const expiresAt = toTimestamp(reservation.expiresAt);
  return reservation.status === ReservationStatus.ACTIVE && expiresAt !== null && expiresAt > now;
}

function hubName(state, hubId) {
  return state.hubs.find((item) => item.id === hubId)?.name ?? hubId;
}

// D-014: a student holds or uses at most one shared vehicle at a time.
export function getActiveTrip(state, studentId, now = Date.now()) {
  return state.reservations.find(
    (item) => item.studentId === studentId && (item.status === ReservationStatus.IN_USE || hasActiveHold(item, now)),
  ) ?? null;
}

// ReservationService.expireReservations + Reservation.expireIfActive (UC-04 A3, ADR-04).
export function expireReservations(store, now = Date.now()) {
  const timestamp = toTimestamp(now) ?? Date.now();
  const expiring = store.getState().reservations.filter((reservation) => {
    const expiresAt = toTimestamp(reservation.expiresAt);
    return reservation.status === ReservationStatus.ACTIVE && expiresAt !== null && expiresAt <= timestamp;
  });
  if (expiring.length === 0) return { ok: true, expired: [], vehicles: [] };

  const expiringIds = new Set(expiring.map((reservation) => reservation.id));
  store.update((draft) => {
    const hubs = new Set();
    for (const reservation of draft.reservations) {
      if (!expiringIds.has(reservation.id)) continue;
      reservation.status = ReservationStatus.EXPIRED;
      const vehicle = draft.vehicles.find((item) => item.id === reservation.vehicleId);
      // releaseIfStillReserved: another operational state (e.g. failed) is preserved.
      if (vehicle?.status === VehicleStatus.RESERVED && changeStatus(vehicle, VehicleStatus.AVAILABLE)) hubs.add(vehicle.hubId);
    }
    updateChargingAllocation(draft, [...hubs], timestamp);
  });
  return {
    ok: true,
    expired: [...expiringIds],
    vehicles: expiring.map((reservation) => reservation.vehicleId),
    studentIds: expiring.map((reservation) => reservation.studentId),
  };
}

// Vehicle.getCurrentStatus: fails while the simulated vehicle state cannot be read (UC-04 E2).
export function getCurrentStatus(state, vehicleId, now = Date.now()) {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return failure("vehicle_not_found", "Vehicle not found.", { vehicleId });
  if (readErrorActive(vehicle, now)) {
    return failure("state_unavailable", `The current state of ${vehicleId} cannot be read. Try again later.`, { vehicleId });
  }
  return success("status_read", `${vehicleId} is ${vehicle.status}.`, { vehicleId, status: vehicle.status }, { status: vehicle.status });
}

// Reservation.createIfFree: refuses when any active hold already exists for the vehicle (UC-04 E3).
export function createIfFree(state, { studentId, vehicleId, now, holdDurationMs }) {
  const existing = state.reservations.find((item) => item.vehicleId === vehicleId && hasActiveHold(item, now));
  if (existing) {
    return failure("reservation_conflict", `${vehicleId} has just been reserved by another user.`, { vehicleId });
  }
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  const reservation = {
    id: nextId("RSV", state.reservations),
    studentId,
    vehicleId,
    hubId: vehicle.hubId,
    status: ReservationStatus.ACTIVE,
    createdAt: toIso(now),
    expiresAt: toIso(now + resolveHoldDuration(holdDurationMs)),
  };
  return success("reservation_created", `${reservation.id} created.`, { vehicleId }, { reservation });
}

// ReservationService.reserveVehicle (UC-04 sequence): read the current state, recheck availability,
// create the hold if the vehicle is still free, then change the vehicle to Reserved.
export function reserveVehicle(store, { studentId, vehicleId, now = Date.now(), holdDurationMs } = {}) {
  if (!studentId) return failure("student_required", "A student identity is required.");
  const createdAtMs = toTimestamp(now) ?? Date.now();
  expireReservations(store, createdAtMs);
  const state = store.getState();
  const read = getCurrentStatus(state, vehicleId, createdAtMs);
  if (!read.ok) return read; // vehicle_not_found or E2 state_unavailable — nothing is created
  const trip = getActiveTrip(state, studentId, createdAtMs);
  if (trip) {
    return failure("student_has_trip", `You already have a trip with ${trip.vehicleId}. Finish or cancel it first.`, { vehicleId: trip.vehicleId });
  }
  const heldByOther = state.reservations.some(
    (item) => item.vehicleId === vehicleId && item.studentId !== studentId && hasActiveHold(item, createdAtMs),
  );
  if (heldByOther) return failure("reservation_conflict", `${vehicleId} has just been reserved by another user.`, { vehicleId });
  if (read.status !== VehicleStatus.AVAILABLE) {
    return failure("vehicle_not_available", `${vehicleId} is no longer available.`, { vehicleId }); // E1
  }
  const created = createIfFree(state, { studentId, vehicleId, now: createdAtMs, holdDurationMs });
  if (!created.ok) return created;
  const { reservation } = created;
  store.update((draft) => {
    changeStatus(draft.vehicles.find((item) => item.id === vehicleId), VehicleStatus.RESERVED);
    draft.reservations.push(reservation);
  });
  return success(
    "vehicle_reserved",
    `${vehicleId} reserved for ${studentId} until ${reservation.expiresAt}.`,
    { vehicleId, studentId, expiresAt: reservation.expiresAt },
    { reservation },
  );
}

// UC-04: the student releases the hold before pickup.
export function cancelReservation(store, { studentId, vehicleId, now = Date.now() } = {}) {
  const timestamp = toTimestamp(now) ?? Date.now();
  const reservation = store.getState().reservations.find(
    (item) => item.studentId === studentId && item.vehicleId === vehicleId && hasActiveHold(item, timestamp),
  );
  if (!reservation) return failure("hold_not_found", `There is no active hold on ${vehicleId} to cancel.`, { vehicleId });
  store.update((draft) => {
    draft.reservations.find((item) => item.id === reservation.id).status = ReservationStatus.CANCELLED;
    const vehicle = draft.vehicles.find((item) => item.id === vehicleId);
    if (vehicle?.status === VehicleStatus.RESERVED) changeStatus(vehicle, VehicleStatus.AVAILABLE);
    updateChargingAllocation(draft, [vehicle?.hubId].filter(Boolean), timestamp);
  });
  return success("hold_cancelled", `Hold on ${vehicleId} cancelled; the vehicle is available again.`, { vehicleId });
}

// UC-05 Reserve Parking Space (FR-SVU-11, FR-PEV-1): one space within capacity (D-004).
export function reserveParkingSpace(store, { studentId, hubId, vehicleType = "private", now = Date.now() } = {}) {
  if (!studentId) return failure("student_required", "A student identity is required.");
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return failure("hub_not_found", "Hub not found.", { hubId });
  const free = getAvailableSlotsCount(state, hubId);
  if (free <= 0) return failure("parking_full", `No parking capacity available at ${hub.name}.`, { hubName: hub.name });
  const reservation = {
    id: nextId("PRK", state.parkingReservations),
    studentId,
    hubId,
    vehicleType,
    status: ReservationStatus.ACTIVE,
    createdAt: toIso(now),
  };
  store.update((draft) => draft.parkingReservations.push(reservation));
  const available = free - 1;
  return success("parking_reserved", `Parking space reserved at ${hub.name}; ${available} left.`, { hubName: hub.name, available }, { reservation });
}

export function cancelParkingReservation(store, { studentId, reservationId } = {}) {
  const state = store.getState();
  const reservation = state.parkingReservations.find(
    (item) => item.id === reservationId && item.studentId === studentId && item.status === ReservationStatus.ACTIVE,
  );
  if (!reservation) return failure("parking_not_found", "Parking hold not found.", { reservationId });
  store.update((draft) => {
    draft.parkingReservations.find((item) => item.id === reservationId).status = ReservationStatus.CANCELLED;
  });
  const name = hubName(state, reservation.hubId);
  return success("parking_cancelled", `Parking hold at ${name} released.`, { hubName: name });
}

function explainMissingHold(state, { studentId, vehicleId, now }) {
  const heldByOther = state.reservations.some(
    (item) => item.vehicleId === vehicleId && item.studentId !== studentId && hasActiveHold(item, now),
  );
  if (heldByOther) return failure("reservation_other_student", `${vehicleId} is held by another student.`, { vehicleId });
  const latestOwn = state.reservations.filter((item) => item.vehicleId === vehicleId && item.studentId === studentId).at(-1);
  if (latestOwn?.status === ReservationStatus.EXPIRED) {
    return failure("reservation_expired", `The hold on ${vehicleId} expired before pickup.`, { vehicleId });
  }
  return failure("reservation_required", `An active reservation is required to pick up ${vehicleId}.`, { vehicleId });
}

// UC-06 Pick Up Shared Vehicle: only with an active hold; the trip starts and the vehicle is In use.
export function pickUpVehicle(store, { studentId, vehicleId, now = Date.now() } = {}) {
  const timestamp = toTimestamp(now) ?? Date.now();
  expireReservations(store, timestamp);
  const state = store.getState();
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return failure("vehicle_not_found", "Vehicle not found.", { vehicleId });
  const reservation = state.reservations.find(
    (item) => item.studentId === studentId && item.vehicleId === vehicleId && hasActiveHold(item, timestamp),
  );
  if (!reservation) return explainMissingHold(state, { studentId, vehicleId, now: timestamp });
  if (vehicle.status !== VehicleStatus.RESERVED) return failure("vehicle_not_ready", "Vehicle is not ready for pickup.", { vehicleId });

  const name = hubName(state, vehicle.hubId);
  store.update((draft) => {
    const target = draft.vehicles.find((item) => item.id === vehicleId);
    const hub = draft.hubs.find((item) => item.id === target.hubId);
    if (hub && hub.occupiedParking > 0) hub.occupiedParking -= 1;
    changeStatus(target, VehicleStatus.IN_USE);
    const trip = draft.reservations.find((item) => item.id === reservation.id);
    trip.status = ReservationStatus.IN_USE;
    trip.pickedUpAt = toIso(timestamp);
    // The vehicle leaves the Hub, so a charging request that has not started is withdrawn.
    for (const request of draft.chargingRequests) {
      if (request.vehicleId === vehicleId && [ChargingRequestStatus.SCHEDULED, ChargingRequestStatus.QUEUED].includes(request.status)) {
        request.status = ChargingRequestStatus.CANCELLED;
      }
    }
  });
  return success("vehicle_picked_up", `${vehicleId} picked up from ${name}.`, { vehicleId, hubName: name });
}

// UC-07 Return Shared Vehicle: only to a Hub with a free space; the trip ends.
export function returnVehicle(store, { vehicleId, destinationHubId, studentId = null, now = Date.now() } = {}) {
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === destinationHubId);
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!hub || !vehicle) return failure("return_not_found", "Vehicle or destination Hub not found.", { vehicleId });
  if (vehicle.status !== VehicleStatus.IN_USE) {
    return failure("return_not_in_use", `${vehicleId} must be in use before it can be returned.`, { vehicleId });
  }
  const inUse = state.reservations.find((item) => item.vehicleId === vehicleId && item.status === ReservationStatus.IN_USE);
  if (studentId && inUse?.studentId !== studentId) {
    return failure("return_not_owner", `${vehicleId} is in use by another student.`, { vehicleId });
  }
  if (getAvailableSlotsCount(state, destinationHubId) <= 0) {
    return failure("return_hub_full", `${hub.name} has no free parking space.`, { vehicleId, hubName: hub.name });
  }
  store.update((draft) => {
    const target = draft.vehicles.find((item) => item.id === vehicleId);
    draft.hubs.find((item) => item.id === destinationHubId).occupiedParking += 1;
    target.hubId = destinationHubId;
    changeStatus(target, VehicleStatus.AVAILABLE);
    const trip = draft.reservations.find((item) => item.vehicleId === vehicleId && item.status === ReservationStatus.IN_USE);
    if (trip) {
      trip.status = ReservationStatus.COMPLETED;
      trip.returnedAt = toIso(now);
      trip.returnHubId = destinationHubId;
    }
  });
  return success("vehicle_returned", `${vehicleId} returned to ${hub.name}.`, { vehicleId, hubName: hub.name });
}

// ReservationService.getStudentReservations (TC-UC04-11): only the records of this student.
export function getStudentReservations(state, studentId) {
  return {
    vehicles: state.reservations.filter((item) => item.studentId === studentId),
    parking: state.parkingReservations.filter((item) => item.studentId === studentId),
  };
}

// FR-STU-3/4: reservation status and trip history, newest first.
export function getTripHistory(state, studentId) {
  return getStudentReservations(state, studentId).vehicles.slice().reverse();
}
