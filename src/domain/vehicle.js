// Entity operations of the class design (Vehicle, ChargingPort / MobilityResource) as pure functions
// on plain records (Submission #3, section 5.3).
import { ChargingPointStatus, VehicleStatus, VehicleType } from "./status.js";

// Team decision: nominal range on a full battery, used only for the estimate shown to students.
const FULL_RANGE_KM = Object.freeze({ [VehicleType.E_BIKE]: 40, [VehicleType.E_SCOOTER]: 70 });

const TRANSITIONS = Object.freeze({
  [VehicleStatus.AVAILABLE]: [VehicleStatus.RESERVED, VehicleStatus.CHARGING, VehicleStatus.FAILED, VehicleStatus.IN_TRANSIT],
  [VehicleStatus.RESERVED]: [VehicleStatus.AVAILABLE, VehicleStatus.IN_USE, VehicleStatus.FAILED],
  [VehicleStatus.IN_USE]: [VehicleStatus.AVAILABLE, VehicleStatus.FAILED],
  [VehicleStatus.CHARGING]: [VehicleStatus.AVAILABLE, VehicleStatus.FAILED],
  [VehicleStatus.IN_TRANSIT]: [VehicleStatus.AVAILABLE, VehicleStatus.FAILED],
  [VehicleStatus.FAILED]: [VehicleStatus.AVAILABLE],
});

export function getBatteryLevel(vehicle) {
  return vehicle?.battery ?? null;
}

export function estimatedRangeKm(vehicle) {
  return Math.round(((vehicle.battery ?? 0) / 100) * (FULL_RANGE_KM[vehicle.type] ?? 0));
}

// Vehicle.changeStatus: applies only transitions allowed by the business rules; returns whether it did.
export function changeStatus(vehicle, nextStatus) {
  if (!vehicle) return false;
  if (vehicle.status === nextStatus) return true;
  if (!(TRANSITIONS[vehicle.status] ?? []).includes(nextStatus)) return false;
  vehicle.status = nextStatus;
  return true;
}

// Vehicle.isOperational / ChargingPort.isOperational.
export function isOperational(resource) {
  if (!resource) return false;
  if ("battery" in resource) return resource.status !== VehicleStatus.FAILED;
  return resource.status !== ChargingPointStatus.UNAVAILABLE;
}

// UC-04 E2 / UC-09 E2: the Data Simulator can make a resource's state unreadable for a short time.
export function readErrorActive(resource, now) {
  return Boolean(resource?.readErrorUntil) && Date.parse(resource.readErrorUntil) > now;
}
