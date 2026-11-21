import { DEMO_OPERATOR_ID } from "../domain/actors.js";
import { haversineKm } from "../domain/geo.js";
import { nextId } from "../domain/ids.js";
import { failure, success } from "../domain/result.js";
import { ChargingPointStatus, ChargingRequestStatus, VehicleStatus } from "../domain/status.js";
import { bookableSlots, isBookableSlot, slotEndOf, slotStartOf, toIso, toTimestamp } from "../domain/time.js";
import { changeStatus, readErrorActive } from "../domain/vehicle.js";

// Traceability: FR-08, FR-09, FR-15 / UC-08, UC-09, UC-16 (Schedule Private EV Charging,
// Manage Smart Charging). Submission #3 names: ChargingSessionController.checkAvailability,
// createChargingSession, updateChargingAllocation; MobilityHub.getAvailableSlots;
// buildChargingSchedule, optimizeQueue. A booking holds one port of the Hub for a one-hour slot;
// when the slot starts, ports are assigned by priority (D-015, D-019).
export const PRIVATE_LABEL_MAX_LENGTH = 40;
// ADR-05: priority for a starting battery below 20 % or an early departure (upcoming usage).
export const LOW_BATTERY_PERCENT = 20;

const { SCHEDULED, QUEUED, CHARGING, COMPLETED, CANCELLED } = ChargingRequestStatus;
const OPEN = [SCHEDULED, QUEUED, CHARGING];

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;

function parseBattery(battery) {
  if (battery === null || battery === undefined || battery === "") return null;
  const value = Number(battery);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function isPriorityRequest(request) {
  return Boolean(request.upcomingUsage) || (request.battery != null && request.battery < LOW_BATTERY_PERCENT);
}

// FR-CHG-2: battery level, expected usage and registration time. Priority requests come first,
// then the lower battery; equal scores keep registration order (FIFO).
export function priorityScore(request) {
  return (isPriorityRequest(request) ? 1000 : 0) + (request.battery == null ? 0 : 100 - request.battery);
}

export function compareByPriority(a, b) {
  return priorityScore(b) - priorityScore(a)
    || (toTimestamp(a.createdAt) ?? 0) - (toTimestamp(b.createdAt) ?? 0)
    || a.id.localeCompare(b.id);
}

// MobilityHub.getChargingPorts.
export function getChargingPorts(state, hubId) {
  return state.chargingPoints.filter((point) => point.hubId === hubId);
}

function operationalPortCount(state, hubId) {
  return getChargingPorts(state, hubId).filter((point) => point.status !== ChargingPointStatus.UNAVAILABLE).length;
}

function hasOpenRequest(state, vehicleId) {
  return state.chargingRequests.some((item) => item.vehicleId === vehicleId && OPEN.includes(item.status));
}

// Requests that use a slot: its bookings and, for the current slot, every session charging or waiting now.
export function slotLoad(state, hubId, slotStart, now) {
  const current = slotStartOf(now);
  return state.chargingRequests.filter((request) => {
    if (request.hubId !== hubId) return false;
    if (slotStart === current && (request.status === QUEUED || request.status === CHARGING)) return true;
    return request.status === SCHEDULED && toTimestamp(request.slotStart) === slotStart;
  }).length;
}

// MobilityHub.getAvailableSlots: every bookable slot with its free capacity (working ports - load).
export function getAvailableSlots(state, hubId, now = Date.now()) {
  const capacity = operationalPortCount(state, hubId);
  return bookableSlots(now).map((slotStart) => {
    const load = slotLoad(state, hubId, slotStart, now);
    return { slotStart, slotEnd: slotEndOf(slotStart), capacity, load, free: Math.max(0, capacity - load) };
  });
}

function alternativeSlots(state, hubId, slotStart, now) {
  return getAvailableSlots(state, hubId, now)
    .filter((slot) => slot.free > 0 && slot.slotStart !== slotStart)
    .sort((a, b) => Math.abs(a.slotStart - slotStart) - Math.abs(b.slotStart - slotStart) || a.slotStart - b.slotStart)
    .slice(0, 3)
    .map((slot) => ({ hubId, slotStart: toIso(slot.slotStart), slotEnd: toIso(slot.slotEnd), free: slot.free }));
}

function alternativeHubs(state, hubId, slotStart, now) {
  const origin = state.hubs.find((hub) => hub.id === hubId);
  return state.hubs
    .filter((hub) => hub.id !== hubId)
    .map((hub) => ({
      hubId: hub.id,
      hubName: hub.name,
      distanceKm: haversineKm(origin, hub),
      free: Math.max(0, operationalPortCount(state, hub.id) - slotLoad(state, hub.id, slotStart, now)),
    }))
    .filter((hub) => hub.free > 0 && !getChargingPorts(state, hub.hubId).some((point) => readErrorActive(point, now)))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3)
    .map(({ hubId: id, hubName: name, free }) => ({ hubId: id, hubName: name, slotStart: toIso(slotStart), slotEnd: toIso(slotEndOf(slotStart)), free }));
}

