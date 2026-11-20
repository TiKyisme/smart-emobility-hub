import { ChargingPointStatus, ChargingRequestStatus, VehicleStatus } from "../domain/status.js";
import { summarizeHub } from "./hubService.js";

// Traceability: FR-19 / UC-20 / AT-19.
// D-005: manual updates apply immediately; optional automatic updates run every 15 seconds.
export const AUTO_UPDATE_INTERVAL_MS = 15000;
const MAX_RECORDED_EVENTS = 8;

function clampBattery(value) {
  return Math.min(100, Math.max(0, value));
}

function vehicleTelemetry(draft) {
  const vehicle = draft.vehicles.find((item) => item.status === VehicleStatus.AVAILABLE && item.battery > 0);
  if (!vehicle) return { code: "sim_refresh", params: {}, message: "Simulated operational state refreshed." };
  vehicle.battery = clampBattery(vehicle.battery - 1);
  return {
    code: "sim_battery",
    params: { vehicleId: vehicle.id, battery: vehicle.battery },
    message: `Telemetry update: ${vehicle.id} battery is now ${vehicle.battery}%.`,
  };
}

// D-004: a simulated arrival may only use a space that is neither physically occupied nor held.
function parkingSensor(draft) {
  const hub = draft.hubs.find((item) => (summarizeHub(draft, item.id)?.parkingAvailable ?? 0) > 0);
  if (!hub) {
    return { code: "sim_parking_full", params: {}, message: "Parking sensor update: every Hub is at capacity; no occupancy change." };
  }
  hub.occupiedParking += 1;
  return {
    code: "sim_parking",
    params: { hubName: hub.name, occupied: hub.occupiedParking, capacity: hub.parkingCapacity },
    message: `Parking sensor update: ${hub.name} occupancy is now ${hub.occupiedParking}/${hub.parkingCapacity}.`,
  };
}

// Simulated charging-point occupancy is temporary: the point the simulator occupied is released
// on the next charging tick. Points used by scheduled requests or real sessions are never touched.
function chargingTelemetry(draft) {
  const simulatedBusy = draft.chargingPoints.find((point) => point.simulatedOccupancy);
  if (simulatedBusy) {
    delete simulatedBusy.simulatedOccupancy;
    if (simulatedBusy.status === ChargingPointStatus.OCCUPIED) {
      simulatedBusy.status = ChargingPointStatus.AVAILABLE;
      return {
        code: "sim_point_free",
        params: { pointId: simulatedBusy.id },
        message: `Charging telemetry update: ${simulatedBusy.id} is available again.`,
      };
    }
  }

  const scheduledPointIds = new Set(
    draft.chargingRequests
      .filter((request) => request.status === ChargingRequestStatus.SCHEDULED)
      .map((request) => request.chargingPointId),
  );
  const point = draft.chargingPoints.find(
    (item) => item.status === ChargingPointStatus.AVAILABLE && !scheduledPointIds.has(item.id),
  );
  if (!point) {
    return { code: "sim_point_none", params: {}, message: "Charging telemetry update: no charging point changed state." };
  }
  point.status = ChargingPointStatus.OCCUPIED;
  point.simulatedOccupancy = true;
  return {
    code: "sim_point_busy",
    params: { pointId: point.id },
    message: `Charging telemetry update: ${point.id} is temporarily occupied.`,
  };
}

export function applySimulatedUpdate(store) {
  const state = store.getState();
  const sequence = (state.updateSequence ?? 0) + 1;
  let update = null;

  store.update((draft) => {
    const phase = (sequence - 1) % 4;
    if (phase === 0) update = vehicleTelemetry(draft);
    else if (phase === 1) update = parkingSensor(draft);
    else if (phase === 2) update = chargingTelemetry(draft);
    else {
      update = {
        code: "sim_routine",
        params: {},
        message: "Operational event update: the simulator reported a routine network refresh.",
      };
    }

    const at = new Date().toISOString();
    draft.updateSequence = sequence;
    draft.lastUpdate = { source: "simulator", ...update, at };
    draft.operationalEvents.unshift({
      id: `SIM-EVENT-${sequence}`,
      type: "simulated_state_update",
      status: "recorded",
      sequence,
      ...update,
      at,
    });
    draft.operationalEvents = draft.operationalEvents.slice(0, MAX_RECORDED_EVENTS);
  });

  return { ok: true, sequence, ...update };
}
