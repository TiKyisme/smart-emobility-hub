import { DISPATCH_STAFF_ID, MAINTENANCE_STAFF_ID } from "../domain/actors.js";
import { nextId } from "../domain/ids.js";
import { failure, success } from "../domain/result.js";
import {
  ChargingPointStatus,
  ChargingRequestStatus,
  DispatchOrderStatus,
  IncidentSeverity,
  IncidentStatus,
  MaintenanceTaskStatus,
  ReservationStatus,
  VehicleStatus,
} from "../domain/status.js";
import { toIso } from "../domain/time.js";
import { changeStatus, getBatteryLevel, isOperational } from "../domain/vehicle.js";
import { optimizeQueue, scheduleSharedVehicleCharging, updateChargingAllocation } from "./chargingService.js";
import { getAvailableSlotsCount, getThresholds, listHubSummaries } from "./hubService.js";

export { getBatteryLevel, isOperational };

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;
const OPEN_CHARGING = [ChargingRequestStatus.SCHEDULED, ChargingRequestStatus.QUEUED, ChargingRequestStatus.CHARGING];

/* ---------- Monitor Network Status (FR-10..FR-12 / UC-11..UC-13; FR-OPT-1..6) ---------- */

// detectCapacityRisks: Hubs ranked by parking utilization (parked + held, D-004) with the
// configured overload and vehicle-shortage flags.
export function detectCapacityRisks(state) {
  const { overloadPercent, shortageVehicles } = getThresholds(state);
  return listHubSummaries(state)
    .map((hub) => ({
      ...hub,
      overloaded: hub.utilizationPercent >= overloadPercent,
      shortage: hub.availableVehicles < shortageVehicles,
      atCapacity: hub.parkingAvailable <= 0,
    }))
    .sort((a, b) => b.utilization - a.utilization || a.name.localeCompare(b.name));
}

// identifyBottlenecks: alerts for the operator (FR-OPT-4 overload, FR-OPT-5/6 vehicle shortage).
export function identifyBottlenecks(state) {
  const { overloadPercent, shortageVehicles } = getThresholds(state);
  const risks = detectCapacityRisks(state);
  return [
    ...risks.filter((hub) => hub.overloaded).map((hub) => ({
      type: "overload", hubId: hub.id, hubName: hub.name, value: hub.utilizationPercent, threshold: overloadPercent,
    })),
    ...risks.filter((hub) => hub.shortage).sort((a, b) => a.availableVehicles - b.availableVehicles).map((hub) => ({
      type: "shortage", hubId: hub.id, hubName: hub.name, value: hub.availableVehicles, threshold: shortageVehicles,
    })),
  ];
}

export function updateAlertThresholds(store, { overloadPercent, shortageVehicles } = {}) {
  const overload = Number(overloadPercent);
  const shortage = Number(shortageVehicles);
  if (!Number.isInteger(overload) || overload < 50 || overload > 100 || !Number.isInteger(shortage) || shortage < 0 || shortage > 10) {
    return failure("thresholds_invalid", "Overload: 50–100 %; shortage: 0–10 vehicles.");
  }
  store.update((draft) => {
    draft.settings = { ...getThresholds(draft), overloadPercent: overload, shortageVehicles: shortage };
  });
  return success("thresholds_updated", `Alert thresholds: overload ≥ ${overload} %, shortage < ${shortage} vehicles.`, { overload, shortage });
}

export function getNetworkMetrics(state) {
  return {
    hubs: state.hubs.length,
    vehicles: state.vehicles.length,
    availableVehicles: state.vehicles.filter((item) => item.status === VehicleStatus.AVAILABLE).length,
    chargingPoints: state.chargingPoints.length,
    availableChargingPoints: state.chargingPoints.filter((item) => item.status === ChargingPointStatus.AVAILABLE).length,
    openIncidents: state.incidents.filter((item) => item.status !== IncidentStatus.RESOLVED).length,
    waitingCharging: state.chargingRequests.filter((item) => item.status === ChargingRequestStatus.QUEUED).length,
    activeDispatch: state.dispatchOrders.filter((item) => [DispatchOrderStatus.ASSIGNED, DispatchOrderStatus.IN_PROGRESS].includes(item.status)).length,
    alerts: identifyBottlenecks(state).length,
  };
}

