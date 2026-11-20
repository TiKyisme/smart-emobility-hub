export const VehicleStatus = Object.freeze({
  AVAILABLE: "available",
  RESERVED: "reserved",
  IN_USE: "in_use",
  CHARGING: "charging",
  FAILED: "failed",
});

export const ChargingPointStatus = Object.freeze({
  AVAILABLE: "available",
  OCCUPIED: "occupied",
  UNAVAILABLE: "unavailable",
});

// Used for vehicle holds and parking holds.
export const ReservationStatus = Object.freeze({
  ACTIVE: "active",
  IN_USE: "in_use",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

// QUEUED = waiting for a charging point; SCHEDULED = assigned to a point and charging.
export const ChargingRequestStatus = Object.freeze({
  QUEUED: "queued",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

export const IncidentStatus = Object.freeze({
  OPEN: "open",
  RESOLVED: "resolved",
});

export const InterfaceMode = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
});

export const InterfaceLanguage = Object.freeze({
  EN: "en",
  VI: "vi",
});