// ChargingSessionController.checkAvailability (UC-09 activity): port status, then slot capacity.
// Refusals carry alternative slots at the same Hub (A1) and nearby Hubs for the same slot (E1).
export function checkAvailability(state, hubId, slotStart, now = Date.now()) {
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return failure("hub_not_found", "Hub not found.", { hubId });
  const start = toTimestamp(slotStart);
  if (start === null || !isBookableSlot(start, now)) {
    return failure("slot_invalid", "Choose a time slot that has not ended (today or tomorrow).");
  }
  const params = { hubName: hub.name, startTime: toIso(start), endTime: toIso(slotEndOf(start)), slotDate: toIso(start) };
  if (getChargingPorts(state, hubId).some((point) => readErrorActive(point, now))) {
    return failure("port_status_unavailable", `The charging-port status of ${hub.name} cannot be read. Try again later.`, params);
  }
  const capacity = operationalPortCount(state, hubId);
  const offer = () => ({ alternatives: alternativeSlots(state, hubId, start, now), otherHubs: alternativeHubs(state, hubId, start, now) });
  if (capacity === 0) {
    return failure("slot_no_port", `${hub.name} has no working charging port. Choose another Hub or slot.`, params, offer());
  }
  const load = slotLoad(state, hubId, start, now);
  if (load >= capacity) {
    return failure("slot_full", `${hub.name} is fully booked for this slot. Choose another slot.`, params, offer());
  }
  const free = capacity - load;
  return success("slot_available", `${free} of ${capacity} ports free at ${hub.name} for this slot.`, { ...params, free, capacity }, { capacity, load, free });
}

function newRequest(state, { source, studentId, requestedBy, hubId, vehicleId, vehicleLabel, battery, upcomingUsage, slotStart, now }) {
  return {
    id: nextId("CHG", state.chargingRequests),
    status: SCHEDULED,
    source,
    studentId,
    requestedBy,
    hubId,
    vehicleId,
    vehicleLabel,
    battery,
    upcomingUsage: Boolean(upcomingUsage),
    chargingPointId: null,
    slotStart: toIso(slotStart),
    slotEnd: toIso(slotEndOf(slotStart)),
    createdAt: toIso(now),
    startedAt: null,
    completedAt: null,
  };
}

export function queuePosition(state, request, now = Date.now()) {
  return buildChargingSchedule(state, request.hubId, now).waiting.findIndex((item) => item.id === request.id) + 1;
}

// Outcome of a new booking/request: charging now, waiting for a port now, or booked for a later slot.
function describeRequest(state, requestId, now, prefix) {
  const saved = state.chargingRequests.find((item) => item.id === requestId);
  const params = {
    label: saved.vehicleLabel, hubName: hubName(state, saved.hubId), startTime: saved.slotStart, endTime: saved.slotEnd, slotDate: saved.slotStart,
  };
  if (saved.status === CHARGING) {
    return success(`${prefix}_started`, `${saved.vehicleLabel} is charging at ${saved.chargingPointId}.`, { ...params, pointId: saved.chargingPointId }, { request: saved });
  }
  if (saved.status === QUEUED) {
    const position = Math.max(1, queuePosition(state, saved, now));
    return success(`${prefix}_waiting`, `${saved.vehicleLabel} waits for a free port at ${params.hubName} (#${position}).`, { ...params, position }, { request: saved });
  }
  return success(`${prefix}_scheduled`, `${saved.vehicleLabel} is booked at ${params.hubName} for ${saved.slotStart}.`, params, { request: saved });
}

