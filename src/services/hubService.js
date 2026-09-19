import { VehicleStatus, ChargingPointStatus } from "../domain/status.js";

function getActiveParkingReservations(state, hubId) {
  return state.parkingReservations.filter(
    (reservation) => reservation.hubId === hubId && reservation.status === "active",
  );
}

export function summarizeHub(state, hubId) {
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return null;

  const vehicles = state.vehicles.filter((item) => item.hubId === hubId);
  const chargingPoints = state.chargingPoints.filter((item) => item.hubId === hubId);
  const reservedParking = getActiveParkingReservations(state, hubId).length;
  const usedParking = hub.occupiedParking + reservedParking;

  return {
    ...hub,
    reservedParking,
    usedParking,
    parkingAvailable: Math.max(0, hub.parkingCapacity - usedParking),
    availableVehicles: vehicles.filter((item) => item.status === VehicleStatus.AVAILABLE).length,
    availableChargingPoints: chargingPoints.filter((item) => item.status === ChargingPointStatus.AVAILABLE).length,
  };
}

export function listHubSummaries(state) {
  return state.hubs.map((hub) => summarizeHub(state, hub.id));
}

export function findSuitableVehicles(state, { hubId = null, minimumBattery = 0 } = {}) {
  return state.vehicles.filter((vehicle) => {
    const matchesHub = !hubId || vehicle.hubId === hubId;
    return matchesHub && vehicle.status === VehicleStatus.AVAILABLE && vehicle.battery >= minimumBattery;
  });
}

export function findSuitableHubs(state, { minimumParking = 0, chargingRequired = false } = {}) {
  return listHubSummaries(state).filter(
    (hub) => hub.parkingAvailable >= minimumParking && (!chargingRequired || hub.availableChargingPoints > 0),
  );
}
