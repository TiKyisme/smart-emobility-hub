import { haversineKm } from "../domain/geo.js";
import { nextId } from "../domain/ids.js";
import { failure, success } from "../domain/result.js";
import { ChargingPointStatus, ChargingRequestStatus, ReservationStatus, VehicleStatus } from "../domain/status.js";
import { SLOT_MS, slotEndOf, slotStartOf, toIso, toTimestamp } from "../domain/time.js";
import { LOW_BATTERY_PERCENT, updateChargingAllocation } from "./chargingService.js";
import { getAvailableSlotsCount, getThresholds, listHubSummaries } from "./hubService.js";
import { applyCoordination, listMovableVehicles } from "./operatorService.js";

// Traceability: FR-16..FR-18 / UC-17, UC-18 (Run What-if Simulation). Submission #3 names:
// SimulationController.requestSimulation / validateParams / runSimulationAlgorithm /
// saveToLibrary / applyCoordination, evaluateScenarioImpact, calculateMetrics, generateRecommendations.
export { applyCoordination };

export const ScenarioType = Object.freeze({
  METRO_ARRIVAL_SURGE: "metro_arrival_surge",
  HUB_FULL: "hub_full",
  CHARGING_DEMAND_SURGE: "charging_demand_surge",
  CHARGING_POINT_FAILURES: "charging_point_failures",
  VEHICLE_CONCENTRATION: "vehicle_concentration",
});

export const TIME_HORIZONS = Object.freeze([1, 2, 4]);
export const MAX_DEMAND_INCREASE_PERCENT = 500;
export const SIMULATION_TIMEOUT_MS = 2000;
// Team decisions for the impact labels (Submission #2 mockup: Critical bottleneck / Warning / Surplus).
export const WARNING_PERCENT = 70;
export const SURPLUS_VEHICLES = 3;

// Template defaults filled into the setup form (the operator can change every value).
export const SCENARIO_DEFAULTS = Object.freeze({
  [ScenarioType.METRO_ARRIVAL_SURGE]: { hubId: "HUB-METRO", demandIncreasePercent: 150, offlinePorts: 0, horizonHours: 2 },
  [ScenarioType.HUB_FULL]: { hubId: "KTX-A", demandIncreasePercent: 20, offlinePorts: 0, horizonHours: 1 },
  [ScenarioType.CHARGING_DEMAND_SURGE]: { hubId: "HUB-METRO", demandIncreasePercent: 150, offlinePorts: 0, horizonHours: 2 },
  [ScenarioType.CHARGING_POINT_FAILURES]: { hubId: "HUB-METRO", demandIncreasePercent: 0, offlinePorts: 1, horizonHours: 2 },
  [ScenarioType.VEHICLE_CONCENTRATION]: { hubId: "HUB-LIB", demandIncreasePercent: 50, offlinePorts: 0, horizonHours: 2 },
});

const { SCHEDULED, QUEUED, CHARGING } = ChargingRequestStatus;
const note = (code, message, params = {}) => ({ code, params, message });

// SimulationController.validateParams: demand increase not negative, offline ports not above the
// Hub's total, a supported horizon.
export function validateParams(state, params = {}) {
  if (!Object.values(ScenarioType).includes(params.type)) return failure("scenario_unknown", "Choose a scenario template.");
  const hub = state.hubs.find((item) => item.id === params.hubId);
  if (!hub) return failure("hub_not_found", "Hub not found.", { hubId: params.hubId });
  const demand = Number(params.demandIncreasePercent);
  if (params.demandIncreasePercent === "" || !Number.isInteger(demand) || demand < 0 || demand > MAX_DEMAND_INCREASE_PERCENT) {
    return failure("param_demand_invalid", `The demand increase must be a whole number from 0 to ${MAX_DEMAND_INCREASE_PERCENT} %.`, { max: MAX_DEMAND_INCREASE_PERCENT });
  }
  const totalPorts = state.chargingPoints.filter((point) => point.hubId === hub.id).length;
  const offline = Number(params.offlinePorts);
  if (params.offlinePorts === "" || !Number.isInteger(offline) || offline < 0 || offline > totalPorts) {
    return failure("param_ports_invalid", `Offline ports must be from 0 to ${totalPorts} at ${hub.name}.`, { max: totalPorts, hubName: hub.name });
  }
  const horizon = Number(params.horizonHours);
  if (!TIME_HORIZONS.includes(horizon)) return failure("param_horizon_invalid", "Choose a time horizon of 1, 2 or 4 hours.");
  return success("params_valid", "Parameters accepted.", {}, {
    params: { type: params.type, hubId: hub.id, demandIncreasePercent: demand, offlinePorts: offline, horizonHours: horizon },
  });
}

