import { createId } from "../domain/ids.js";
import { failure, success } from "../domain/result.js";
import { ChargingPointStatus, ChargingRequestStatus, ReservationStatus, VehicleStatus } from "../domain/status.js";
import { summarizeHub } from "./hubService.js";

// Traceability: FR-08, FR-09, FR-15 / UC-08, UC-09, UC-16 / AT-08, AT-09, AT-15.
export const PRIVATE_LABEL_MAX_LENGTH = 40;

const OPEN_REQUEST_STATUSES = [ChargingRequestStatus.QUEUED, ChargingRequestStatus.SCHEDULED];

function parseBattery(battery) {
  if (battery === null || battery === undefined || battery === "") return null;
  const value = Number(battery);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function priorityScore(request) {
  // FR-15: the only assignment-supported scheduling factors are low battery
  // and upcoming usage; upcoming usage is treated as the stronger signal.
  return (request.upcomingUsage ? 1000 : 0) + (request.battery == null ? 0 : 100 - request.battery);
}

function createRequest(request) {
  return {
    id: createId("charging"),
    status: ChargingRequestStatus.QUEUED,
    source: request.source ?? "shared",
    studentId: request.studentId,
    hubId: request.hubId,
    vehicleId: request.vehicleId ?? null,
    vehicleLabel: request.vehicleLabel ?? request.vehicleId ?? "Private EV",
    battery: request.battery,
    upcomingUsage: Boolean(request.upcomingUsage),
    chargingPointId: null,
    createdAt: new Date().toISOString(),
  };
}

function hasOpenRequest(state, vehicleId) {
  return state.chargingRequests.some(
    (item) => item.vehicleId === vehicleId && OPEN_REQUEST_STATUSES.includes(item.status),
  );
}

// A queued shared-vehicle request may only receive a charging point while the vehicle is
// still available at the requested Hub. Private EV requests already hold a parking space.
function assignmentBlocker(state, request) {
  if (!request.vehicleId) return null;
  const vehicle = state.vehicles.find((item) => item.id === request.vehicleId);
  if (!vehicle) return "vehicle_missing";
  if (vehicle.status !== VehicleStatus.AVAILABLE) return `vehicle_${vehicle.status}`;
  if (vehicle.hubId !== request.hubId) return "vehicle_moved";
  return null;
}

export function submitChargingRequest(store, request = {}) {
  if (!request.studentId) return failure("student_required", "A student identity is required.");
  if (!request.vehicleId) return failure("vehicle_required", "Select a shared vehicle for the charging request.");
  const state = store.getState();
  const vehicle = state.vehicles.find((item) => item.id === request.vehicleId);
  const vehicleId = request.vehicleId;
  if (!vehicle) return failure("vehicle_not_found", "Vehicle not found.", { vehicleId });
  if (vehicle.status === VehicleStatus.FAILED) {
    return failure("charging_vehicle_failed", "A failed vehicle cannot enter the charging queue.", { vehicleId });
  }
  if ([VehicleStatus.RESERVED, VehicleStatus.IN_USE].includes(vehicle.status)) {
    return failure("charging_vehicle_busy", `${vehicleId} is reserved or in use and cannot be scheduled for charging yet.`, { vehicleId });
  }
  if (vehicle.status === VehicleStatus.CHARGING) {
    return failure("charging_vehicle_charging", `${vehicleId} is already charging.`, { vehicleId });
  }
  if (hasOpenRequest(state, vehicleId)) {
    return failure("charging_duplicate", `${vehicleId} already has a charging request in the queue.`, { vehicleId });
  }
  if (request.hubId && request.hubId !== vehicle.hubId) {
    return failure("charging_hub_mismatch", "The selected Hub does not contain this vehicle.", { vehicleId });
  }
  const hub = state.hubs.find((item) => item.id === vehicle.hubId);
  if (!hub) return failure("hub_not_found", "Hub not found.");

  // Shared vehicles: battery level and upcoming usage come from the recorded vehicle state,
  // so the priority is computed from system data rather than from typed input.
  const created = createRequest({
    studentId: request.studentId,
    source: "shared",
    hubId: hub.id,
    vehicleId,
    vehicleLabel: vehicleId,
    battery: vehicle.battery,
    upcomingUsage: Boolean(request.upcomingUsage) || Boolean(vehicle.upcomingUsage),
  });
  store.update((draft) => draft.chargingRequests.push(created));
  const freePoints = summarizeHub(store.getState(), hub.id)?.availableChargingPoints ?? 0;
  const params = { label: created.vehicleLabel, hubName: hub.name };
  return freePoints > 0
    ? success("charging_queued", `Charging request for ${vehicleId} added to the queue at ${hub.name}.`, params, { request: created })
    : success("charging_queued_no_point", `Charging request for ${vehicleId} queued; no charging point is free at ${hub.name}.`, params, { request: created });
}

export function buildChargingSchedule(state, hubId) {
  const withPriority = (item) => ({ ...item, priorityScore: priorityScore(item) });
  const points = state.chargingPoints.filter(
    (item) => item.hubId === hubId && item.status === ChargingPointStatus.AVAILABLE,
  );

  const alreadyScheduled = state.chargingRequests
    .filter((item) => item.hubId === hubId && item.status === ChargingRequestStatus.SCHEDULED)
    .map(withPriority);
  const assignedPointIds = new Set(alreadyScheduled.map((item) => item.chargingPointId).filter(Boolean));
  const freePoints = points.filter((point) => !assignedPointIds.has(point.id));

  const queued = state.chargingRequests
    .filter((item) => item.hubId === hubId && item.status === ChargingRequestStatus.QUEUED)
    .map(withPriority)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const eligible = [];
  const blocked = [];
  const claimedVehicles = new Set(alreadyScheduled.map((item) => item.vehicleId).filter(Boolean));
  for (const request of queued) {
    let blockedReason = assignmentBlocker(state, request);
    if (!blockedReason && request.vehicleId && claimedVehicles.has(request.vehicleId)) blockedReason = "duplicate_vehicle";
    if (blockedReason) {
      blocked.push({ ...request, blockedReason });
      continue;
    }
    if (request.vehicleId) claimedVehicles.add(request.vehicleId);
    eligible.push(request);
  }

  const preview = eligible.slice(0, freePoints.length).map((request, index) => ({
    ...request,
    chargingPointId: freePoints[index].id,
  }));
  return {
    hubId,
    capacity: freePoints.length,
    scheduled: [...alreadyScheduled, ...preview],
    waiting: eligible.slice(freePoints.length),
    blocked,
  };
}

export function applyChargingSchedule(store, hubId) {
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) {
    return { ...failure("hub_not_found", "Hub not found.", { hubId }), scheduled: [], waiting: [], blocked: [], assigned: [] };
  }
  const plan = buildChargingSchedule(state, hubId);
  const planned = plan.scheduled.filter(
    (item) => item.status === ChargingRequestStatus.QUEUED && item.chargingPointId,
  );

  const assigned = [];
  if (planned.length > 0) {
    store.update((draft) => {
      for (const assignment of planned) {
        const request = draft.chargingRequests.find((item) => item.id === assignment.id);
        const point = draft.chargingPoints.find((item) => item.id === assignment.chargingPointId);
        if (request?.status !== ChargingRequestStatus.QUEUED || point?.status !== ChargingPointStatus.AVAILABLE) continue;
        if (assignmentBlocker(draft, request)) continue;
        request.status = ChargingRequestStatus.SCHEDULED;
        request.chargingPointId = point.id;
        point.status = ChargingPointStatus.OCCUPIED;
        const vehicle = request.vehicleId ? draft.vehicles.find((item) => item.id === request.vehicleId) : null;
        if (vehicle) vehicle.status = VehicleStatus.CHARGING;
        assigned.push({ requestId: request.id, chargingPointId: point.id, vehicleLabel: request.vehicleLabel });
      }
    });
  }

  const after = buildChargingSchedule(store.getState(), hubId);
  const params = { hubName: hub.name, assigned: assigned.length, waiting: after.waiting.length, blocked: after.blocked.length };
  const result = assigned.length > 0
    ? success("schedule_applied", `Charging schedule applied at ${hub.name}: ${assigned.length} newly assigned, ${after.waiting.length} waiting, ${after.blocked.length} on hold.`, params)
    : success("schedule_nothing", `No queued charging request can be assigned at ${hub.name} now.`, params);
  return { ...result, ...after, assigned };
}