/* ---------- Redistribute Vehicles / Execute Redistribution Task (FR-13 / UC-14; FR-OPT-7..9, FR-DIS-1..8) ---------- */

function hasOpenChargingRequest(state, vehicleId) {
  return state.chargingRequests.some((item) => item.vehicleId === vehicleId && OPEN_CHARGING.includes(item.status));
}

// Vehicles that may be moved: available at the Hub and not waiting for a charging port.
export function listMovableVehicles(state, hubId) {
  return state.vehicles.filter(
    (vehicle) => vehicle.hubId === hubId && vehicle.status === VehicleStatus.AVAILABLE && !hasOpenChargingRequest(state, vehicle.id),
  );
}

// planRedistribution: a Hub short of vehicles receives them from the Hub with the largest surplus
// (overloaded Hubs first); otherwise an overloaded Hub sends vehicles to the least used Hub with space.
export function planRedistribution(state) {
  const { shortageVehicles } = getThresholds(state);
  const risks = detectCapacityRisks(state);
  const movable = new Map(risks.map((hub) => [hub.id, listMovableVehicles(state, hub.id)]));
  const plan = (from, to, count, reason) => ({
    kind: "redistribute",
    code: reason === "shortage" ? "plan_shortage" : "plan_overload",
    fromHubId: from.id,
    toHubId: to.id,
    count,
    params: { fromHub: from.name, toHub: to.name, count },
    message: `Move ${count} vehicle(s) from ${from.name} to ${to.name}.`,
  });

  const short = risks.filter((hub) => hub.shortage && hub.parkingAvailable > 0)
    .sort((a, b) => a.availableVehicles - b.availableVehicles || a.utilization - b.utilization);
  for (const destination of short) {
    const source = risks
      .filter((hub) => hub.id !== destination.id && movable.get(hub.id).length > shortageVehicles)
      .sort((a, b) => Number(b.overloaded) - Number(a.overloaded) || movable.get(b.id).length - movable.get(a.id).length)[0];
    if (!source) continue;
    const needed = Math.max(1, shortageVehicles - destination.availableVehicles);
    const surplus = movable.get(source.id).length - shortageVehicles;
    return plan(source, destination, Math.min(needed, surplus, destination.parkingAvailable), "shortage");
  }

  const source = risks.find((hub) => hub.overloaded && movable.get(hub.id).length > 0);
  const destination = source && [...risks].reverse().find((hub) => hub.id !== source.id && !hub.overloaded && hub.parkingAvailable > 0);
  if (!source || !destination) return null;
  const { overloadPercent } = getThresholds(state);
  const excess = Math.max(1, source.usedParking - Math.floor((source.parkingCapacity * (overloadPercent - 1)) / 100));
  return plan(source, destination, Math.min(excess, movable.get(source.id).length, destination.parkingAvailable), "overload");
}