function usedParking(state, hub) {
  const held = state.parkingReservations.filter((item) => item.hubId === hub.id && item.status === ReservationStatus.ACTIVE).length;
  return hub.occupiedParking + held;
}

function chargingDemand(state, hubId, horizonEnd) {
  return state.chargingRequests.filter((request) => request.hubId === hubId && (
    request.status === QUEUED || request.status === CHARGING
    || (request.status === SCHEDULED && toTimestamp(request.slotStart) < horizonEnd))).length;
}

// calculateMetrics: per Hub — parking utilization (may exceed 100 % in a simulation: unserved
// arrivals), vehicle balance (available minus unmet demand) and charging load over the horizon.
export function calculateMetrics(state, { horizonHours = 1 } = {}, now = Date.now(), unmetVehicles = {}) {
  const horizonEnd = slotStartOf(now) + horizonHours * SLOT_MS;
  return listHubSummaries(state).map((hub) => {
    const ports = state.chargingPoints.filter((point) => point.hubId === hub.id && point.status !== ChargingPointStatus.UNAVAILABLE).length;
    const demand = chargingDemand(state, hub.id, horizonEnd);
    const capacity = ports * horizonHours;
    return {
      hubId: hub.id,
      hubName: hub.name,
      parkingPercent: hub.parkingCapacity ? Math.round((hub.usedParking / hub.parkingCapacity) * 100) : 0,
      vehicles: hub.availableVehicles - (unmetVehicles[hub.id] ?? 0),
      chargingDemand: demand,
      chargingCapacity: capacity,
      chargingPercent: capacity > 0 ? Math.round((demand / capacity) * 100) : (demand > 0 ? null : 0),
    };
  });
}

function classifyHub(metrics, { overloadPercent, shortageVehicles }) {
  const chargingCritical = metrics.chargingPercent === null || metrics.chargingPercent > 100;
  if (metrics.parkingPercent >= overloadPercent || metrics.vehicles < 0 || chargingCritical) return "critical";
  if (metrics.parkingPercent >= WARNING_PERCENT || metrics.vehicles < shortageVehicles || metrics.chargingPercent >= overloadPercent) return "warning";
  if (metrics.vehicles >= SURPLUS_VEHICLES && metrics.parkingPercent < 60) return "surplus";
  return "normal";
}

// evaluateScenarioImpact: current vs simulated metrics and an impact label for every Hub.
export function evaluateScenarioImpact(before, after, params, thresholds) {
  return after.map((simulated) => {
    const current = before.find((item) => item.hubId === simulated.hubId);
    return {
      hubId: simulated.hubId,
      hubName: simulated.hubName,
      target: simulated.hubId === params.hubId,
      changed: ["parkingPercent", "vehicles", "chargingPercent"].some((key) => current[key] !== simulated[key]),
      status: classifyHub(simulated, thresholds),
      before: current,
      after: simulated,
    };
  });
}

function simulatedRequest(state, hubId, index, now) {
  const slotStart = slotStartOf(now);
  return {
    id: `SIM-${String(state.chargingRequests.length + 1).padStart(3, "0")}`,
    status: QUEUED,
    source: "what_if",
    studentId: null,
    requestedBy: "SIMULATION",
    hubId,
    vehicleId: null,
    vehicleLabel: `SIM-${index + 1}`,
    battery: [15, 35, 55, 25][index % 4],
    upcomingUsage: index % 2 === 0,
    chargingPointId: null,
    slotStart: toIso(slotStart),
    slotEnd: toIso(slotEndOf(slotStart)),
    createdAt: toIso(now),
  };
}