// Input checks of the booking form (plate/label and battery level); null when valid.
export function validateBookingInput({ vehicleLabel, battery } = {}) {
  const label = String(vehicleLabel ?? "").trim();
  if (!label) return failure("private_label_required", "Enter a plate or label for the private EV.");
  if (label.length > PRIVATE_LABEL_MAX_LENGTH) {
    return failure("private_label_too_long", `The private EV label must be at most ${PRIVATE_LABEL_MAX_LENGTH} characters.`, { max: PRIVATE_LABEL_MAX_LENGTH });
  }
  if (parseBattery(battery) === null) return failure("invalid_battery", "Enter a battery level from 0 to 100.");
  return null;
}

// ChargingSessionController.createChargingSession (UC-09): re-checks the slot, then books it.
export function createChargingSession(store, { studentId, hubId, slotStart, vehicleLabel, battery, upcomingUsage = false, now = Date.now() } = {}) {
  if (!studentId) return failure("student_required", "A student identity is required.");
  const invalid = validateBookingInput({ vehicleLabel, battery });
  if (invalid) return invalid;
  const label = String(vehicleLabel).trim();
  const level = parseBattery(battery);
  const state = store.getState();
  const check = checkAvailability(state, hubId, slotStart, now);
  if (!check.ok) return check;
  const duplicate = state.chargingRequests.some(
    (item) => item.source === "private" && OPEN.includes(item.status) && item.vehicleLabel.toLowerCase() === label.toLowerCase(),
  );
  if (duplicate) return failure("private_duplicate", `${label} already has an open charging session.`, { label });

  const session = newRequest(state, {
    source: "private", studentId, requestedBy: studentId, hubId, vehicleId: null,
    vehicleLabel: label, battery: level, upcomingUsage, slotStart: toTimestamp(slotStart), now,
  });
  store.update((draft) => {
    draft.chargingRequests.push(session);
    updateChargingAllocation(draft, [hubId], now);
  });
  return describeRequest(store.getState(), session.id, now, "session");
}

// D-009: a shared-vehicle request may only use a port while its vehicle is available at the Hub.
export function assignmentBlocker(state, request) {
  if (!request.vehicleId) return null;
  const vehicle = state.vehicles.find((item) => item.id === request.vehicleId);
  if (!vehicle) return "vehicle_missing";
  if (vehicle.status !== VehicleStatus.AVAILABLE) return `vehicle_${vehicle.status}`;
  if (vehicle.hubId !== request.hubId) return "vehicle_moved";
  return null;
}

// Shared vehicles the operator can add to the charging schedule of a Hub (FR-CHG-1).
export function listChargeableVehicles(state, hubId) {
  return state.vehicles.filter(
    (vehicle) => vehicle.hubId === hubId && vehicle.status === VehicleStatus.AVAILABLE && !hasOpenRequest(state, vehicle.id),
  );
}