// Operator creates a redistribution order for one vehicle (FR-OPT-7/8). The vehicle is locked
// (In transit) and one space is held at the destination until the task ends (D-004, D-020).
export function createRedistributionOrder(store, { vehicleId, toHubId, staffId = DISPATCH_STAFF_ID, now = Date.now() } = {}) {
  const state = store.getState();
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  const destination = state.hubs.find((item) => item.id === toHubId);
  if (!vehicle || !destination) return failure("dispatch_not_found", "Choose a vehicle and a destination Hub.");
  if (vehicle.hubId === toHubId) return failure("dispatch_same_hub", `${vehicleId} is already at ${destination.name}.`, { vehicleId, hubName: destination.name });
  if (vehicle.status !== VehicleStatus.AVAILABLE || hasOpenChargingRequest(state, vehicleId)) {
    return failure("dispatch_vehicle_unavailable", `${vehicleId} is not available for redistribution.`, { vehicleId });
  }
  if (getAvailableSlotsCount(state, toHubId) <= 0) {
    return failure("dispatch_destination_full", `${destination.name} has no free parking space.`, { hubName: destination.name });
  }
  const order = {
    id: nextId("DSP", state.dispatchOrders),
    status: DispatchOrderStatus.ASSIGNED,
    vehicleId,
    fromHubId: vehicle.hubId,
    toHubId,
    staffId,
    createdAt: toIso(now),
    startedAt: null,
    completedAt: null,
    holdId: nextId("PRK", state.parkingReservations),
  };
  store.update((draft) => {
    changeStatus(draft.vehicles.find((item) => item.id === vehicleId), VehicleStatus.IN_TRANSIT);
    draft.parkingReservations.push({
      id: order.holdId, studentId: null, dispatchOrderId: order.id, hubId: toHubId,
      vehicleType: "dispatch", status: ReservationStatus.ACTIVE, createdAt: order.createdAt,
    });
    draft.dispatchOrders.push(order);
  });
  return success("dispatch_created", `${order.id}: ${vehicleId} from ${hubName(state, order.fromHubId)} to ${destination.name}.`, {
    orderId: order.id, vehicleId, fromHub: hubName(state, order.fromHubId), toHub: destination.name, staffId,
  }, { order });
}

function findOrder(state, orderId, staffId) {
  return state.dispatchOrders.find((item) => item.id === orderId && (!staffId || item.staffId === staffId));
}

// Vehicle Dispatch Staff starts the task: the vehicle leaves the source Hub (FR-DIS-3).
export function startRedistributionTask(store, { orderId, staffId = DISPATCH_STAFF_ID, now = Date.now() } = {}) {
  const order = findOrder(store.getState(), orderId, staffId);
  if (!order) return failure("dispatch_order_not_found", "Redistribution task not found.", { orderId });
  if (order.status !== DispatchOrderStatus.ASSIGNED) return failure("dispatch_not_assigned", `${orderId} has already started or ended.`, { orderId });
  store.update((draft) => {
    const item = draft.dispatchOrders.find((entry) => entry.id === orderId);
    item.status = DispatchOrderStatus.IN_PROGRESS;
    item.startedAt = toIso(now);
    const source = draft.hubs.find((hub) => hub.id === item.fromHubId);
    if (source && source.occupiedParking > 0) source.occupiedParking -= 1;
  });
  return success("dispatch_started", `${orderId} started: ${order.vehicleId} is on the way.`, { orderId, vehicleId: order.vehicleId });
}

// Vehicle Dispatch Staff completes the task: vehicle and both Hubs are updated (FR-DIS-4..6, 8).
export function completeRedistributionTask(store, { orderId, staffId = DISPATCH_STAFF_ID, now = Date.now() } = {}) {
  const state = store.getState();
  const order = findOrder(state, orderId, staffId);
  if (!order) return failure("dispatch_order_not_found", "Redistribution task not found.", { orderId });
  if (order.status !== DispatchOrderStatus.IN_PROGRESS) return failure("dispatch_not_started", `Start ${orderId} before completing it.`, { orderId });
  store.update((draft) => {
    const item = draft.dispatchOrders.find((entry) => entry.id === orderId);
    item.status = DispatchOrderStatus.COMPLETED;
    item.completedAt = toIso(now);
    const vehicle = draft.vehicles.find((entry) => entry.id === item.vehicleId);
    vehicle.hubId = item.toHubId;
    changeStatus(vehicle, VehicleStatus.AVAILABLE);
    draft.hubs.find((hub) => hub.id === item.toHubId).occupiedParking += 1;
    const hold = draft.parkingReservations.find((entry) => entry.id === item.holdId);
    if (hold?.status === ReservationStatus.ACTIVE) hold.status = ReservationStatus.COMPLETED;
    updateChargingAllocation(draft, [item.fromHubId, item.toHubId], now);
  });
  return success("dispatch_completed", `${order.vehicleId} arrived at ${hubName(state, order.toHubId)} (${orderId}).`, {
    orderId, vehicleId: order.vehicleId, toHub: hubName(state, order.toHubId),
  });
}

