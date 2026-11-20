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

export const ReservationStatus = Object.freeze({
  ACTIVE: "active",
  IN_USE: "in_use",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

export const ChargingRequestStatus = Object.freeze({
  QUEUED: "queued",
  SCHEDULED: "scheduled",
});

export const IncidentStatus = Object.freeze({
  OPEN: "open",
});

export const InterfaceMode = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
});

export const InterfaceLanguage = Object.freeze({
  EN: "en",
  VI: "vi",
});
