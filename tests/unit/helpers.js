import { createInitialState } from "../../src/data/simulatedData.js";
import { slotStartOf } from "../../src/domain/time.js";
import { createStore } from "../../src/state/store.js";

export const METRO = "HUB-METRO";
export const DORM = "KTX-A";
export const DORM_B = "KTX-B";
export const CAMPUS = "HUB-BK";
export const UIT = "HUB-UIT";
export const UEL = "HUB-UEL";
export const LIB = "HUB-LIB";
export const NVH = "HUB-NVH";
export const SERVICE = "HUB-DV";
export const STUDENT = "STUDENT-DEMO";
export const OTHER = "STUDENT-B";

// Fixed clock for deterministic checks: 20 minutes into a one-hour charging slot.
export const T0 = Date.parse("2026-11-20T08:20:00.000Z");
export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;

// Start of the charging slot `offset` hours after the slot that contains T0.
export function slotAt(offset, now = T0) {
  return slotStartOf(now) + offset * HOUR;
}

export function freshStore(now = T0) {
  return createStore(createInitialState(now));
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

export function request(store, id) {
  return store.getState().chargingRequests.find((item) => item.id === id);
}

export function requestFor(store, label) {
  return store.getState().chargingRequests.find((item) => item.vehicleLabel === label);
}

export function incident(store, id) {
  return store.getState().incidents.find((item) => item.id === id);
}
