import { nextId } from "../domain/ids.js";
import { failure, success } from "../domain/result.js";
import { ChargingPointStatus, ChargingRequestStatus, ReservationStatus, VehicleStatus } from "../domain/status.js";
import { summarizeHub } from "./hubService.js";

// Traceability: FR-08, FR-09, FR-15 / UC-08, UC-09, UC-16 / AT-08, AT-09, AT-15.
// D-015: charging points are allocated automatically by priority whenever a request arrives or
// capacity/eligibility changes (Submission #3, ADR-05: automatic priority scheduling).
export const PRIVATE_LABEL_MAX_LENGTH = 40;

const OPEN_REQUEST_STATUSES = [ChargingRequestStatus.QUEUED, ChargingRequestStatus.SCHEDULED];

function parseBattery(battery) {
  if (battery === null || battery === undefined || battery === "") return null;
  const value = Number(battery);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function priorityScore(request) {
  // FR-15: the only assignment-supported scheduling factors are low battery and upcoming usage;
  // upcoming usage is treated as the stronger signal. Equal scores keep arrival order.
  return (request.upcomingUsage ? 1000 : 0) + (request.battery == null ? 0 : 100 - request.battery);
}

function hasOpenRequest(state, vehicleId) {
  return state.chargingRequests.some(
    (item) => item.vehicleId === vehicleId && OPEN_REQUEST_STATUSES.includes(item.status),
  );
}

// A queued shared-vehicle request may only receive a point while its vehicle is available at the
// requested Hub (D-009). Private EV requests already hold a parking space and are always eligible.
export function assignmentBlocker(state, request) {
  if (!request.vehicleId) return null;
  const vehicle = state.vehicles.find((item) => item.id === request.vehicleId);
  if (!vehicle) return "vehicle_missing";
  if (vehicle.status !== VehicleStatus.AVAILABLE) return `vehicle_${vehicle.status}`;
  if (vehicle.hubId !== request.hubId) return "vehicle_moved";
  return null;
}

// Vehicles a student can submit a shared charging request for at a Hub (FR-08).
export function listChargeableVehicles(state, hubId) {
  return state.vehicles.filter(
    (vehicle) => vehicle.hubId === hubId && vehicle.status === VehicleStatus.AVAILABLE && !hasOpenRequest(state, vehicle.id),
  );
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

// Assigns free points to the highest-priority eligible requests. Works on any state object:
// the live draft inside store.update or a What-if copy. Returns the new assignments.
export function allocateChargingPoints(state, hubIds = state.hubs.map((hub) => hub.id)) {
  const assigned = [];
  for (const hubId of hubIds) {
    const plan = buildChargingSchedule(state, hubId);
    for (const item of plan.scheduled.filter((entry) => entry.status === ChargingRequestStatus.QUEUED)) {
      const request = state.chargingRequests.find((entry) => entry.id === item.id);
      const point = state.chargingPoints.find((entry) => entry.id === item.chargingPointId);
      if (request?.status !== ChargingRequestStatus.QUEUED || point?.status !== ChargingPointStatus.AVAILABLE) continue;
      if (assignmentBlocker(state, request)) continue;
      request.status = ChargingRequestStatus.SCHEDULED;
      request.chargingPointId = point.id;
      point.status = ChargingPointStatus.OCCUPIED;
      delete point.simulatedOccupancy;
      const vehicle = request.vehicleId ? state.vehicles.find((entry) => entry.id === request.vehicleId) : null;
      if (vehicle) vehicle.status = VehicleStatus.CHARGING;
      assigned.push({ requestId: request.id, chargingPointId: point.id, vehicleLabel: request.vehicleLabel, hubId });
    }
  }
  return assigned;
}

export function queuePosition(state, request) {
  return buildChargingSchedule(state, request.hubId).waiting.findIndex((item) => item.id === request.id) + 1;
}

function createRequest(state, request) {
  return {
    id: nextId("CHG", state.chargingRequests),
    status: ChargingRequestStatus.QUEUED,
    source: request.source,
    studentId: request.studentId,
    hubId: request.hubId,
    vehicleId: request.vehicleId ?? null,
    vehicleLabel: request.vehicleLabel,
    battery: request.battery,
    upcomingUsage: Boolean(request.upcomingUsage),
    chargingPointId: null,
    createdAt: new Date().toISOString(),
  };
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

  // D-008: shared vehicles use the recorded battery level and upcoming-usage flag.
  const created = createRequest(state, {
    studentId: request.studentId,
    source: "shared",
    hubId: hub.id,
    vehicleId,
    vehicleLabel: vehicleId,
    battery: vehicle.battery,
    upcomingUsage: Boolean(request.upcomingUsage) || Boolean(vehicle.upcomingUsage),
  });
  store.update((draft) => {
    draft.chargingRequests.push(created);
    allocateChargingPoints(draft, [hub.id]);
  });

  const saved = store.getState().chargingRequests.find((item) => item.id === created.id);
  const params = { label: vehicleId, hubName: hub.name };
  if (saved.status === ChargingRequestStatus.SCHEDULED) {
    return success("charging_started", `${vehicleId} is charging at ${saved.chargingPointId}.`, { ...params, pointId: saved.chargingPointId }, { request: saved });
  }
  const position = queuePosition(store.getState(), saved);
  return success("charging_queued", `${vehicleId} is waiting for a charging point at ${hub.name} (position ${position}).`, { ...params, position }, { request: saved });
}

export function schedulePrivateEvCharging(store, request = {}) {
  if (!request.studentId) return failure("student_required", "A student identity is required.");
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === request.hubId);
  if (!hub) return failure("hub_not_found", "Hub not found.");
  const label = String(request.vehicleLabel ?? "").trim();
  if (!label) return failure("private_label_required", "Enter a plate or label for the private EV.");
  if (label.length > PRIVATE_LABEL_MAX_LENGTH) {
    return failure("private_label_too_long", `The private EV label must be at most ${PRIVATE_LABEL_MAX_LENGTH} characters.`, { max: PRIVATE_LABEL_MAX_LENGTH });
  }
  const battery = parseBattery(request.battery);
  if (battery === null) return failure("invalid_battery", "Enter a battery level from 0 to 100.");
  const summary = summarizeHub(state, hub.id);
  if (!summary || summary.parkingAvailable <= 0) {
    return failure("private_parking_full", `No parking capacity available for the private EV at ${hub.name}.`, { hubName: hub.name });
  }

  const chargingRequest = createRequest(state, {
    studentId: request.studentId,
    source: "private",
    hubId: hub.id,
    vehicleId: null,
    vehicleLabel: label,
    battery,
    upcomingUsage: request.upcomingUsage,
  });
  const parkingReservation = {
    id: nextId("PRK", state.parkingReservations),
    studentId: request.studentId,
    hubId: hub.id,
    vehicleType: "private",
    status: ReservationStatus.ACTIVE,
    linkedChargingRequest: chargingRequest.id,
    createdAt: chargingRequest.createdAt,
  };

  store.update((draft) => {
    draft.parkingReservations.push(parkingReservation);
    draft.chargingRequests.push(chargingRequest);
    allocateChargingPoints(draft, [hub.id]);
  });

  const saved = store.getState().chargingRequests.find((item) => item.id === chargingRequest.id);
  const params = { label, hubName: hub.name };
  const data = { parkingReservation, request: saved };
  if (saved.status === ChargingRequestStatus.SCHEDULED) {
    return success("private_started", `Parking held at ${hub.name}; ${label} is charging at ${saved.chargingPointId}.`, { ...params, pointId: saved.chargingPointId }, data);
  }
  const position = queuePosition(store.getState(), saved);
  return success("private_queued", `Parking held at ${hub.name}; ${label} is waiting for a charging point (position ${position}).`, { ...params, position }, data);
}

// Operator action: the session on a point ends, the point is freed and handed to the next request.
export function finishCharging(store, chargingPointId) {
  const state = store.getState();
  const point = state.chargingPoints.find((item) => item.id === chargingPointId);
  if (!point) return failure("point_not_found", "Charging point not found.", { pointId: chargingPointId });
  const session = state.chargingRequests.find(
    (item) => item.status === ChargingRequestStatus.SCHEDULED && item.chargingPointId === chargingPointId,
  );
  if (!session) return failure("point_not_charging", `No charging session is running on ${chargingPointId}.`, { pointId: chargingPointId });

  let next = [];
  store.update((draft) => {
    const request = draft.chargingRequests.find((item) => item.id === session.id);
    request.status = ChargingRequestStatus.COMPLETED;
    request.completedAt = new Date().toISOString();
    const target = draft.chargingPoints.find((item) => item.id === chargingPointId);
    target.status = ChargingPointStatus.AVAILABLE;
    if (request.vehicleId) {
      const vehicle = draft.vehicles.find((item) => item.id === request.vehicleId);
      if (vehicle) {
        vehicle.battery = 100;
        if (vehicle.status === VehicleStatus.CHARGING) vehicle.status = VehicleStatus.AVAILABLE;
      }
    } else {
      // A charged private EV leaves, which releases its parking hold.
      const parking = draft.parkingReservations.find(
        (item) => item.linkedChargingRequest === request.id && item.status === ReservationStatus.ACTIVE,
      );
      if (parking) parking.status = ReservationStatus.COMPLETED;
    }
    next = allocateChargingPoints(draft, [target.hubId]);
  });

  const params = { label: session.vehicleLabel, pointId: chargingPointId };
  const following = next.find((item) => item.chargingPointId === chargingPointId);
  return following
    ? success("charging_finished_next", `${session.vehicleLabel} finished charging; ${following.vehicleLabel} now charges at ${chargingPointId}.`, { ...params, nextLabel: following.vehicleLabel })
    : success("charging_finished", `${session.vehicleLabel} finished charging at ${chargingPointId}.`, params);
}

// Student action: withdraw a request that is still waiting; a private EV also releases its space.
export function cancelChargingRequest(store, { studentId, requestId } = {}) {
  const state = store.getState();
  const request = state.chargingRequests.find((item) => item.id === requestId && item.studentId === studentId);
  if (!request) return failure("request_not_found", "Charging request not found.", { requestId });
  if (request.status !== ChargingRequestStatus.QUEUED) {
    return failure("charging_cancel_not_allowed", "Only a waiting request can be cancelled.", { label: request.vehicleLabel });
  }
  store.update((draft) => {
    draft.chargingRequests.find((item) => item.id === requestId).status = ChargingRequestStatus.CANCELLED;
    const parking = draft.parkingReservations.find(
      (item) => item.linkedChargingRequest === requestId && item.status === ReservationStatus.ACTIVE,
    );
    if (parking) parking.status = ReservationStatus.CANCELLED;
  });
  return success("charging_cancelled", `Charging request for ${request.vehicleLabel} cancelled.`, { label: request.vehicleLabel });
}
