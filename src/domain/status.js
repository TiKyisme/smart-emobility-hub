// Status values shared by the services and the views. Names follow the Submission #1–#3 reports.

// IN_TRANSIT: the vehicle is assigned to a redistribution task (Redistribute Vehicles /
// Execute Redistribution Task) and cannot be reserved until the task is completed or cancelled.
export const VehicleStatus = Object.freeze({
  AVAILABLE: "available",
  RESERVED: "reserved",
  IN_USE: "in_use",
  CHARGING: "charging",
  FAILED: "failed",
  IN_TRANSIT: "in_transit",
});

// FR-SVU-1/2 (Submission #1): search and display by vehicle type.
export const VehicleType = Object.freeze({
  E_BIKE: "e_bike",
  E_SCOOTER: "e_scooter",
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

// UC-09: SCHEDULED = confirmed booking for a time slot (ChargingSession.markScheduled);
// QUEUED = the slot has started and the session waits for a free port; CHARGING = on a port.
export const ChargingRequestStatus = Object.freeze({
  SCHEDULED: "scheduled",
  QUEUED: "queued",
  CHARGING: "charging",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

// UC-15 lifecycle shown in the Submission #2 incident mockup:
// New (recorded) → Assigned (to Maintenance Staff) → In progress → Resolved.
export const IncidentStatus = Object.freeze({
  NEW: "new",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
});

export const IncidentSeverity = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});

export const MaintenanceTaskStatus = Object.freeze({
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
});

// FR-OPT-7..9 / FR-DIS-1..8: redistribution orders executed by the Vehicle Dispatch Staff.
export const DispatchOrderStatus = Object.freeze({
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

export const InterfaceMode = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
});

export const InterfaceLanguage = Object.freeze({
  EN: "en",
  VI: "vi",
});
