import { ChargingPointStatus, ChargingRequestStatus, VehicleStatus } from "../domain/status.js";
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
      topRiskBefore: beforeRisks[0]?.name ?? "None",
      topRiskAfter: afterRisks[0]?.name ?? "None",
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
  const risks = getCapacityRisks(simulated);
  const topRisk = risks[0];
  if (topRisk && topRisk.utilization >= 1) {
    recommendations.push(`Redirect arrivals or parking requests from ${topRisk.name} while capacity is constrained.`);
  }

  const queuedBefore = before.chargingRequests.filter((request) => request.status === ChargingRequestStatus.QUEUED).length;
  const queuedAfter = simulated.chargingRequests.filter((request) => request.status === ChargingRequestStatus.QUEUED).length;
  const availableBefore = before.chargingPoints.filter((point) => point.status === ChargingPointStatus.AVAILABLE).length;
  const availableAfter = simulated.chargingPoints.filter((point) => point.status === ChargingPointStatus.AVAILABLE).length;
  if (queuedAfter > queuedBefore || availableAfter < availableBefore) {
    recommendations.push("Rebuild the smart charging schedule so low-battery and upcoming-usage requests are served first.");
  }

  if (redistribution) recommendations.push(redistribution.message);
  if (recommendations.length === 0) recommendations.push("Continue monitoring the simulated state and review the next coordination cycle.");
  return recommendations;
}

export function runWhatIf(state, scenario) {
  const simulated = structuredClone(state);
  const notes = [];

  switch (scenario.type) {
    case ScenarioType.METRO_ARRIVAL_SURGE: {
      const hub = simulated.hubs.find((item) => item.id === "H-METRO");
      if (hub) hub.occupiedParking += 3;
      notes.push("Simulated a sudden increase in arrivals at the Metro Hub.");
      break;
    }
    case ScenarioType.HUB_FULL: {
      const hub = simulated.hubs.find((item) => item.id === scenario.hubId) ?? simulated.hubs[0];
      if (hub) hub.occupiedParking = hub.parkingCapacity;
      notes.push(`Simulated ${hub?.name ?? "a Hub"} reaching full parking capacity.`);
      break;
    }
    case ScenarioType.CHARGING_DEMAND_SURGE: {
      const hubId = scenario.hubId ?? "H-METRO";
      simulated.chargingRequests.push(
        createSimulationRequest("SIM-CHARGE-01", hubId, 24, true),
        createSimulationRequest("SIM-CHARGE-02", hubId, 41, false),
        createSimulationRequest("SIM-CHARGE-03", hubId, 33, true),
      );
      notes.push("Simulated a surge in charging demand; scheduling pressure should be reviewed.");
      break;
    }
    case ScenarioType.CHARGING_POINT_FAILURES: {
      const point = simulated.chargingPoints.find((item) => item.status !== ChargingPointStatus.UNAVAILABLE);
      if (point) point.status = ChargingPointStatus.UNAVAILABLE;
      notes.push("Simulated a partial charging-point failure.");
      break;
    }
    case ScenarioType.VEHICLE_CONCENTRATION:
      {
        const destinationHubId = scenario.hubId ?? "H-METRO";
        const destination = simulated.hubs.find((hub) => hub.id === destinationHubId);
        const candidates = simulated.vehicles
          .filter((vehicle) => vehicle.status === VehicleStatus.AVAILABLE && vehicle.hubId !== destinationHubId)
          .slice(0, 2);
        for (const vehicle of candidates) {
          const source = simulated.hubs.find((hub) => hub.id === vehicle.hubId);
          if (source && source.occupiedParking > 0) source.occupiedParking -= 1;
          vehicle.hubId = destinationHubId;
          if (destination) destination.occupiedParking += 1;
        }
        notes.push(`Simulated excessive vehicle concentration at ${destination?.name ?? "the selected Hub"}.`);
      }
      break;
    default:
      notes.push("No supported scenario was selected.");
  }

  const redistribution = suggestRedistribution(simulated);
  const impact = buildImpact(state, simulated);
  return {
    scenario,
    liveStateUnchanged: true,
    simulatedState: simulated,
    capacityRisks: getCapacityRisks(simulated),
    redistribution,
    recommendations: buildRecommendations(state, simulated, redistribution),
    impact,
    notes,
  };
}
