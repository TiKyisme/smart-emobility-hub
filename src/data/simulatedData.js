import { VehicleStatus, ChargingPointStatus } from "../domain/status.js";

export function createInitialState() {
  return {
    interfaceMode: "light",
    updateSequence: 0,
    lastUpdate: {
      source: "simulator",
      message: "Initial simulated state loaded.",
      at: null,
    },
    hubs: [
      { id: "H-METRO", name: "Metro Hub", parkingCapacity: 8, occupiedParking: 4 },
      { id: "H-DORM", name: "Dormitory Hub", parkingCapacity: 10, occupiedParking: 7 },
      { id: "H-CAMPUS", name: "University Hub", parkingCapacity: 12, occupiedParking: 5 },
      { id: "H-SERVICE", name: "Service Area Hub", parkingCapacity: 6, occupiedParking: 3 },
    ],
    vehicles: [
      { id: "EV-01", hubId: "H-METRO", battery: 82, status: VehicleStatus.AVAILABLE, upcomingUsage: false },
      { id: "EV-02", hubId: "H-METRO", battery: 28, status: VehicleStatus.AVAILABLE, upcomingUsage: true },
      { id: "EV-03", hubId: "H-DORM", battery: 61, status: VehicleStatus.AVAILABLE, upcomingUsage: false },
      { id: "EV-04", hubId: "H-DORM", battery: 18, status: VehicleStatus.CHARGING, upcomingUsage: true },
      { id: "EV-05", hubId: "H-CAMPUS", battery: 74, status: VehicleStatus.AVAILABLE, upcomingUsage: false },
      { id: "EV-06", hubId: "H-SERVICE", battery: 47, status: VehicleStatus.AVAILABLE, upcomingUsage: false },
    ],
    chargingPoints: [
      { id: "CP-01", hubId: "H-METRO", status: ChargingPointStatus.AVAILABLE },
      { id: "CP-02", hubId: "H-METRO", status: ChargingPointStatus.AVAILABLE },
      { id: "CP-03", hubId: "H-DORM", status: ChargingPointStatus.OCCUPIED },
      { id: "CP-04", hubId: "H-CAMPUS", status: ChargingPointStatus.AVAILABLE },
      { id: "CP-05", hubId: "H-SERVICE", status: ChargingPointStatus.AVAILABLE },
    ],
    reservations: [],
    parkingReservations: [],
    chargingRequests: [],
    incidents: [],
    operationalEvents: [],
    simulationHistory: [],
  };
}