// Operator withdraws an order that has not started (FR-OPT-9 tracking).
export function cancelRedistributionOrder(store, { orderId } = {}) {
  const order = findOrder(store.getState(), orderId);
  if (!order) return failure("dispatch_order_not_found", "Redistribution task not found.", { orderId });
  if (order.status !== DispatchOrderStatus.ASSIGNED) return failure("dispatch_cancel_not_allowed", `${orderId} has already started or ended.`, { orderId });
  store.update((draft) => {
    const item = draft.dispatchOrders.find((entry) => entry.id === orderId);
    item.status = DispatchOrderStatus.CANCELLED;
    const vehicle = draft.vehicles.find((entry) => entry.id === item.vehicleId);
    if (vehicle?.status === VehicleStatus.IN_TRANSIT) changeStatus(vehicle, VehicleStatus.AVAILABLE);
    const hold = draft.parkingReservations.find((entry) => entry.id === item.holdId);
    if (hold?.status === ReservationStatus.ACTIVE) hold.status = ReservationStatus.CANCELLED;
  });
  return success("dispatch_cancelled", `${orderId} cancelled; ${order.vehicleId} is available again.`, { orderId, vehicleId: order.vehicleId });
}

// applyCoordination (FR-13, FR-18): turns recommendations into live tasks — redistribution orders
// for the Vehicle Dispatch Staff and charging-schedule adjustments. Advice-only items change nothing.
export function applyCoordination(store, recommendations = [], now = Date.now()) {
  const orders = [];
  let charging = 0;
  let rescheduled = 0;
  for (const recommendation of recommendations) {
    if (recommendation.kind === "redistribute") {
      for (let index = 0; index < recommendation.count; index += 1) {
        const vehicle = listMovableVehicles(store.getState(), recommendation.fromHubId)[0];
        if (!vehicle) break;
        const created = createRedistributionOrder(store, { vehicleId: vehicle.id, toHubId: recommendation.toHubId, now });
        if (!created.ok) break;
        orders.push(created.order.id);
      }
    } else if (recommendation.kind === "smart_charging" && recommendation.hubId) {
      // Charging tasks: low-battery vehicles get the earliest free slot (priority, ADR-05).
      for (const vehicleId of recommendation.vehicleIds ?? []) {
        if (scheduleSharedVehicleCharging(store, { vehicleId, now }).ok) charging += 1;
      }
      rescheduled += optimizeQueue(store, recommendation.hubId, now).moved?.length ?? 0;
    }
  }
  if (orders.length === 0 && charging === 0 && rescheduled === 0) {
    return failure("coordination_nothing", "No live task was needed: nothing to move, charge or reschedule.");
  }
  return success("coordination_applied", `${orders.length} redistribution task(s), ${charging} charging task(s), ${rescheduled} booking(s) moved.`, {
    orders: orders.length, charging, rescheduled,
  }, { orderIds: orders });
}

/* ---------- Handle Operational Incident / Resolve Assigned Incident (FR-14 / UC-15; FR-OPT-10..14, FR-MNT-1..6) ---------- */

export const INCIDENT_TYPES = Object.freeze({
  vehicle: ["vehicle_failure", "vehicle_battery"],
  charging_point: ["charging_point_unavailable", "charging_point_power"],
});

function findResource(state, resourceType, resourceId) {
  return resourceType === "vehicle"
    ? state.vehicles.find((item) => item.id === resourceId)
    : state.chargingPoints.find((item) => item.id === resourceId);
}

