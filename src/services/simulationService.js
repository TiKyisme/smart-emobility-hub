import { ChargingPointStatus, ChargingRequestStatus, VehicleStatus } from "../domain/status.js";
import { allocateChargingPoints } from "./chargingService.js";
import { getCapacityRisks, suggestRedistribution } from "./operatorService.js";

// Traceability: FR-16..FR-18 / UC-17, UC-18 / AT-16..AT-18.
export const ScenarioType = Object.freeze({
  METRO_ARRIVAL_SURGE: "metro_arrival_surge",
  HUB_FULL: "hub_full",
  CHARGING_DEMAND_SURGE: "charging_demand_surge",
  CHARGING_POINT_FAILURES: "charging_point_failures",
  VEHICLE_CONCENTRATION: "vehicle_concentration",
});

export const ScenarioLabels = Object.freeze({
  [ScenarioType.METRO_ARRIVAL_SURGE]: "Sudden Metro arrival surge",
  [ScenarioType.HUB_FULL]: "Mobility Hub reaches full parking capacity",
  [ScenarioType.CHARGING_DEMAND_SURGE]: "Surge in charging demand",
  [ScenarioType.CHARGING_POINT_FAILURES]: "Partial charging-point failures",
  [ScenarioType.VEHICLE_CONCENTRATION]: "Excessive vehicle concentration",
});

const METRO_HUB_ID = "H-METRO";
const METRO_SURGE_ARRIVALS = 3;
const CONCENTRATION_VEHICLES = 2;

function note(code, message, params = {}) {
  return { code, params, message };
}

function createSimulationRequest(id, hubId, battery, upcomingUsage) {
  return {
    id,
    status: ChargingRequestStatus.QUEUED,
    source: "what_if",
    studentId: "SIMULATED",
    hubId,
    vehicleId: null,
    vehicleLabel: "Simulated charging demand",
    battery,
    upcomingUsage,
    chargingPointId: null,
  };
}

function buildImpact(before, after) {
  const beforeRisks = getCapacityRisks(before);
  const afterRisks = getCapacityRisks(after);
  const beforeAvailablePoints = before.chargingPoints.filter((point) => point.status === ChargingPointStatus.AVAILABLE).length;
  const afterAvailablePoints = after.chargingPoints.filter((point) => point.status === ChargingPointStatus.AVAILABLE).length;

  return {
    parking: {
      occupiedBefore: before.hubs.reduce((total, hub) => total + hub.occupiedParking, 0),
      occupiedAfter: after.hubs.reduce((total, hub) => total + hub.occupiedParking, 0),
      topRiskBefore: beforeRisks[0]?.name ?? null,
      topRiskAfter: afterRisks[0]?.name ?? null,
    },
    vehicles: {
      availableBefore: before.vehicles.filter((vehicle) => vehicle.status === VehicleStatus.AVAILABLE).length,
      availableAfter: after.vehicles.filter((vehicle) => vehicle.status === VehicleStatus.AVAILABLE).length,
      moved: after.vehicles.filter((vehicle, index) => vehicle.hubId !== before.vehicles[index]?.hubId).length,
    },
    charging: {
      queuedBefore: before.chargingRequests.filter((request) => request.status === ChargingRequestStatus.QUEUED).length,
      queuedAfter: after.chargingRequests.filter((request) => request.status === ChargingRequestStatus.QUEUED).length,
      availablePointsBefore: beforeAvailablePoints,
      availablePointsAfter: afterAvailablePoints,
    },
  };
}

function buildRecommendations(before, simulated, redistribution) {
  const recommendations = [];
  const topRisk = getCapacityRisks(simulated)[0];
  if (topRisk && topRisk.utilization >= 1) {
    recommendations.push(note(
      "rec_redirect",
      `Redirect arrivals or parking requests from ${topRisk.name} while capacity is constrained.`,
      { hubName: topRisk.name },
    ));
  }

  const impact = buildImpact(before, simulated).charging;
  if (impact.queuedAfter > impact.queuedBefore || impact.availablePointsAfter < impact.availablePointsBefore) {
    recommendations.push(note(
      "rec_charging",
      "Rebuild the smart charging schedule so low-battery and upcoming-usage requests are served first.",
    ));
  }

  if (redistribution) recommendations.push(note(redistribution.code, redistribution.message, redistribution.params));
  if (recommendations.length === 0) {
    recommendations.push(note("rec_monitor", "Continue monitoring the simulated state and review the next coordination cycle."));
  }
  return recommendations;
}

