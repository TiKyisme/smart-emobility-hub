// UC-02: distances between the simulated Hub coordinates. The user chooses a known location;
// device GPS and navigation are out of scope (docs/REQUIREMENTS.md, section C).
const EARTH_RADIUS_KM = 6371;
// Team decision: walking speed of 80 m per minute (about 4.8 km/h) for the walking-time estimate.
const WALKING_METERS_PER_MINUTE = 80;

// Haversine great-circle distance in kilometres (Submission #3, fetchHubsInRadius).
export function haversineKm(from, to) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function walkingMinutes(km) {
  return Math.max(1, Math.ceil((km * 1000) / WALKING_METERS_PER_MINUTE));
}