// FR-OPT-10: record an incident reported for a vehicle or a charging point (status New).
export function recordIncident(store, { resourceType, resourceId, source = "operator", now = Date.now() } = {}) {
  const state = store.getState();
  if (!INCIDENT_TYPES[resourceType]) return failure("incident_resource_invalid", "Choose a vehicle or a charging point.");
  const resource = findResource(state, resourceType, resourceId);
  if (!resource) return failure("incident_resource_invalid", "Choose a vehicle or a charging point.");
  const open = state.incidents.find((item) => item.resourceId === resourceId && item.status !== IncidentStatus.RESOLVED);
  if (open) return failure("incident_duplicate", `${resourceId} already has an open incident (${open.id}).`, { resourceId, incidentId: open.id });
  const incident = {
    id: nextId("INC", state.incidents),
    resourceType,
    resourceId,
    hubId: resource.hubId,
    type: INCIDENT_TYPES[resourceType][0],
    severity: IncidentSeverity.MEDIUM,
    status: IncidentStatus.NEW,
    source,
    classified: false,
    resourceUnavailable: false,
    wasInUse: false,
    assignedTo: null,
    taskId: null,
    resolution: null,
    openedAt: toIso(now),
    classifiedAt: null,
    assignedAt: null,
    startedAt: null,
    resolvedAt: null,
  };
  store.update((draft) => draft.incidents.push(incident));
  return success("incident_recorded", `${incident.id} recorded for ${resourceId}.`, { incidentId: incident.id, resourceId }, { incident });
}

// IncidentController.classifyIncident: the operator confirms the type and severity.
export function classifyIncident(store, { incidentId, type, severity, now = Date.now() } = {}) {
  const incident = store.getState().incidents.find((item) => item.id === incidentId);
  if (!incident) return failure("incident_not_found", "Incident not found.", { incidentId });
  if (incident.status !== IncidentStatus.NEW) return failure("incident_not_new", `${incidentId} is already being handled.`, { incidentId });
  if (!INCIDENT_TYPES[incident.resourceType].includes(type) || !Object.values(IncidentSeverity).includes(severity)) {
    return failure("incident_classification_invalid", "Choose a valid incident type and severity.");
  }
  store.update((draft) => {
    const item = draft.incidents.find((entry) => entry.id === incidentId);
    Object.assign(item, { type, severity, classified: true, classifiedAt: toIso(now) });
  });
  return success("incident_classified", `${incidentId} classified.`, { incidentId });
}

// Takes the resource out of service with all side effects on the live state.
function takeOutOfService(draft, incident, now) {
  if (incident.resourceType === "vehicle") {
    const vehicle = draft.vehicles.find((item) => item.id === incident.resourceId);
    incident.wasInUse = vehicle.status === VehicleStatus.IN_USE;
    for (const reservation of draft.reservations.filter(
      (item) => item.vehicleId === vehicle.id && [ReservationStatus.ACTIVE, ReservationStatus.IN_USE].includes(item.status),
    )) reservation.status = ReservationStatus.CANCELLED;
    // A vehicle assigned to redistribution: the task is cancelled; if it had left, it needs a space back.
    for (const order of draft.dispatchOrders.filter(
      (item) => item.vehicleId === vehicle.id && [DispatchOrderStatus.ASSIGNED, DispatchOrderStatus.IN_PROGRESS].includes(item.status),
    )) {
      if (order.status === DispatchOrderStatus.IN_PROGRESS) incident.wasInUse = true;
      order.status = DispatchOrderStatus.CANCELLED;
      const hold = draft.parkingReservations.find((entry) => entry.id === order.holdId);
      if (hold?.status === ReservationStatus.ACTIVE) hold.status = ReservationStatus.CANCELLED;
    }
    // A failed vehicle releases its charging port; its request waits (on hold) until the repair.
    for (const request of draft.chargingRequests.filter(
      (item) => item.vehicleId === vehicle.id && item.status === ChargingRequestStatus.CHARGING,
    )) {
      const point = draft.chargingPoints.find((item) => item.id === request.chargingPointId);
      if (point?.status === ChargingPointStatus.OCCUPIED) point.status = ChargingPointStatus.AVAILABLE;
      request.status = ChargingRequestStatus.QUEUED;
      request.chargingPointId = null;
    }
    vehicle.status = VehicleStatus.FAILED;
  } else {
    const point = draft.chargingPoints.find((item) => item.id === incident.resourceId);
    point.status = ChargingPointStatus.UNAVAILABLE;
    delete point.simulatedOccupancy;
    // Sessions on this port go back to waiting; automatic allocation may move them to another port.
    for (const request of draft.chargingRequests.filter(
      (item) => item.chargingPointId === point.id && item.status === ChargingRequestStatus.CHARGING,
    )) {
      request.status = ChargingRequestStatus.QUEUED;
      request.chargingPointId = null;
      const vehicle = request.vehicleId ? draft.vehicles.find((item) => item.id === request.vehicleId) : null;
      if (vehicle?.status === VehicleStatus.CHARGING) changeStatus(vehicle, VehicleStatus.AVAILABLE);
    }
  }
  incident.resourceUnavailable = true;
  updateChargingAllocation(draft, [incident.hubId], now);
}