// Operator (Manage Smart Charging): a shared vehicle gets the earliest slot with a free port.
// D-008: battery and upcoming usage come from the vehicle record.
export function scheduleSharedVehicleCharging(store, { hubId = null, vehicleId, upcomingUsage = false, requestedBy = DEMO_OPERATOR_ID, now = Date.now() } = {}) {
  if (!vehicleId) return failure("vehicle_required", "Select a shared vehicle.");
  const state = store.getState();
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return failure("vehicle_not_found", "Vehicle not found.", { vehicleId });
  if (hubId && vehicle.hubId !== hubId) return failure("charging_hub_mismatch", "The selected Hub does not contain this vehicle.", { vehicleId });
  if (vehicle.status === VehicleStatus.FAILED) return failure("charging_vehicle_failed", "A failed vehicle cannot be scheduled for charging.", { vehicleId });
  if (vehicle.status === VehicleStatus.CHARGING) return failure("charging_vehicle_charging", `${vehicleId} is already charging.`, { vehicleId });
  if (vehicle.status !== VehicleStatus.AVAILABLE) {
    return failure("charging_vehicle_busy", `${vehicleId} is reserved, in use or being moved.`, { vehicleId });
  }
  if (hasOpenRequest(state, vehicleId)) return failure("charging_duplicate", `${vehicleId} already has a charging request.`, { vehicleId });
  const slot = getAvailableSlots(state, vehicle.hubId, now).find((item) => item.free > 0);
  const name = hubName(state, vehicle.hubId);
  if (!slot) return failure("charging_no_slot", `${name} has no free charging slot today or tomorrow.`, { hubName: name });

  const request = newRequest(state, {
    source: "shared", studentId: null, requestedBy, hubId: vehicle.hubId, vehicleId, vehicleLabel: vehicleId,
    battery: vehicle.battery, upcomingUsage: upcomingUsage || vehicle.upcomingUsage, slotStart: slot.slotStart, now,
  });
  store.update((draft) => {
    draft.chargingRequests.push(request);
    updateChargingAllocation(draft, [vehicle.hubId], now);
  });
  return describeRequest(store.getState(), request.id, now, "charging");
}

function completeSession(state, request, now) {
  request.status = COMPLETED;
  request.completedAt = toIso(now);
  const point = state.chargingPoints.find((item) => item.id === request.chargingPointId);
  if (point?.status === ChargingPointStatus.OCCUPIED) point.status = ChargingPointStatus.AVAILABLE;
  if (request.vehicleId) {
    const vehicle = state.vehicles.find((item) => item.id === request.vehicleId);
    if (vehicle) {
      vehicle.battery = 100;
      if (vehicle.status === VehicleStatus.CHARGING) changeStatus(vehicle, VehicleStatus.AVAILABLE);
    }
  } else if (request.studentId) {
    // FR-PEV-5: the owner is notified when the charging session is complete.
    state.notifications ??= [];
    state.notifications.push({
      id: nextId("NTF", state.notifications),
      recipientId: request.studentId,
      code: "notify_charging_complete",
      params: { label: request.vehicleLabel, hubName: hubName(state, request.hubId), completedAt: request.completedAt },
      at: request.completedAt,
    });
  }
}

function groupUpcoming(bookings, capacity) {
  const bySlot = new Map();
  for (const booking of bookings) {
    if (!bySlot.has(booking.slotStart)) bySlot.set(booking.slotStart, []);
    bySlot.get(booking.slotStart).push(booking);
  }
  return [...bySlot.entries()]
    .sort(([a], [b]) => toTimestamp(a) - toTimestamp(b))
    .map(([slotStart, items]) => {
      const sorted = items.sort(compareByPriority);
      return {
        slotStart,
        slotEnd: sorted[0].slotEnd,
        capacity,
        bookings: sorted.map((item, index) => ({ ...item, overbooked: index >= capacity })),
      };
    });
}

// FR-OPT-15/16: the schedule of one Hub — sessions on ports, waiting requests in priority order
// (`next` would get a port now), requests on hold (D-009) and bookings of later slots.
export function buildChargingSchedule(state, hubId, now = Date.now()) {
  const withPriority = (request) => ({ ...request, priorityScore: priorityScore(request), priority: isPriorityRequest(request) });
  const requests = state.chargingRequests.filter((request) => request.hubId === hubId);
  const charging = requests.filter((request) => request.status === CHARGING).map(withPriority);
  const busy = new Set(charging.map((request) => request.chargingPointId));
  const freePorts = getChargingPorts(state, hubId).filter(
    (point) => point.status === ChargingPointStatus.AVAILABLE && !busy.has(point.id),
  );
  const claimed = new Set(charging.map((request) => request.vehicleId).filter(Boolean));
  const eligible = [];
  const blocked = [];
  for (const request of requests.filter((item) => item.status === QUEUED).sort(compareByPriority)) {
    let blockedReason = assignmentBlocker(state, request);
    if (!blockedReason && request.vehicleId && claimed.has(request.vehicleId)) blockedReason = "duplicate_vehicle";
    if (blockedReason) {
      blocked.push({ ...withPriority(request), blockedReason });
      continue;
    }
    if (request.vehicleId) claimed.add(request.vehicleId);
    eligible.push(withPriority(request));
  }
  const capacity = operationalPortCount(state, hubId);
  return {
    hubId,
    capacity,
    freePorts: freePorts.length,
    charging,
    next: eligible.slice(0, freePorts.length).map((request, index) => ({ ...request, chargingPointId: freePorts[index].id })),
    waiting: eligible.slice(freePorts.length),
    blocked,
    upcoming: groupUpcoming(requests.filter((request) => request.status === SCHEDULED).map(withPriority), capacity),
  };
}

