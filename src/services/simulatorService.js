import { ChargingPointStatus, ChargingRequestStatus, VehicleStatus } from "../domain/status.js";

// Traceability: FR-19 / UC-20 / AT-19.
function clampBattery(value) {
  return Math.min(100, Math.max(0, value));
}

function createEvent(sequence, message) {
  return {
    id: `SIM-EVENT-${sequence}`,
    type: "simulated_state_update",
    status: "recorded",
    sequence,
    message,
    at: new Date().toISOString(),
  };
}

export function applySimulatedUpdate(store) {
  const state = store.getState();
  const sequence = (state.updateSequence ?? 0) + 1;
  let message = "Simulated operational state refreshed.";

  store.update((draft) => {
    const phase = (sequence - 1) % 4;

    if (phase === 0) {
      const vehicle = draft.vehicles.find(
        (item) => item.status === VehicleStatus.AVAILABLE && item.battery > 0,
      );
      if (vehicle) {
        vehicle.battery = clampBattery(vehicle.battery - 1);
        message = `Telemetry update: ${vehicle.id} battery is now ${vehicle.battery}%.`;
      }
    } else if (phase === 1) {
      const hub = draft.hubs.find((item) => item.occupiedParking < item.parkingCapacity);
      if (hub) {
        hub.occupiedParking += 1;
        message = `Parking sensor update: ${hub.name} occupancy is now ${hub.occupiedParking}/${hub.parkingCapacity}.`;
      }
    } else if (phase === 2) {
      const scheduledPointIds = new Set(
        draft.chargingRequests
          .filter((request) => request.status === ChargingRequestStatus.SCHEDULED)
          .map((request) => request.chargingPointId),
      );
      const point = draft.chargingPoints.find(
        (item) => item.status === ChargingPointStatus.AVAILABLE && !scheduledPointIds.has(item.id),
      );
      if (point) {
        point.status = ChargingPointStatus.OCCUPIED;
        message = `Charging telemetry update: ${point.id} is temporarily occupied.`;
      } else {
        const occupiedPoint = draft.chargingPoints.find(
          (item) => item.status === ChargingPointStatus.OCCUPIED && !scheduledPointIds.has(item.id),
        );
        if (occupiedPoint) {
          occupiedPoint.status = ChargingPointStatus.AVAILABLE;
          message = `Charging telemetry update: ${occupiedPoint.id} is available again.`;
        }
      }
    } else {
      message = "Operational event update: the simulator reported a routine network refresh.";
    }

    draft.updateSequence = sequence;
    draft.lastUpdate = { source: "simulator", message, at: new Date().toISOString() };
    draft.operationalEvents.unshift(createEvent(sequence, message));
    draft.operationalEvents = draft.operationalEvents.slice(0, 8);
  });

  return { ok: true, sequence, message };
}
