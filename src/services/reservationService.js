import { createId } from "../domain/ids.js";
import { failure, success } from "../domain/result.js";
import { ReservationStatus, VehicleStatus } from "../domain/status.js";
import { summarizeHub } from "./hubService.js";

// Traceability: FR-04..FR-07 / UC-04..UC-07 / AT-04..AT-07.
// D-007: the hold duration is an MVP team decision, not a lecturer-provided value.
export const RESERVATION_HOLD_DURATION_MS = 15 * 60 * 1000;

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function resolveHoldDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : RESERVATION_HOLD_DURATION_MS;
}

function hasActiveHold(reservation, now) {
  const expiresAt = toTimestamp(reservation.expiresAt);
  return reservation.status === ReservationStatus.ACTIVE && expiresAt !== null && expiresAt > now;
}

export function expireReservations(store, now = Date.now()) {
  const timestamp = toTimestamp(now) ?? Date.now();
  const state = store.getState();
  const expiringIds = new Set(
    state.reservations
      .filter((reservation) => {
        const expiresAt = toTimestamp(reservation.expiresAt);
        return reservation.status === ReservationStatus.ACTIVE && expiresAt !== null && expiresAt <= timestamp;
      })
      .map((reservation) => reservation.id),
  );

  if (expiringIds.size === 0) return { ok: true, expired: [] };

  store.update((draft) => {
    for (const reservation of draft.reservations) {
      if (!expiringIds.has(reservation.id)) continue;
      reservation.status = ReservationStatus.EXPIRED;
      const vehicle = draft.vehicles.find((item) => item.id === reservation.vehicleId);
      if (vehicle?.status === VehicleStatus.RESERVED) vehicle.status = VehicleStatus.AVAILABLE;
    }
  });

  return { ok: true, expired: [...expiringIds] };
}

export function reserveVehicle(store, { studentId, vehicleId, now = Date.now(), holdDurationMs } = {}) {
  if (!studentId) return failure("student_required", "A student identity is required.");
  const createdAtMs = toTimestamp(now) ?? Date.now();
  expireReservations(store, createdAtMs);
  const state = store.getState();
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return failure("vehicle_not_found", "Vehicle not found.", { vehicleId });
  if (vehicle.status !== VehicleStatus.AVAILABLE) {
    return failure("vehicle_not_available", `${vehicleId} is not available.`, { vehicleId });
  }

  const reservation = {
    id: createId("reservation"),
    studentId,
    vehicleId,
    status: ReservationStatus.ACTIVE,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(createdAtMs + resolveHoldDuration(holdDurationMs)).toISOString(),
  };
  store.update((draft) => {
    const target = draft.vehicles.find((item) => item.id === vehicleId);
    target.status = VehicleStatus.RESERVED;
    draft.reservations.push(reservation);
  });
  return success(
    "vehicle_reserved",
    `${vehicleId} reserved for ${studentId} until ${reservation.expiresAt}.`,
    { vehicleId, studentId, expiresAt: reservation.expiresAt },
    { reservation },
  );
}

export function reserveParking(store, { studentId, hubId, vehicleType = "private" } = {}) {
  if (!studentId) return failure("student_required", "A student identity is required.");
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return failure("hub_not_found", "Hub not found.", { hubId });
  const summary = summarizeHub(state, hubId);
  if (!summary || summary.parkingAvailable <= 0) {
    return failure("parking_full", `No parking capacity available at ${hub.name}.`, { hubName: hub.name });
  }

  const reservation = { id: createId("parking"), studentId, hubId, vehicleType, status: ReservationStatus.ACTIVE };
  store.update((draft) => draft.parkingReservations.push(reservation));
  const available = summary.parkingAvailable - 1;
  return success(
    "parking_reserved",
    `Parking space reserved at ${hub.name}; ${available} left.`,
    { hubName: hub.name, available },
    { reservation },
  );
}

function explainMissingHold(state, { studentId, vehicleId, now }) {
  const heldByOther = state.reservations.some(
    (item) => item.vehicleId === vehicleId && item.studentId !== studentId && hasActiveHold(item, now),
  );
  if (heldByOther) {
    return failure("reservation_other_student", `${vehicleId} is held by another student.`, { vehicleId });
  }
  const latestOwn = state.reservations
    .filter((item) => item.vehicleId === vehicleId && item.studentId === studentId)
    .at(-1);
  if (latestOwn?.status === ReservationStatus.EXPIRED) {
    return failure("reservation_expired", `The hold on ${vehicleId} expired before pickup.`, { vehicleId });
  }
  return failure("reservation_required", `An active reservation is required to pick up ${vehicleId}.`, { vehicleId });
}

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
  if (vehicle.status !== VehicleStatus.RESERVED) {
    return failure("vehicle_not_ready", "Vehicle is not ready for pickup.", { vehicleId });
  }

  const hubName = state.hubs.find((item) => item.id === vehicle.hubId)?.name ?? vehicle.hubId;
  store.update((draft) => {
    const target = draft.vehicles.find((item) => item.id === vehicleId);
    const hub = draft.hubs.find((item) => item.id === target.hubId);
    if (hub && hub.occupiedParking > 0) hub.occupiedParking -= 1;
    target.status = VehicleStatus.IN_USE;
    draft.reservations.find((item) => item.id === reservation.id).status = ReservationStatus.IN_USE;
  });
  return success("vehicle_picked_up", `${vehicleId} picked up from ${hubName}.`, { vehicleId, hubName });
}

// `studentId` is optional for backward compatibility; when supplied, only the student
// holding the in-use reservation may return the vehicle.
export function returnVehicle(store, { vehicleId, destinationHubId, studentId = null } = {}) {
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === destinationHubId);
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!hub || !vehicle) return failure("return_not_found", "Vehicle or destination Hub not found.", { vehicleId });
  if (vehicle.status !== VehicleStatus.IN_USE) {
    return failure("return_not_in_use", `${vehicleId} must be in use before it can be returned.`, { vehicleId });
  }
  const inUseReservation = state.reservations.find(
    (item) => item.vehicleId === vehicleId && item.status === ReservationStatus.IN_USE,
  );
  if (studentId && inUseReservation?.studentId !== studentId) {
    return failure("return_not_owner", `${vehicleId} is in use by another student.`, { vehicleId });
  }
  const summary = summarizeHub(state, destinationHubId);
  if (!summary || summary.parkingAvailable <= 0) {
    return failure("return_hub_full", `${hub.name} has no free parking space.`, { vehicleId, hubName: hub.name });
  }

  store.update((draft) => {
    const target = draft.vehicles.find((item) => item.id === vehicleId);
    const newHub = draft.hubs.find((item) => item.id === destinationHubId);
    newHub.occupiedParking += 1;
    target.hubId = destinationHubId;
    target.status = VehicleStatus.AVAILABLE;
    const activeReservation = draft.reservations.find(
      (item) => item.vehicleId === vehicleId && item.status === ReservationStatus.IN_USE,
    );
    if (activeReservation) activeReservation.status = ReservationStatus.COMPLETED;
  });
  return success("vehicle_returned", `${vehicleId} returned to ${hub.name}.`, { vehicleId, hubName: hub.name });
}

export function getStudentReservations(state, studentId) {
  return {
    vehicles: state.reservations.filter((item) => item.studentId === studentId),
    parking: state.parkingReservations.filter((item) => item.studentId === studentId),
  };
}