// IncidentController.markResourceUnavailable ("Confirm unavailable" in the Submission #2 mockup).
export function markResourceUnavailable(store, { incidentId, now = Date.now() } = {}) {
  const incident = store.getState().incidents.find((item) => item.id === incidentId);
  if (!incident) return failure("incident_not_found", "Incident not found.", { incidentId });
  if (incident.status === IncidentStatus.RESOLVED) return failure("incident_already_resolved", `${incidentId} is already resolved.`, { incidentId });
  if (incident.resourceUnavailable) return failure("resource_already_unavailable", `${incident.resourceId} is already out of service.`, { resourceId: incident.resourceId });
  store.update((draft) => takeOutOfService(draft, draft.incidents.find((item) => item.id === incidentId), now));
  return success("resource_marked_unavailable", `${incident.resourceId} is out of service (${incidentId}).`, { resourceId: incident.resourceId, incidentId });
}

// IncidentController.assignMaintenance: repair branch — a MaintenanceTask for the Maintenance Staff;
// the resource is marked unavailable so it gets no new allocations.
export function assignMaintenance(store, { incidentId, staffId = MAINTENANCE_STAFF_ID, now = Date.now() } = {}) {
  const state = store.getState();
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident) return failure("incident_not_found", "Incident not found.", { incidentId });
  if (incident.status !== IncidentStatus.NEW) return failure("incident_not_new", `${incidentId} is already being handled.`, { incidentId });
  if (!incident.classified) return failure("incident_not_classified", `Confirm and classify ${incidentId} first.`, { incidentId });
  const task = {
    id: nextId("MT", state.maintenanceTasks),
    incidentId,
    staffId,
    status: MaintenanceTaskStatus.ASSIGNED,
    assignedAt: toIso(now),
    startedAt: null,
    completedAt: null,
  };
  store.update((draft) => {
    const item = draft.incidents.find((entry) => entry.id === incidentId);
    if (!item.resourceUnavailable) takeOutOfService(draft, item, now);
    Object.assign(item, { status: IncidentStatus.ASSIGNED, assignedTo: staffId, taskId: task.id, assignedAt: task.assignedAt });
    draft.maintenanceTasks.push(task);
  });
  return success("maintenance_assigned", `${incidentId} assigned to ${staffId} (${task.id}).`, { incidentId, staffId, taskId: task.id }, { task });
}

// MobilityResource.restoreIfOperational + IncidentController.resolveIncident. A vehicle that failed
// during a trip or a redistribution is brought back to its Hub and needs a free space there.
function restoreAndResolve(store, incidentId, resolution, now) {
  const state = store.getState();
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (incident.resourceType === "vehicle" && incident.resourceUnavailable && incident.wasInUse && getAvailableSlotsCount(state, incident.hubId) <= 0) {
    return failure("repair_hub_full", `${hubName(state, incident.hubId)} has no free space for ${incident.resourceId}.`, {
      vehicleId: incident.resourceId, hubName: hubName(state, incident.hubId),
    });
  }
  let assigned = [];
  store.update((draft) => {
    const item = draft.incidents.find((entry) => entry.id === incidentId);
    if (item.resourceUnavailable) {
      const resource = findResource(draft, item.resourceType, item.resourceId);
      if (item.resourceType === "vehicle") {
        if (resource.status === VehicleStatus.FAILED) changeStatus(resource, VehicleStatus.AVAILABLE);
        if (item.wasInUse) draft.hubs.find((hub) => hub.id === item.hubId).occupiedParking += 1;
      } else if (resource.status === ChargingPointStatus.UNAVAILABLE) {
        resource.status = ChargingPointStatus.AVAILABLE;
      }
    }
    Object.assign(item, { status: IncidentStatus.RESOLVED, resolution, resolvedAt: toIso(now) });
    assigned = updateChargingAllocation(draft, [item.hubId], now).assigned;
  });
  const name = hubName(state, incident.hubId);
  if (incident.resourceType === "vehicle") {
    return success("vehicle_repaired", `${incident.resourceId} is back in service at ${name}.`, { vehicleId: incident.resourceId, hubName: name, incidentId });
  }
  const next = assigned.find((item) => item.chargingPointId === incident.resourceId);
  return next
    ? success("point_restored_next", `${incident.resourceId} is back in service; ${next.vehicleLabel} now charges there.`, { pointId: incident.resourceId, nextLabel: next.vehicleLabel, incidentId })
    : success("point_restored", `${incident.resourceId} is back in service.`, { pointId: incident.resourceId, incidentId });
}

