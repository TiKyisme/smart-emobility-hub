import { nextId } from "../domain/ids.js";
import { failure, success } from "../domain/result.js";
import {
  ChargingPointStatus,
  ChargingRequestStatus,
  IncidentStatus,
  ReservationStatus,
  VehicleStatus,
} from "../domain/status.js";
import { allocateChargingPoints } from "./chargingService.js";
import { listHubSummaries, summarizeHub } from "./hubService.js";

// Traceability: FR-10..FR-14 / UC-11..UC-15 / AT-10..AT-14.
// FR-12: Hubs are ranked by (physical + held) parking utilization. The assignment gives no
// numeric "approaching capacity" threshold, so only the ranking and the at-capacity flag are shown.
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
    openIncidents: state.incidents.filter((item) => item.status === IncidentStatus.OPEN).length,
    queuedChargingRequests: state.chargingRequests.filter((item) => item.status === ChargingRequestStatus.QUEUED).length,
  };
}

export function reportVehicleFailure(store, vehicleId) {
  const state = store.getState();
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return failure("vehicle_not_found", "Vehicle not found.", { vehicleId });
  if (vehicle.status === VehicleStatus.FAILED) {
    return failure("vehicle_already_failed", `${vehicleId} is already marked as failed.`, { vehicleId });
  }
  const incidentId = nextId("INC", state.incidents);
  store.update((draft) => {
    const target = draft.vehicles.find((item) => item.id === vehicleId);
    const wasInUse = target.status === VehicleStatus.IN_USE;
    target.status = VehicleStatus.FAILED;
    for (const reservation of draft.reservations.filter(
      (item) => item.vehicleId === vehicleId && [ReservationStatus.ACTIVE, ReservationStatus.IN_USE].includes(item.status),
    )) reservation.status = ReservationStatus.CANCELLED;
    // A failed vehicle releases its charging point; its request waits on hold until the repair.
    for (const request of draft.chargingRequests.filter(
      (item) => item.vehicleId === vehicleId && item.status === ChargingRequestStatus.SCHEDULED,
    )) {
      const point = draft.chargingPoints.find((item) => item.id === request.chargingPointId);
      if (point?.status === ChargingPointStatus.OCCUPIED) point.status = ChargingPointStatus.AVAILABLE;
      request.status = ChargingRequestStatus.QUEUED;
      request.chargingPointId = null;
    }
    draft.incidents.push({
      id: incidentId,
      type: "vehicle_failure",
      resourceId: vehicleId,
      hubId: target.hubId,
      status: IncidentStatus.OPEN,
      wasInUse,
      openedAt: new Date().toISOString(),
      resolvedAt: null,
    });
    allocateChargingPoints(draft, [target.hubId]);
  });
  return success("vehicle_failure_reported", `${vehicleId} marked failed (${incidentId}).`, { vehicleId, incidentId });
}

export function reportChargingPointUnavailable(store, chargingPointId) {
  const state = store.getState();
  const point = state.chargingPoints.find((item) => item.id === chargingPointId);
  if (!point) return failure("point_not_found", "Charging point not found.", { pointId: chargingPointId });
  if (point.status === ChargingPointStatus.UNAVAILABLE) {
    return failure("point_already_unavailable", `${chargingPointId} is already unavailable.`, { pointId: chargingPointId });
  }
  const incidentId = nextId("INC", state.incidents);
  store.update((draft) => {
    const target = draft.chargingPoints.find((item) => item.id === chargingPointId);
    target.status = ChargingPointStatus.UNAVAILABLE;
    delete target.simulatedOccupancy;
    // Requests charging on this point go back to the queue and their vehicle stops charging,
    // so the automatic allocation can move them to another free point.
    for (const request of draft.chargingRequests.filter(
      (item) => item.chargingPointId === chargingPointId && item.status === ChargingRequestStatus.SCHEDULED,
    )) {
      request.status = ChargingRequestStatus.QUEUED;
      request.chargingPointId = null;
      const vehicle = request.vehicleId ? draft.vehicles.find((item) => item.id === request.vehicleId) : null;
      if (vehicle?.status === VehicleStatus.CHARGING) vehicle.status = VehicleStatus.AVAILABLE;
    }
    draft.incidents.push({
      id: incidentId,
      type: "charging_point_unavailable",
      resourceId: chargingPointId,
      hubId: target.hubId,
      status: IncidentStatus.OPEN,
      openedAt: new Date().toISOString(),
      resolvedAt: null,
    });
    allocateChargingPoints(draft, [target.hubId]);
  });
  return success("point_unavailable_reported", `${chargingPointId} marked unavailable (${incidentId}).`, { pointId: chargingPointId, incidentId });
}