// ChargingSessionController.updateChargingAllocation (D-015): sessions end with their slot, started
// bookings start waiting, and free ports go to the highest-priority eligible requests. Works on any
// state object (live draft or What-if copy); returns what changed.
export function updateChargingAllocation(state, hubIds = state.hubs.map((hub) => hub.id), now = Date.now()) {
  const scope = new Set(hubIds);
  const completed = [];
  const assigned = [];
  for (const request of state.chargingRequests) {
    if (!scope.has(request.hubId) || request.status !== CHARGING || toTimestamp(request.slotEnd) > now) continue;
    completeSession(state, request, now);
    completed.push({ requestId: request.id, vehicleLabel: request.vehicleLabel, hubId: request.hubId, studentId: request.studentId });
  }
  for (const request of state.chargingRequests) {
    if (scope.has(request.hubId) && request.status === SCHEDULED && toTimestamp(request.slotStart) <= now) request.status = QUEUED;
  }
  for (const hubId of scope) {
    for (const item of buildChargingSchedule(state, hubId, now).next) {
      const request = state.chargingRequests.find((entry) => entry.id === item.id);
      const point = state.chargingPoints.find((entry) => entry.id === item.chargingPointId);
      if (request?.status !== QUEUED || point?.status !== ChargingPointStatus.AVAILABLE) continue;
      request.status = CHARGING;
      request.chargingPointId = point.id;
      request.startedAt = toIso(now);
      point.status = ChargingPointStatus.OCCUPIED;
      delete point.simulatedOccupancy;
      const vehicle = request.vehicleId ? state.vehicles.find((entry) => entry.id === request.vehicleId) : null;
      if (vehicle) changeStatus(vehicle, VehicleStatus.CHARGING);
      assigned.push({ requestId: request.id, chargingPointId: point.id, vehicleLabel: request.vehicleLabel, hubId });
    }
  }
  return { assigned, completed };
}

// Called every second by the page: only touches the store when a slot starts or ends.
export function advanceChargingClock(store, now = Date.now()) {
  const due = store.getState().chargingRequests.some(
    (request) => (request.status === CHARGING && toTimestamp(request.slotEnd) <= now)
      || (request.status === SCHEDULED && toTimestamp(request.slotStart) <= now),
  );
  if (!due) return { assigned: [], completed: [] };
  let changes = { assigned: [], completed: [] };
  store.update((draft) => {
    changes = updateChargingAllocation(draft, undefined, now);
  });
  return changes;
}

// optimizeQueue (FR-OPT-17): bookings that no longer fit their slot (e.g. after a port failure)
// move to the nearest later slot with room, lowest priority first.
export function optimizeQueue(store, hubId, now = Date.now()) {
  const state = store.getState();
  const name = hubName(state, hubId);
  const overbooked = buildChargingSchedule(state, hubId, now).upcoming.flatMap((slot) => slot.bookings.filter((item) => item.overbooked));
  if (overbooked.length === 0) return success("queue_optimal", `The charging schedule of ${name} fits the working ports.`, { hubName: name });
  const moved = [];
  store.update((draft) => {
    for (const booking of overbooked) {
      const request = draft.chargingRequests.find((item) => item.id === booking.id);
      const target = getAvailableSlots(draft, hubId, now).find((slot) => slot.free > 0 && slot.slotStart > toTimestamp(request.slotStart));
      if (!target) continue;
      request.slotStart = toIso(target.slotStart);
      request.slotEnd = toIso(target.slotEnd);
      moved.push({ requestId: request.id, vehicleLabel: request.vehicleLabel, slotStart: request.slotStart });
    }
  });
  return moved.length > 0
    ? success("queue_optimized", `${moved.length} bookings at ${name} moved to later slots.`, { count: moved.length, hubName: name }, { moved })
    : failure("queue_no_room", `No later slot at ${name} has room.`, { hubName: name });
}