function addChargingDemand(simulated, hub, params, now) {
  const ports = simulated.chargingPoints.filter((point) => point.hubId === hub.id && point.status !== ChargingPointStatus.UNAVAILABLE).length;
  const base = Math.max(chargingDemand(simulated, hub.id, slotStartOf(now) + params.horizonHours * SLOT_MS), ports, 1);
  const count = Math.ceil((base * params.demandIncreasePercent * params.horizonHours) / 100);
  for (let index = 0; index < count; index += 1) simulated.chargingRequests.push(simulatedRequest(simulated, hub.id, index, now));
  return count;
}

function takePortsOffline(simulated, hubId, count) {
  const ports = simulated.chargingPoints
    .filter((point) => point.hubId === hubId && point.status !== ChargingPointStatus.UNAVAILABLE)
    .sort((a, b) => Number(a.status === ChargingPointStatus.OCCUPIED) - Number(b.status === ChargingPointStatus.OCCUPIED))
    .slice(0, count);
  for (const point of ports) {
    point.status = ChargingPointStatus.UNAVAILABLE;
    delete point.simulatedOccupancy;
    // A session on the failed port goes back to waiting, exactly as in the live incident flow.
    for (const request of simulated.chargingRequests.filter((item) => item.chargingPointId === point.id && item.status === CHARGING)) {
      request.status = QUEUED;
      request.chargingPointId = null;
      const vehicle = request.vehicleId ? simulated.vehicles.find((item) => item.id === request.vehicleId) : null;
      if (vehicle?.status === VehicleStatus.CHARGING) vehicle.status = VehicleStatus.AVAILABLE;
    }
  }
  return ports.length;
}

// Applies the template to the copy. Returns explanatory notes and the vehicle demand left unmet.
function applyScenario(simulated, params, now) {
  const hub = simulated.hubs.find((item) => item.id === params.hubId);
  const factor = (params.demandIncreasePercent * params.horizonHours) / 100;
  const base = { hubName: hub.name, hours: params.horizonHours };
  const notes = [];
  const unmet = {};
  switch (params.type) {
    case ScenarioType.METRO_ARRIVAL_SURGE: {
      // Extra riders over the horizon: half end a trip and need a space, half need a vehicle.
      const arrivals = Math.ceil(Math.max(1, usedParking(simulated, hub)) * factor);
      const dropOffs = Math.ceil(arrivals / 2);
      const pickups = arrivals - dropOffs;
      hub.occupiedParking += dropOffs;
      const taken = simulated.vehicles.filter((item) => item.hubId === hub.id && item.status === VehicleStatus.AVAILABLE).slice(0, pickups);
      for (const vehicle of taken) vehicle.status = VehicleStatus.IN_USE;
      unmet[hub.id] = pickups - taken.length;
      notes.push(note("note_metro_surge", `${arrivals} extra arrivals at ${hub.name} in ${params.horizonHours} h.`, { ...base, arrivals, dropOffs, pickups }));
      break;
    }
    case ScenarioType.HUB_FULL: {
      const held = usedParking(simulated, hub) - hub.occupiedParking;
      const overflow = Math.ceil(hub.parkingCapacity * factor);
      hub.occupiedParking = Math.max(hub.occupiedParking, hub.parkingCapacity - held) + overflow;
      notes.push(note("note_hub_full", `${hub.name} is full; ${overflow} more arrivals need a space.`, { ...base, overflow }));
      break;
    }
    case ScenarioType.CHARGING_DEMAND_SURGE: {
      const count = addChargingDemand(simulated, hub, params, now);
      notes.push(note("note_charging_surge", `${count} extra charging requests at ${hub.name}.`, { ...base, count }));
      break;
    }
    case ScenarioType.CHARGING_POINT_FAILURES: {
      if (params.demandIncreasePercent > 0) {
        const count = addChargingDemand(simulated, hub, params, now);
        notes.push(note("note_charging_surge", `${count} extra charging requests at ${hub.name}.`, { ...base, count }));
      }
      break;
    }
    case ScenarioType.VEHICLE_CONCENTRATION: {
      const elsewhere = simulated.vehicles.filter((item) => item.hubId !== hub.id && item.status === VehicleStatus.AVAILABLE);
      const count = Math.min(elsewhere.length, Math.ceil((elsewhere.length * params.demandIncreasePercent) / 100));
      for (const vehicle of elsewhere.slice(0, count)) {
        const source = simulated.hubs.find((item) => item.id === vehicle.hubId);
        if (source && source.occupiedParking > 0) source.occupiedParking -= 1;
        vehicle.hubId = hub.id;
        hub.occupiedParking += 1;
      }
      notes.push(note("note_concentration", `${count} vehicles concentrate at ${hub.name}.`, { ...base, count }));
      break;
    }
    default:
      break;
  }
  const offline = takePortsOffline(simulated, hub.id, params.offlinePorts);
  if (offline > 0) notes.push(note("note_ports_offline", `${offline} charging ports offline at ${hub.name}.`, { ...base, count: offline }));
  return { notes, unmet };
}

