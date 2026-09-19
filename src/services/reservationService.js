import { ReservationStatus, VehicleStatus } from "../domain/status.js";
import { summarizeHub } from "./hubService.js";

// Traceability: FR-04..FR-07 / UC-04..UC-07 / AT-04..AT-07.
function createId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function reserveVehicle(store, { studentId, vehicleId }) {
  const state = store.getState();
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return { ok: false, message: "Vehicle not found." };
  if (vehicle.status !== VehicleStatus.AVAILABLE) return { ok: false, message: "Vehicle is not available." };

  const reservation = { id: createId("reservation"), studentId, vehicleId, status: ReservationStatus.ACTIVE };
  store.update((draft) => {
    const target = draft.vehicles.find((item) => item.id === vehicleId);
    target.status = VehicleStatus.RESERVED;
    draft.reservations.push(reservation);
  });
  return { ok: true, reservation };
}

export function reserveParking(store, { studentId, hubId, vehicleType = "private" }) {
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return { ok: false, message: "Hub not found." };
  const summary = summarizeHub(state, hubId);
  if (!summary || summary.parkingAvailable <= 0) return { ok: false, message: "No parking capacity available." };

  const reservation = { id: createId("parking"), studentId, hubId, vehicleType, status: ReservationStatus.ACTIVE };
  store.update((draft) => draft.parkingReservations.push(reservation));
  return { ok: true, reservation };
}

export function pickUpVehicle(store, { studentId, vehicleId }) {
  const state = store.getState();
  const reservation = state.reservations.find(
    (item) =>
      item.studentId === studentId &&
      item.vehicleId === vehicleId &&
      item.status === ReservationStatus.ACTIVE,
  );
  if (!reservation) return { ok: false, message: "Active reservation required." };
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle || vehicle.status !== VehicleStatus.RESERVED) {
    return { ok: false, message: "Vehicle is not ready for pickup." };
  }

  store.update((draft) => {
    const target = draft.vehicles.find((item) => item.id === vehicleId);
    const hub = draft.hubs.find((item) => item.id === target.hubId);
    if (hub && hub.occupiedParking > 0) hub.occupiedParking -= 1;
    target.status = VehicleStatus.IN_USE;
    draft.reservations.find((item) => item.id === reservation.id).status = ReservationStatus.IN_USE;
  });
  return { ok: true };
}

export function returnVehicle(store, { vehicleId, destinationHubId }) {
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === destinationHubId);
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!hub || !vehicle) return { ok: false, message: "Vehicle or destination Hub not found." };
  if (vehicle.status !== VehicleStatus.IN_USE) return { ok: false, message: "Vehicle must be in use before it can be returned." };
  const summary = summarizeHub(state, destinationHubId);
  if (!summary || summary.parkingAvailable <= 0) return { ok: false, message: "Destination Hub has no parking capacity." };

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
  return { ok: true };
}

export function getStudentReservations(state, studentId) {
  return {
    vehicles: state.reservations.filter((item) => item.studentId === studentId),
    parking: state.parkingReservations.filter((item) => item.studentId === studentId),
  };
}