// FR-14: closing an incident returns the resource to service (D-016).
export function resolveIncident(store, incidentId) {
  const state = store.getState();
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident) return failure("incident_not_found", "Incident not found.", { incidentId });
  if (incident.status !== IncidentStatus.OPEN) {
    return failure("incident_already_resolved", `${incidentId} is already resolved.`, { incidentId });
  }

  if (incident.type === "vehicle_failure") {
    const vehicle = state.vehicles.find((item) => item.id === incident.resourceId);
    if (!vehicle) return failure("vehicle_not_found", "Vehicle not found.", { vehicleId: incident.resourceId });
    const hub = state.hubs.find((item) => item.id === vehicle.hubId);
    // A vehicle that broke down during a trip is brought back to its Hub and needs a free space there.
    if (incident.wasInUse && (summarizeHub(state, hub.id)?.parkingAvailable ?? 0) <= 0) {
      return failure("repair_hub_full", `${hub.name} has no free space for the repaired ${vehicle.id}.`, { vehicleId: vehicle.id, hubName: hub.name });
    }
    store.update((draft) => {
      const record = draft.incidents.find((item) => item.id === incidentId);
      record.status = IncidentStatus.RESOLVED;
      record.resolvedAt = new Date().toISOString();
      const target = draft.vehicles.find((item) => item.id === vehicle.id);
      if (target.status === VehicleStatus.FAILED) target.status = VehicleStatus.AVAILABLE;
      if (incident.wasInUse) draft.hubs.find((item) => item.id === hub.id).occupiedParking += 1;
      allocateChargingPoints(draft, [hub.id]);
    });
    return success("vehicle_repaired", `${vehicle.id} repaired and available at ${hub.name}.`, { vehicleId: vehicle.id, hubName: hub.name, incidentId });
  }

  let assigned = [];
  store.update((draft) => {
    const record = draft.incidents.find((item) => item.id === incidentId);
    record.status = IncidentStatus.RESOLVED;
    record.resolvedAt = new Date().toISOString();
    const point = draft.chargingPoints.find((item) => item.id === incident.resourceId);
    if (point?.status === ChargingPointStatus.UNAVAILABLE) point.status = ChargingPointStatus.AVAILABLE;
    assigned = allocateChargingPoints(draft, [point?.hubId].filter(Boolean));
  });
  const next = assigned.find((item) => item.chargingPointId === incident.resourceId);
  return next
    ? success("point_restored_next", `${incident.resourceId} is back in service; ${next.vehicleLabel} now charges there.`, { pointId: incident.resourceId, nextLabel: next.vehicleLabel, incidentId })
    : success("point_restored", `${incident.resourceId} is back in service.`, { pointId: incident.resourceId, incidentId });
}

function hasOpenChargingRequest(state, vehicleId) {
  return state.chargingRequests.some(
    (item) => item.vehicleId === vehicleId && [ChargingRequestStatus.QUEUED, ChargingRequestStatus.SCHEDULED].includes(item.status),
  );
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
    code: "redistribution_suggested",
    params: { fromHub: source.name, toHub: destination.name },
    message: `Consider redistributing vehicles from ${source.name} to ${destination.name}.`,
  };
}

export function coordinateRedistribution(store, recommendation) {
  if (!recommendation) return failure("redistribution_none", "No redistribution recommendation is available.");
  const state = store.getState();
  const source = state.hubs.find((hub) => hub.id === recommendation.fromHubId);
  const destination = state.hubs.find((hub) => hub.id === recommendation.toHubId);
  // Vehicles waiting for a charging point stay where their request was made.
  const vehicle = state.vehicles.find(
    (item) => item.hubId === recommendation.fromHubId && item.status === VehicleStatus.AVAILABLE && !hasOpenChargingRequest(state, item.id),
  );
  const destinationSummary = destination ? summarizeHub(state, destination.id) : null;

  if (!source || !destination || !vehicle) {
    return failure("redistribution_no_vehicle", "No available vehicle can be moved from the recommended source Hub.");
  }
  if (!destinationSummary || destinationSummary.parkingAvailable <= 0) {
    return failure("redistribution_destination_full", "The recommended destination Hub has no parking capacity.");
  }

  store.update((draft) => {
    const movingVehicle = draft.vehicles.find((item) => item.id === vehicle.id);
    const sourceHub = draft.hubs.find((hub) => hub.id === source.id);
    const destinationHub = draft.hubs.find((hub) => hub.id === destination.id);
    if (sourceHub.occupiedParking > 0) sourceHub.occupiedParking -= 1;
    destinationHub.occupiedParking += 1;
    movingVehicle.hubId = destination.id;
  });

  return success(
    "redistribution_done",
    `${vehicle.id} coordinated from ${source.name} to ${destination.name}.`,
    { vehicleId: vehicle.id, fromHub: source.name, toHub: destination.name },
  );
}