// generateRecommendations: [Redistribute], [Smart Charging] and [User Redirect] advice computed
// from the simulated impact and the live resources that could act on it.
export function generateRecommendations(state, impact, params) {
  const thresholds = getThresholds(state);
  const target = impact.find((item) => item.target);
  const targetHub = state.hubs.find((hub) => hub.id === target.hubId);
  const recommendations = [];
  const movable = (hubId) => listMovableVehicles(state, hubId).length;

  if (target.after.vehicles < thresholds.shortageVehicles) {
    const source = impact
      .filter((item) => !item.target && movable(item.hubId) > thresholds.shortageVehicles)
      .sort((a, b) => movable(b.hubId) - movable(a.hubId) || a.hubName.localeCompare(b.hubName))[0];
    const count = source
      ? Math.min(thresholds.shortageVehicles - target.after.vehicles, movable(source.hubId) - thresholds.shortageVehicles, getAvailableSlotsCount(state, target.hubId))
      : 0;
    if (count > 0) {
      recommendations.push({
        kind: "redistribute", code: "rec_redistribute", fromHubId: source.hubId, toHubId: target.hubId, count,
        params: { count, fromHub: source.hubName, toHub: target.hubName },
        message: `Dispatch ${count} vehicles from ${source.hubName} to ${target.hubName}.`,
      });
    }
  }

  if (params.type === ScenarioType.VEHICLE_CONCENTRATION && target.after.parkingPercent >= thresholds.overloadPercent) {
    const destination = listHubSummaries(state)
      .filter((hub) => hub.id !== target.hubId && hub.parkingAvailable > 0)
      .sort((a, b) => b.parkingAvailable - a.parkingAvailable || a.name.localeCompare(b.name))[0];
    const count = destination ? Math.min(movable(target.hubId), destination.parkingAvailable, 2) : 0;
    if (count > 0) {
      recommendations.push({
        kind: "redistribute", code: "rec_redistribute", fromHubId: target.hubId, toHubId: destination.id, count,
        params: { count, fromHub: target.hubName, toHub: destination.name },
        message: `Dispatch ${count} vehicles from ${target.hubName} to ${destination.name}.`,
      });
    }
  }

  const portsOffline = params.offlinePorts > 0;
  const chargingStrained = target.after.chargingPercent === null || target.after.chargingPercent >= thresholds.overloadPercent;
  const lowBattery = state.vehicles.filter((vehicle) => vehicle.hubId === target.hubId && vehicle.status === VehicleStatus.AVAILABLE
    && vehicle.battery < LOW_BATTERY_PERCENT && !state.chargingRequests.some((request) => request.vehicleId === vehicle.id
      && [SCHEDULED, QUEUED, CHARGING].includes(request.status)));
  if (portsOffline || chargingStrained || lowBattery.length > 0) {
    recommendations.push({
      kind: "smart_charging", code: lowBattery.length > 0 ? "rec_charging_low" : "rec_charging", hubId: target.hubId,
      vehicleIds: lowBattery.map((vehicle) => vehicle.id),
      params: { hubName: target.hubName, count: lowBattery.length, percent: LOW_BATTERY_PERCENT },
      message: `Prioritise low-battery vehicles and move non-urgent charging bookings at ${target.hubName}.`,
    });
  }

  if (target.after.parkingPercent >= thresholds.overloadPercent) {
    const redirect = listHubSummaries(state)
      .filter((hub) => hub.id !== target.hubId && hub.parkingAvailable > 0 && hub.utilizationPercent < WARNING_PERCENT)
      .map((hub) => ({ hub, distanceKm: haversineKm(targetHub, hub) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];
    if (redirect) {
      recommendations.push({
        kind: "user_redirect", code: "rec_redirect", hubId: redirect.hub.id,
        params: { fromHub: target.hubName, toHub: redirect.hub.name, km: redirect.distanceKm.toFixed(1) },
        message: `Redirect riders from ${target.hubName} to ${redirect.hub.name}.`,
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({ kind: "monitor", code: "rec_monitor", params: {}, message: "No action needed; keep monitoring." });
  }
  return recommendations;
}

const STATUS_ORDER = { critical: 0, warning: 1, surplus: 2, normal: 3 };

// The cards shown: the target Hub, Hubs the scenario changed and Hubs named in a recommendation.
function selectCards(impact, recommendations) {
  const named = new Set(recommendations.flatMap((item) => [item.fromHubId, item.toHubId, item.hubId]).filter(Boolean));
  return impact
    .filter((item) => item.target || item.changed || named.has(item.hubId))
    .sort((a, b) => Number(b.target) - Number(a.target) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.hubName.localeCompare(b.hubName))
    .slice(0, 4);
}

// SimulationController.runSimulationAlgorithm (FR-16..FR-18, ADR-06): evaluates a deep copy only.
export function runSimulationAlgorithm(state, params, now = Date.now()) {
  const liveSnapshot = JSON.stringify(state);
  const simulated = structuredClone(state);
  const thresholds = getThresholds(state);
  const before = calculateMetrics(state, params, now);
  const { notes, unmet } = applyScenario(simulated, params, now);
  updateChargingAllocation(simulated, undefined, now);
  const after = calculateMetrics(simulated, params, now, unmet);
  const impact = evaluateScenarioImpact(before, after, params, thresholds);
  const recommendations = generateRecommendations(state, impact, params);
  return {
    params,
    notes,
    thresholds,
    impact,
    hubs: selectCards(impact, recommendations),
    recommendations,
    simulatedState: simulated,
    // Verified, not assumed (D-013): the live state serializes identically after the run.
    liveStateUnchanged: JSON.stringify(state) === liveSnapshot,
  };
}

// SimulationController.requestSimulation: validate, run on a copy, report a timeout (UC-17 activity).
export function requestSimulation(state, params, { now = Date.now(), timeoutMs = SIMULATION_TIMEOUT_MS } = {}) {
  const valid = validateParams(state, params);
  if (!valid.ok) return valid;
  const started = Date.now();
  const result = runSimulationAlgorithm(state, valid.params, now);
  if (Date.now() - started > timeoutMs) {
    return failure("simulation_timeout", "The simulation took too long and was stopped. Adjust the parameters and run it again.");
  }
  const hubName = state.hubs.find((hub) => hub.id === valid.params.hubId).name;
  return success("simulation_done", `Simulation of ${valid.params.type} at ${hubName} finished.`, { hubName }, { result });
}

// SimulationController.saveToLibrary: keeps the scenario parameters for reuse (not network data).
export function saveToLibrary(store, params, { critical = 0, now = Date.now() } = {}) {
  const valid = validateParams(store.getState(), params);
  if (!valid.ok) return valid;
  const scenario = { id: nextId("SCN", store.getState().savedScenarios), params: valid.params, critical, savedAt: toIso(now) };
  store.update((draft) => draft.savedScenarios.push(scenario));
  return success("scenario_saved", `${scenario.id} saved to the scenario library.`, { scenarioId: scenario.id }, { scenario });
}
