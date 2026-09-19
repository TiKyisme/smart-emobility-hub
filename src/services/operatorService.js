import { ChargingPointStatus, ChargingRequestStatus, ReservationStatus, VehicleStatus } from "../domain/status.js";
import { listHubSummaries, summarizeHub } from "./hubService.js";

// Traceability: FR-10..FR-14 / UC-11..UC-15 / AT-10..AT-14.
export function getCapacityRisks(state) {
  return listHubSummaries(state)
    .map((hub) => ({
      ...hub,
      utilization: hub.parkingCapacity ? hub.usedParking / hub.parkingCapacity : 0,
      atCapacity: hub.parkingAvailable <= 0,
    }))
    .sort((a, b) => b.utilization - a.utilization);
}

export function getNetworkMetrics(state) {
  return {
    hubs: state.hubs.length,
    vehicles: state.vehicles.length,
    availableVehicles: state.vehicles.filter((item) => item.status === VehicleStatus.AVAILABLE).length,
    chargingPoints: state.chargingPoints.length,
    availableChargingPoints: state.chargingPoints.filter((item) => item.status === ChargingPointStatus.AVAILABLE).length,
    openIncidents: state.incidents.filter((item) => item.status === "open").length,
    queuedChargingRequests: state.chargingRequests.filter((item) => item.status === "queued").length,
  };
}

export function reportVehicleFailure(store, vehicleId) {
  const state = store.getState();
  if (!state.vehicles.some((item) => item.id === vehicleId)) return { ok: false, message: "Vehicle not found." };
  if (state.vehicles.find((item) => item.id === vehicleId).status === VehicleStatus.FAILED) {
    return { ok: false, message: "Vehicle is already marked as failed." };
  }
  store.update((draft) => {
    draft.vehicles.find((item) => item.id === vehicleId).status = VehicleStatus.FAILED;
    for (const reservation of draft.reservations.filter(
      (item) => item.vehicleId === vehicleId && [ReservationStatus.ACTIVE, ReservationStatus.IN_USE].includes(item.status),
    )) reservation.status = "cancelled";
    for (const request of draft.chargingRequests.filter(
      (item) => item.vehicleId === vehicleId && item.status === ChargingRequestStatus.SCHEDULED,
    )) {
      const point = draft.chargingPoints.find((item) => item.id === request.chargingPointId);
      if (point?.status === ChargingPointStatus.OCCUPIED) point.status = ChargingPointStatus.AVAILABLE;
      request.status = ChargingRequestStatus.QUEUED;
      request.chargingPointId = null;
    }
    draft.incidents.push({ id: createId("incident"), type: "vehicle_failure", resourceId: vehicleId, status: "open" });
  });
  return { ok: true, message: `${vehicleId} marked failed and incident opened.` };
}

export function reportChargingPointUnavailable(store, chargingPointId) {
  const state = store.getState();
  if (!state.chargingPoints.some((item) => item.id === chargingPointId)) return { ok: false, message: "Charging point not found." };
  if (state.chargingPoints.find((item) => item.id === chargingPointId).status === ChargingPointStatus.UNAVAILABLE) {
    return { ok: false, message: "Charging point is already unavailable." };
  }
  store.update((draft) => {
    draft.chargingPoints.find((item) => item.id === chargingPointId).status = ChargingPointStatus.UNAVAILABLE;
    for (const request of draft.chargingRequests.filter((item) => item.chargingPointId === chargingPointId && item.status === ChargingRequestStatus.SCHEDULED)) {
      request.status = ChargingRequestStatus.QUEUED;
      request.chargingPointId = null;
    }
    draft.incidents.push({
      id: createId("incident"),
      type: "charging_point_unavailable",
      resourceId: chargingPointId,
      status: "open",
    });
  });
  return { ok: true, message: `${chargingPointId} marked unavailable and incident opened.` };
}

function createId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function suggestRedistribution(state) {
  const ordered = getCapacityRisks(state);
  const source = ordered.find((hub) => hub.availableVehicles > 0) ?? ordered[0];
  const destination = [...ordered].reverse().find((hub) => hub.id !== source?.id && hub.parkingAvailable > 0) ?? [...ordered].reverse()[0];
  if (!source || !destination || source.id === destination.id) return null;
  return {
    fromHubId: source.id,
    toHubId: destination.id,
    vehicleCount: Math.max(1, Math.min(source.availableVehicles || 1, destination.parkingAvailable || 1)),
    message: `Consider redistributing vehicles from ${source.name} to ${destination.name}.`,
  };
}

export function coordinateRedistribution(store, recommendation) {
  if (!recommendation) return { ok: false, message: "No redistribution recommendation is available." };
  const state = store.getState();
  const source = state.hubs.find((hub) => hub.id === recommendation.fromHubId);
  const destination = state.hubs.find((hub) => hub.id === recommendation.toHubId);
  const vehicle = state.vehicles.find(
    (item) => item.hubId === recommendation.fromHubId && item.status === VehicleStatus.AVAILABLE,
  );
  const destinationSummary = destination ? summarizeHub(state, destination.id) : null;

  if (!source || !destination || !vehicle) return { ok: false, message: "No available vehicle can be moved from the recommended source Hub." };
  if (!destinationSummary || destinationSummary.parkingAvailable <= 0) {
    return { ok: false, message: "The recommended destination Hub has no parking capacity." };
  }

  store.update((draft) => {
    const movingVehicle = draft.vehicles.find((item) => item.id === vehicle.id);
    const sourceHub = draft.hubs.find((hub) => hub.id === source.id);
    const destinationHub = draft.hubs.find((hub) => hub.id === destination.id);
    if (sourceHub.occupiedParking > 0) sourceHub.occupiedParking -= 1;
    destinationHub.occupiedParking += 1;
    movingVehicle.hubId = destination.id;
  });

  return { ok: true, message: `${vehicle.id} coordinated from ${source.name} to ${destination.name}.` };
}