export function schedulePrivateEvCharging(store, request = {}) {
  if (!request.studentId) return failure("student_required", "A student identity is required.");
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === request.hubId);
  if (!hub) return failure("hub_not_found", "Hub not found.");
  const label = String(request.vehicleLabel ?? "").trim();
  if (!label) return failure("private_label_required", "Enter a label for the private EV.");
  if (label.length > PRIVATE_LABEL_MAX_LENGTH) {
    return failure("private_label_too_long", `The private EV label must be at most ${PRIVATE_LABEL_MAX_LENGTH} characters.`, { max: PRIVATE_LABEL_MAX_LENGTH });
  }
  const battery = parseBattery(request.battery);
  if (battery === null) return failure("invalid_battery", "Enter a battery level from 0 to 100.");
  const summary = summarizeHub(state, hub.id);
  if (!summary || summary.parkingAvailable <= 0) {
    return failure("private_parking_full", `No parking capacity available for the private EV at ${hub.name}.`, { hubName: hub.name });
  }

  const parkingReservation = {
    id: createId("parking"),
    studentId: request.studentId,
    hubId: hub.id,
    vehicleType: "private",
    status: ReservationStatus.ACTIVE,
    linkedChargingRequest: null,
  };
  const chargingRequest = createRequest({
    studentId: request.studentId,
    source: "private",
    hubId: hub.id,
    vehicleId: null,
    vehicleLabel: label,
    battery,
    upcomingUsage: request.upcomingUsage,
  });
  parkingReservation.linkedChargingRequest = chargingRequest.id;

  store.update((draft) => {
    draft.parkingReservations.push(parkingReservation);
    draft.chargingRequests.push(chargingRequest);
  });

  return success(
    "private_scheduled",
    `Parking held at ${hub.name} and charging request for ${label} queued.`,
    { hubName: hub.name, label },
    { parkingReservation, request: chargingRequest },
  );
}