function applyScenario(simulated, scenario) {
  const hubName = (hubId) => simulated.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;
  switch (scenario.type) {
    case ScenarioType.METRO_ARRIVAL_SURGE: {
      const hub = simulated.hubs.find((item) => item.id === METRO_HUB_ID);
      if (hub) hub.occupiedParking += METRO_SURGE_ARRIVALS;
      return note("note_metro_surge", `Simulated a sudden increase in arrivals at the Metro Hub (+${METRO_SURGE_ARRIVALS} occupied spaces).`, { count: METRO_SURGE_ARRIVALS });
    }
    case ScenarioType.HUB_FULL: {
      const hub = simulated.hubs.find((item) => item.id === scenario.hubId) ?? simulated.hubs[0];
      if (hub) hub.occupiedParking = hub.parkingCapacity;
      return note("note_hub_full", `Simulated ${hub?.name ?? "a Hub"} reaching full parking capacity.`, { hubName: hub?.name ?? "" });
    }
    case ScenarioType.CHARGING_DEMAND_SURGE: {
      const hubId = scenario.hubId ?? METRO_HUB_ID;
      simulated.chargingRequests.push(
        createSimulationRequest("SIM-CHARGE-01", hubId, 24, true),
        createSimulationRequest("SIM-CHARGE-02", hubId, 41, false),
        createSimulationRequest("SIM-CHARGE-03", hubId, 33, true),
      );
      return note("note_charging_surge", `Simulated a surge in charging demand at ${hubName(hubId)} (+3 requests).`, { hubName: hubName(hubId), count: 3 });
    }
    case ScenarioType.CHARGING_POINT_FAILURES: {
      const working = simulated.chargingPoints.filter((item) => item.status !== ChargingPointStatus.UNAVAILABLE);
      const point = working.find((item) => item.hubId === scenario.hubId) ?? working[0];
      if (!point) return note("note_point_failure_none", "No charging point was left to fail in the simulated state.");
      point.status = ChargingPointStatus.UNAVAILABLE;
      // A session on the failed point goes back to the queue, exactly as in the live incident flow.
      for (const request of simulated.chargingRequests.filter((item) => item.chargingPointId === point.id && item.status === ChargingRequestStatus.SCHEDULED)) {
        request.status = ChargingRequestStatus.QUEUED;
        request.chargingPointId = null;
        const vehicle = request.vehicleId ? simulated.vehicles.find((item) => item.id === request.vehicleId) : null;
        if (vehicle?.status === VehicleStatus.CHARGING) vehicle.status = VehicleStatus.AVAILABLE;
      }
      return note("note_point_failure", `Simulated a partial charging-point failure (${point.id}).`, { pointId: point.id });
    }
    case ScenarioType.VEHICLE_CONCENTRATION: {
      const destinationHubId = scenario.hubId ?? METRO_HUB_ID;
      const destination = simulated.hubs.find((hub) => hub.id === destinationHubId);
      const candidates = simulated.vehicles
        .filter((vehicle) => vehicle.status === VehicleStatus.AVAILABLE && vehicle.hubId !== destinationHubId)
        .slice(0, CONCENTRATION_VEHICLES);
      for (const vehicle of candidates) {
        const source = simulated.hubs.find((hub) => hub.id === vehicle.hubId);
        if (source && source.occupiedParking > 0) source.occupiedParking -= 1;
        vehicle.hubId = destinationHubId;
        if (destination) destination.occupiedParking += 1;
      }
      return note(
        "note_concentration",
        `Simulated excessive vehicle concentration at ${destination?.name ?? "the selected Hub"} (${candidates.length} vehicles moved).`,
        { hubName: destination?.name ?? "", count: candidates.length },
      );
    }
    default:
      return note("note_unknown", "No supported scenario was selected.");
  }
}

export function runWhatIf(state, scenario) {
  // FR-16: start from the live state, but evaluate a deep copy only.
  const liveSnapshot = JSON.stringify(state);
  const simulated = structuredClone(state);
  const notes = [applyScenario(simulated, scenario)];
  // The hypothetical network reacts like the live one: free points are allocated by priority.
  allocateChargingPoints(simulated);
  const redistribution = suggestRedistribution(simulated);

  return {
    scenario,
    // Verified, not assumed: the live state must serialize identically after the run.
    liveStateUnchanged: JSON.stringify(state) === liveSnapshot,
    simulatedState: simulated,
    capacityRisks: getCapacityRisks(simulated),
    redistribution,
    recommendations: buildRecommendations(state, simulated, redistribution),
    impact: buildImpact(state, simulated),
    notes,
  };
}
