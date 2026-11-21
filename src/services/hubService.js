import { haversineKm, walkingMinutes } from "../domain/geo.js";
import { failure, success } from "../domain/result.js";
import { ChargingPointStatus, ReservationStatus, VehicleStatus } from "../domain/status.js";

// Traceability: FR-01..FR-03 / UC-01..UC-03 (Find Suitable Hub / Vehicle, Check Resource Availability).
// Submission #3 names: HubSearchController.requestNearbyHubs / validateLocation / fetchAvailableVehicles,
// MobilityHubDatabase.fetchHubsInRadius, MobilityHub.getAvailableSlotsCount.
export const SEARCH_RADIUS_KM = Object.freeze({ min: 0.1, max: 5, default: 1 });
// FR-OPT-4..6 alert thresholds (team decision, changeable on the operator dashboard).
export const DEFAULT_THRESHOLDS = Object.freeze({ overloadPercent: 85, shortageVehicles: 1 });

export function getThresholds(state) {
  return { ...DEFAULT_THRESHOLDS, ...(state.settings ?? {}) };
}

function heldSpaces(state, hubId) {
  return state.parkingReservations.filter(
    (reservation) => reservation.hubId === hubId && reservation.status === ReservationStatus.ACTIVE,
  ).length;
}

// D-004: physical occupancy and active parking holds both consume Hub capacity.
export function summarizeHub(state, hubId) {
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return null;
  const vehicles = state.vehicles.filter((item) => item.hubId === hubId);
  const points = state.chargingPoints.filter((item) => item.hubId === hubId);
  const reservedParking = heldSpaces(state, hubId);
  const usedParking = hub.occupiedParking + reservedParking;
  const utilization = hub.parkingCapacity ? usedParking / hub.parkingCapacity : 0;
  return {
    ...hub,
    reservedParking,
    usedParking,
    parkingAvailable: Math.max(0, hub.parkingCapacity - usedParking),
    utilization,
    utilizationPercent: Math.round(utilization * 100),
    availableVehicles: vehicles.filter((item) => item.status === VehicleStatus.AVAILABLE).length,
    totalChargingPoints: points.length,
    availableChargingPoints: points.filter((item) => item.status === ChargingPointStatus.AVAILABLE).length,
  };
}

export function listHubSummaries(state) {
  return state.hubs.map((hub) => summarizeHub(state, hub.id));
}

// MobilityHub.getAvailableSlotsCount: free parking spaces after occupied and held spaces (never negative).
export function getAvailableSlotsCount(state, hubId) {
  return summarizeHub(state, hubId)?.parkingAvailable ?? 0;
}

// «include» Check Resource Availability (Find, Reserve and Parking use cases share it).
export function checkResourceAvailability(state, hubId) {
  const summary = summarizeHub(state, hubId);
  if (!summary) return null;
  return {
    hubId,
    parkingAvailable: summary.parkingAvailable,
    availableVehicles: summary.availableVehicles,
    availableChargingPoints: summary.availableChargingPoints,
  };
}

// Places a student can choose as location or destination: the Hubs and other campus places.
export function listPlaces(state) {
  return [...state.hubs, ...(state.places ?? [])];
}

function findPlace(state, placeId) {
  return listPlaces(state).find((place) => place.id === placeId) ?? null;
}

// HubSearchController.validateLocation: a known origin and 0.1 km <= radius <= 5.0 km.
export function validateLocation(state, { originId, radiusKm } = {}) {
  if (!originId) return failure("location_required", "Your location could not be determined. Choose it manually.");
  if (!findPlace(state, originId)) return failure("location_unknown", "Unknown location.");
  const radius = Number(radiusKm);
  if (!Number.isFinite(radius) || radius < SEARCH_RADIUS_KM.min || radius > SEARCH_RADIUS_KM.max) {
    return failure("radius_invalid", "The search radius must be between 0.1 and 5.0 km.", { min: SEARCH_RADIUS_KM.min, max: SEARCH_RADIUS_KM.max });
  }
  return success("location_valid", "Location accepted.");
}

// MobilityHubDatabase.fetchHubsInRadius: Haversine distance from the origin, nearest first.
export function fetchHubsInRadius(state, origin, radiusKm) {
  const { overloadPercent } = getThresholds(state);
  return listHubSummaries(state)
    .map((hub) => {
      const distanceKm = haversineKm(origin, hub);
      return {
        ...hub,
        distanceKm,
        walkMinutes: walkingMinutes(distanceKm),
        overloaded: hub.utilizationPercent >= overloadPercent,
      };
    })
    .filter((hub) => hub.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
}

// HubSearchController.requestNearbyHubs: validated search; with a destination, also the Hubs
// near it that still have parking (Submission #1, UC-02 A2).
export function requestNearbyHubs(state, { originId, destinationId = null, radiusKm = SEARCH_RADIUS_KM.default } = {}) {
  const valid = validateLocation(state, { originId, radiusKm });
  if (!valid.ok) return valid;
  const radius = Number(radiusKm);
  const origin = findPlace(state, originId);
  const hubs = fetchHubsInRadius(state, origin, radius);
  const destination = destinationId ? findPlace(state, destinationId) : null;
  const destinationHubs = destination
    ? fetchHubsInRadius(state, destination, radius).filter((hub) => hub.parkingAvailable > 0).slice(0, 3)
    : [];
  if (hubs.length === 0) {
    return failure("hubs_none", `No Mobility Hub within ${radius} km.`, { radius }, { hubs, destinationHubs });
  }
  return success("hubs_found", `${hubs.length} Hubs within ${radius} km.`, { count: hubs.length, radius }, { hubs, destinationHubs });
}

// HubSearchController.filterVehicles: Available, of the chosen type, battery >= minimum.
function filterVehicles(vehicles, { vehicleType = "", minBattery = 0 } = {}) {
  return vehicles.filter((vehicle) => vehicle.status === VehicleStatus.AVAILABLE
    && (!vehicleType || vehicle.type === vehicleType)
    && vehicle.battery >= (Number(minBattery) || 0));
}

// HubSearchController.fetchAvailableVehicles: vehicles at one Hub, best battery first.
export function fetchAvailableVehicles(state, { hubId, vehicleType = "", minBattery = 0 } = {}) {
  const atHub = state.vehicles.filter((vehicle) => vehicle.hubId === hubId);
  return filterVehicles(atHub, { vehicleType, minBattery }).sort((a, b) => b.battery - a.battery || a.id.localeCompare(b.id));
}