// IncidentController.applyOperationalAction: operational branch (no technical repair needed) —
// the resource is returned to service, allocation is recomputed and the incident is resolved.
export function applyOperationalAction(store, { incidentId, action = "restore_service", now = Date.now() } = {}) {
  const incident = store.getState().incidents.find((item) => item.id === incidentId);
  if (!incident) return failure("incident_not_found", "Incident not found.", { incidentId });
  if (incident.status !== IncidentStatus.NEW) return failure("incident_not_new", `${incidentId} is already being handled.`, { incidentId });
  if (!incident.classified) return failure("incident_not_classified", `Confirm and classify ${incidentId} first.`, { incidentId });
  if (action !== "restore_service") return failure("incident_action_invalid", "Unknown operational action.");
  return restoreAndResolve(store, incidentId, "operational", now);
}

function findTask(state, taskId, staffId) {
  return state.maintenanceTasks.find((item) => item.id === taskId && (!staffId || item.staffId === staffId));
}

// MaintenanceTask.startHandling (FR-MNT-3): the incident becomes In progress.
export function startMaintenanceTask(store, { taskId, staffId = MAINTENANCE_STAFF_ID, now = Date.now() } = {}) {
  const task = findTask(store.getState(), taskId, staffId);
  if (!task) return failure("task_not_found", "Maintenance task not found.", { taskId });
  if (task.status !== MaintenanceTaskStatus.ASSIGNED) return failure("task_not_assigned", `${taskId} has already started or ended.`, { taskId });
  store.update((draft) => {
    const item = draft.maintenanceTasks.find((entry) => entry.id === taskId);
    item.status = MaintenanceTaskStatus.IN_PROGRESS;
    item.startedAt = toIso(now);
    const incident = draft.incidents.find((entry) => entry.id === item.incidentId);
    incident.status = IncidentStatus.IN_PROGRESS;
    incident.startedAt = item.startedAt;
  });
  return success("maintenance_started", `${taskId} in progress (${task.incidentId}).`, { taskId, incidentId: task.incidentId });
}

// MaintenanceTask.complete (FR-MNT-4..6): the repair is confirmed, the incident is resolved and
// the resource restored. If a repaired vehicle has no space at its Hub, the task stays in progress.
export function completeMaintenanceTask(store, { taskId, staffId = MAINTENANCE_STAFF_ID, now = Date.now() } = {}) {
  const task = findTask(store.getState(), taskId, staffId);
  if (!task) return failure("task_not_found", "Maintenance task not found.", { taskId });
  if (task.status !== MaintenanceTaskStatus.IN_PROGRESS) return failure("task_not_started", `Start ${taskId} before completing it.`, { taskId });
  const resolved = restoreAndResolve(store, task.incidentId, "repair", now);
  if (!resolved.ok) return resolved;
  store.update((draft) => {
    const item = draft.maintenanceTasks.find((entry) => entry.id === taskId);
    item.status = MaintenanceTaskStatus.COMPLETED;
    item.completedAt = toIso(now);
  });
  return resolved;
}
