import { OTHER_STUDENT_PREFIX } from "../domain/actors.js";
import { failure, success } from "../domain/result.js";
import { ChargingPointStatus, ChargingRequestStatus, VehicleStatus } from "../domain/status.js";
import { toIso } from "../domain/time.js";
import { updateChargingAllocation } from "./chargingService.js";
import { getAvailableSlotsCount } from "./hubService.js";
import { reserveVehicle } from "./reservationService.js";

// Traceability: FR-19 / UC-20 (Data Simulator — Synchronize Resource State). Submission #3 names:
// DataSimulator.tickSimulator / getPortStatus, NetworkDatabase.updateResourceStatus.
// D-005: manual updates apply immediately; optional automatic updates run every 15 seconds.
export const AUTO_UPDATE_INTERVAL_MS = 15000;
// Team decision: a simulated read error lasts 10 seconds, then the state can be read again.
export const READ_ERROR_MS = 10000;
const MAX_RECORDED_EVENTS = 8;

const clampBattery = (value) => Math.min(100, Math.max(0, value));

function vehicleTelemetry(draft) {
  const vehicle = draft.vehicles.find((item) => item.status === VehicleStatus.AVAILABLE && item.battery > 0);
  if (!vehicle) return { code: "sim_refresh", params: {}, message: "Simulated operational state refreshed." };
  vehicle.battery = clampBattery(vehicle.battery - 1);
  return { code: "sim_battery", params: { vehicleId: vehicle.id, battery: vehicle.battery }, message: `Telemetry update: ${vehicle.id} battery is now ${vehicle.battery}%.` };
}

// D-004: a simulated arrival may only use a space that is neither physically occupied nor held.
function parkingSensor(draft) {
  const hub = draft.hubs.find((item) => getAvailableSlotsCount(draft, item.id) > 0);
  if (!hub) return { code: "sim_parking_full", params: {}, message: "Parking sensor update: every Hub is at capacity; no occupancy change." };
  hub.occupiedParking += 1;
  return {
    code: "sim_parking",
    params: { hubName: hub.name, occupied: hub.occupiedParking, capacity: hub.parkingCapacity },
    message: `Parking sensor update: ${hub.name} occupancy is now ${hub.occupiedParking}/${hub.parkingCapacity}.`,
  };
}

// D-010: simulated port occupancy is temporary — the port is released (and allocated) on the next
// charging tick; ports used by real sessions are never touched.
function chargingTelemetry(draft, now) {
  const simulatedBusy = draft.chargingPoints.find((point) => point.simulatedOccupancy);
  if (simulatedBusy) {
    delete simulatedBusy.simulatedOccupancy;
    if (simulatedBusy.status === ChargingPointStatus.OCCUPIED) {
      simulatedBusy.status = ChargingPointStatus.AVAILABLE;
      updateChargingAllocation(draft, [simulatedBusy.hubId], now);
      return { code: "sim_point_free", params: { pointId: simulatedBusy.id }, message: `Charging telemetry update: ${simulatedBusy.id} is available again.` };
    }
  }
  const sessionPoints = new Set(draft.chargingRequests
    .filter((request) => request.status === ChargingRequestStatus.CHARGING)
    .map((request) => request.chargingPointId));
  const point = draft.chargingPoints.find((item) => item.status === ChargingPointStatus.AVAILABLE && !sessionPoints.has(item.id));
  if (!point) return { code: "sim_point_none", params: {}, message: "Charging telemetry update: no charging point changed state." };
  point.status = ChargingPointStatus.OCCUPIED;
  point.simulatedOccupancy = true;
  return { code: "sim_point_busy", params: { pointId: point.id }, message: `Charging telemetry update: ${point.id} is temporarily occupied.` };
}

// NetworkDatabase.updateResourceStatus: one kind of simulated input per tick, in rotation.
export function updateResourceStatus(draft, phase, now = Date.now()) {
  if (phase === 0) return vehicleTelemetry(draft);
  if (phase === 1) return parkingSensor(draft);
  if (phase === 2) return chargingTelemetry(draft, now);
  return { code: "sim_routine", params: {}, message: "Operational event update: the simulator reported a routine network refresh." };
}

// DataSimulator.tickSimulator: applies one update and records it as an operational event.
export function tickSimulator(store, now = Date.now()) {
  const sequence = (store.getState().updateSequence ?? 0) + 1;
  let update = null;
  store.update((draft) => {
    update = updateResourceStatus(draft, (sequence - 1) % 4, now);
    const at = toIso(now);
    draft.updateSequence = sequence;
    draft.lastUpdate = { source: "simulator", ...update, at };
    draft.operationalEvents.unshift({ id: `SIM-EVENT-${sequence}`, type: "simulated_state_update", status: "recorded", sequence, ...update, at });
    draft.operationalEvents = draft.operationalEvents.slice(0, MAX_RECORDED_EVENTS);
  });
  return { ok: true, sequence, ...update };
}

// UC-04 E3 demonstration: another (simulated) student reserves the vehicle first. The normal
// reservation service is used, so every business rule still applies.
export function simulateCompetingReservation(store, { vehicleId, now = Date.now(), holdDurationMs } = {}) {
  const others = new Set(store.getState().reservations.map((item) => item.studentId).filter((id) => id.startsWith(OTHER_STUDENT_PREFIX)));
  const studentId = `${OTHER_STUDENT_PREFIX}-${String(others.size + 1).padStart(2, "0")}`;
  const result = reserveVehicle(store, { studentId, vehicleId, now, holdDurationMs });
  if (!result.ok) return result;
  return success("sim_competing_reservation", `${studentId} reserved ${vehicleId} first.`, { vehicleId, studentId });
}

// UC-04 E2 / UC-09 E2 demonstration: the simulated state of a vehicle, or of the ports of a Hub,
// cannot be read for READ_ERROR_MS. Nothing else changes.
export function simulateStateReadError(store, { vehicleId = null, hubId = null, now = Date.now(), durationMs = READ_ERROR_MS } = {}) {
  const until = toIso(now + durationMs);
  const state = store.getState();
  if (vehicleId) {
    if (!state.vehicles.some((item) => item.id === vehicleId)) return failure("vehicle_not_found", "Vehicle not found.", { vehicleId });
    store.update((draft) => { draft.vehicles.find((item) => item.id === vehicleId).readErrorUntil = until; });
    return success("sim_read_error_vehicle", `The state of ${vehicleId} cannot be read for ${durationMs / 1000} s.`, { vehicleId, seconds: durationMs / 1000 });
  }
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return failure("hub_not_found", "Hub not found.", { hubId });
  store.update((draft) => {
    for (const point of draft.chargingPoints.filter((item) => item.hubId === hubId)) point.readErrorUntil = until;
  });
  return success("sim_read_error_ports", `Port status at ${hub.name} cannot be read for ${durationMs / 1000} s.`, { hubName: hub.name, seconds: durationMs / 1000 });
}
