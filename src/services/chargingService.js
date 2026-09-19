import { ChargingPointStatus, ChargingRequestStatus, VehicleStatus } from "../domain/status.js";
import { summarizeHub } from "./hubService.js";

// Traceability: FR-08, FR-09, FR-15 / UC-08, UC-09, UC-16 / AT-08, AT-09, AT-15.
function createId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBattery(battery) {
  if (battery === null || battery === undefined || battery === "") return null;
  const value = Number(battery);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

function priorityScore(request) {
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
    battery: normalizeBattery(request.battery),
    upcomingUsage: Boolean(request.upcomingUsage),
    chargingPointId: null,
    createdAt: new Date().toISOString(),
  };
}

export function submitChargingRequest(store, request) {
  const state = store.getState();
  let hubId = request.hubId;
  let vehicle = null;
  if (request.vehicleId) {
    vehicle = state.vehicles.find((item) => item.id === request.vehicleId);
    if (!vehicle) return { ok: false, message: "Vehicle not found." };
    if (vehicle.status === VehicleStatus.FAILED) return { ok: false, message: "A failed vehicle cannot enter the charging queue." };
    if ([VehicleStatus.RESERVED, VehicleStatus.IN_USE].includes(vehicle.status)) {
      return { ok: false, message: "A reserved or in-use vehicle cannot be scheduled for charging yet." };
    }
    if (hubId && hubId !== vehicle.hubId) return { ok: false, message: "The selected Hub does not contain this vehicle." };
    hubId = vehicle.hubId;
  }
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return { ok: false, message: "Hub not found." };

  const created = createRequest({ ...request, hubId, battery: request.battery ?? vehicle?.battery });
  store.update((draft) => draft.chargingRequests.push(created));
  const availableCapacity = summarizeHub(store.getState(), hubId)?.availableChargingPoints ?? 0;
  return {
    ok: true,
    request: created,
    message: availableCapacity > 0 ? "Charging request added to the queue." : "Charging request queued; no charging point is currently available.",
  };
}

export function buildChargingSchedule(state, hubId) {
  const points = state.chargingPoints.filter(
    (item) => item.hubId === hubId && item.status === ChargingPointStatus.AVAILABLE,
  );

  const alreadyScheduled = state.chargingRequests
    .filter((item) => item.hubId === hubId && item.status === ChargingRequestStatus.SCHEDULED)
    .map((item) => ({ ...item, priorityScore: priorityScore(item) }));
  const assignedPointIds = new Set(alreadyScheduled.map((item) => item.chargingPointId).filter(Boolean));
  const freePoints = points.filter((point) => !assignedPointIds.has(point.id));

  const queued = state.chargingRequests
    .filter((item) => item.hubId === hubId && item.status === ChargingRequestStatus.QUEUED)
    .map((item) => ({
      ...item,
      priorityScore: priorityScore(item),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const preview = queued.slice(0, freePoints.length).map((request, index) => ({
    ...request,
    chargingPointId: freePoints[index]?.id ?? null,
  }));
  return {
    capacity: freePoints.length,
    scheduled: [...alreadyScheduled, ...preview],
    waiting: queued.slice(freePoints.length),
  };
}

export function applyChargingSchedule(store, hubId) {
  const state = store.getState();
  const schedule = buildChargingSchedule(state, hubId);
  const newAssignments = schedule.scheduled.filter(
    (item) => item.status === ChargingRequestStatus.QUEUED && item.chargingPointId,
  );

  if (newAssignments.length > 0) {
    store.update((draft) => {
      for (const assignment of newAssignments) {
        const request = draft.chargingRequests.find((item) => item.id === assignment.id);
        const point = draft.chargingPoints.find((item) => item.id === assignment.chargingPointId);
        if (request?.status === ChargingRequestStatus.QUEUED && point?.status === ChargingPointStatus.AVAILABLE) {
          request.status = ChargingRequestStatus.SCHEDULED;
          request.chargingPointId = point.id;
          point.status = ChargingPointStatus.OCCUPIED;
          const vehicle = request.vehicleId
            ? draft.vehicles.find((item) => item.id === request.vehicleId)
            : null;
          if (vehicle && vehicle.status === VehicleStatus.AVAILABLE) vehicle.status = VehicleStatus.CHARGING;
        }
      }
    });
  }

  return buildChargingSchedule(store.getState(), hubId);
}

export function schedulePrivateEvCharging(store, request) {
  const state = store.getState();
  const hub = state.hubs.find((item) => item.id === request.hubId);
  const summary = hub ? summarizeHub(state, hub.id) : null;
  if (!hub) return { ok: false, message: "Hub not found." };
  if (!summary || summary.parkingAvailable <= 0) return { ok: false, message: "No parking capacity available for the private EV." };

  const parkingReservation = {
    id: createId("parking"),
    studentId: request.studentId,
    hubId: request.hubId,
    vehicleType: "private",
    status: "active",
    linkedChargingRequest: null,
  };
  const chargingRequest = createRequest({ ...request, source: "private", vehicleId: null });
  parkingReservation.linkedChargingRequest = chargingRequest.id;

  store.update((draft) => {
    draft.parkingReservations.push(parkingReservation);
    draft.chargingRequests.push(chargingRequest);
  });

  return {
    ok: true,
    parkingReservation,
    request: chargingRequest,
    message: "Private EV parking reserved and charging request queued.",
  };
}
