import { createInitialState } from "../../src/data/simulatedData.js";
import { createStore } from "../../src/state/store.js";

export const METRO = "H-METRO";
export const DORM = "H-DORM";
export const CAMPUS = "H-CAMPUS";
export const SERVICE = "H-SERVICE";

// Fixed clock for deterministic reservation/expiry checks.
export const T0 = Date.parse("2026-11-20T08:00:00.000Z");

export function freshStore() {
  return createStore(createInitialState());
}

export function vehicle(store, id) {
  return store.getState().vehicles.find((item) => item.id === id);
}

export function point(store, id) {
  return store.getState().chargingPoints.find((item) => item.id === id);
}

export function hub(store, id) {
  return store.getState().hubs.find((item) => item.id === id);
}

export function requestFor(store, label) {
  return store.getState().chargingRequests.find((item) => item.vehicleLabel === label);
}