// Operator adjustment (FR-OPT-17): move a booking or waiting request to the next slot with room.
export function rescheduleChargingRequest(store, { requestId, now = Date.now() } = {}) {
  const state = store.getState();
  const request = state.chargingRequests.find((item) => item.id === requestId);
  if (!request) return failure("request_not_found", "Charging request not found.", { requestId });
  if (![SCHEDULED, QUEUED].includes(request.status)) {
    return failure("charging_reschedule_not_allowed", "Only a booked or waiting request can be moved.", { label: request.vehicleLabel });
  }
  const after = Math.max(toTimestamp(request.slotStart), slotStartOf(now));
  const target = getAvailableSlots(state, request.hubId, now).find((slot) => slot.free > 0 && slot.slotStart > after);
  const name = hubName(state, request.hubId);
  if (!target) return failure("charging_no_slot", `${name} has no later free slot.`, { hubName: name });
  store.update((draft) => {
    const item = draft.chargingRequests.find((entry) => entry.id === requestId);
    item.status = SCHEDULED;
    item.slotStart = toIso(target.slotStart);
    item.slotEnd = toIso(target.slotEnd);
    updateChargingAllocation(draft, [item.hubId], now);
  });
  return success("charging_rescheduled", `${request.vehicleLabel} moved to a later slot.`, {
    label: request.vehicleLabel, startTime: toIso(target.slotStart), endTime: toIso(target.slotEnd), slotDate: toIso(target.slotStart),
  });
}

// Operator action: the session on a port ends now and the port goes to the next request.
export function finishCharging(store, chargingPointId, now = Date.now()) {
  const state = store.getState();
  const point = state.chargingPoints.find((item) => item.id === chargingPointId);
  if (!point) return failure("point_not_found", "Charging point not found.", { pointId: chargingPointId });
  const session = state.chargingRequests.find((item) => item.status === CHARGING && item.chargingPointId === chargingPointId);
  if (!session) return failure("point_not_charging", `No charging session is running on ${chargingPointId}.`, { pointId: chargingPointId });
  let assigned = [];
  store.update((draft) => {
    completeSession(draft, draft.chargingRequests.find((item) => item.id === session.id), now);
    assigned = updateChargingAllocation(draft, [point.hubId], now).assigned;
  });
  const params = { label: session.vehicleLabel, pointId: chargingPointId };
  const following = assigned.find((item) => item.chargingPointId === chargingPointId);
  return following
    ? success("charging_finished_next", `${session.vehicleLabel} finished; ${following.vehicleLabel} now charges at ${chargingPointId}.`, { ...params, nextLabel: following.vehicleLabel })
    : success("charging_finished", `${session.vehicleLabel} finished charging at ${chargingPointId}.`, params);
}

// The student cancels an own booked/waiting session; the operator (no studentId) any booked/waiting request.
export function cancelChargingRequest(store, { requestId, studentId = null, now = Date.now() } = {}) {
  const state = store.getState();
  const request = state.chargingRequests.find((item) => item.id === requestId && (studentId === null || item.studentId === studentId));
  if (!request) return failure("request_not_found", "Charging request not found.", { requestId });
  if (![SCHEDULED, QUEUED].includes(request.status)) {
    return failure("charging_cancel_not_allowed", "Only a booked or waiting request can be cancelled.", { label: request.vehicleLabel });
  }
  store.update((draft) => {
    const item = draft.chargingRequests.find((entry) => entry.id === requestId);
    item.status = CANCELLED;
    item.cancelledAt = toIso(now);
    updateChargingAllocation(draft, [item.hubId], now);
  });
  return success("charging_cancelled", `Charging request for ${request.vehicleLabel} cancelled.`, { label: request.vehicleLabel });
}

export function getStudentChargingSessions(state, studentId) {
  return state.chargingRequests.filter((item) => item.studentId === studentId);
}
