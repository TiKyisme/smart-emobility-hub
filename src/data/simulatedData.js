import {
  ChargingPointStatus,
  ChargingRequestStatus,
  InterfaceLanguage,
  InterfaceMode,
  VehicleStatus,
  VehicleType,
} from "../domain/status.js";
import { DEMO_OPERATOR_ID } from "../domain/actors.js";
import { slotEndOf, slotStartOf } from "../domain/time.js";

// Submission #1 team decision: 12 Mobility Hubs for the member universities, two dormitory areas,
// shared facilities, the service area and the Metro station. Names follow the Submission #2 mockups;
// coordinates are approximate simulated values, not GPS data.
const HUBS = [
  ["HUB-METRO", "Ga Metro ĐHQG", 10.866, 106.801, 8, 4],
  ["KTX-A", "KTX Khu A", 10.8783, 106.8062, 10, 7],
  ["KTX-B", "KTX Khu B", 10.8826, 106.7828, 12, 6],
  ["HUB-BK", "ĐH Bách Khoa", 10.88, 106.8052, 12, 5],
  ["HUB-KHTN", "ĐH Khoa học Tự nhiên", 10.8757, 106.7987, 10, 4],
  ["HUB-USSH", "ĐH KHXH&NV", 10.8722, 106.802, 8, 3],
  ["HUB-IU", "ĐH Quốc tế", 10.8777, 106.8016, 8, 4],
  ["HUB-UIT", "ĐH Công nghệ Thông tin", 10.87, 106.803, 8, 2],
  ["HUB-UEL", "ĐH Kinh tế - Luật", 10.8706, 106.778, 8, 7],
  ["HUB-LIB", "Thư viện Trung tâm", 10.874, 106.8, 10, 3],
  ["HUB-NVH", "Nhà Văn hóa Sinh viên", 10.8752, 106.8068, 6, 2],
  ["HUB-DV", "Khu dịch vụ", 10.869, 106.7955, 6, 3],
];

// Other places a student can start from or travel to (UC-02 location / destination input).
const PLACES = [
  ["LOC-GATE", "Cổng chính ĐHQG-HCM", 10.865, 106.7905],
  ["LOC-ADMIN", "Nhà Điều hành ĐHQG-HCM", 10.8738, 106.8046],
  ["LOC-BUS", "Bến xe buýt Suối Tiên", 10.8645, 106.8045],
  ["LOC-HEALTH", "Khoa Y - ĐHQG-HCM", 10.888, 106.796],
];

const { E_BIKE, E_SCOOTER } = VehicleType;
const VEHICLES = [
  ["EB-101", "HUB-METRO", E_BIKE, 82],
  ["EB-102", "HUB-METRO", E_BIKE, 28, { upcomingUsage: true }],
  ["EM-203", "HUB-METRO", E_SCOOTER, 64],
  ["EB-103", "KTX-A", E_BIKE, 61],
  ["EM-201", "KTX-A", E_SCOOTER, 18, { status: VehicleStatus.CHARGING, upcomingUsage: true }],
  ["EB-105", "KTX-A", E_BIKE, 90],
  ["EB-106", "KTX-B", E_BIKE, 77],
  ["EB-107", "KTX-B", E_BIKE, 55],
  ["EM-204", "KTX-B", E_SCOOTER, 88],
  ["EB-108", "KTX-B", E_BIKE, 43],
  ["EB-104", "HUB-BK", E_BIKE, 74],
  ["EM-205", "HUB-BK", E_SCOOTER, 22],
  ["EB-109", "HUB-KHTN", E_BIKE, 69],
  ["EM-206", "HUB-KHTN", E_SCOOTER, 35],
  ["EB-110", "HUB-USSH", E_BIKE, 58],
  ["EB-111", "HUB-IU", E_BIKE, 81],
  ["EM-207", "HUB-IU", E_SCOOTER, 47],
  ["EB-112", "HUB-UIT", E_BIKE, 15],
  ["EM-208", "HUB-UEL", E_SCOOTER, 66],
  ["EB-113", "HUB-UEL", E_BIKE, 71],
  ["EB-114", "HUB-LIB", E_BIKE, 93],
  ["EM-209", "HUB-LIB", E_SCOOTER, 52],
  ["EM-202", "HUB-DV", E_SCOOTER, 47],
];

const CHARGING_POINTS = [
  ["CP-01", "HUB-METRO"], ["CP-02", "HUB-METRO"], ["CP-03", "KTX-A", ChargingPointStatus.OCCUPIED],
  ["CP-04", "HUB-BK"], ["CP-05", "HUB-DV"], ["CP-06", "KTX-B"], ["CP-07", "KTX-B"],
  ["CP-08", "HUB-KHTN"], ["CP-09", "HUB-LIB"], ["CP-10", "HUB-UIT"], ["CP-11", "HUB-IU"],
  ["CP-12", "HUB-UEL"], ["CP-13", "HUB-USSH"], ["CP-14", "HUB-NVH"],
];

// `now` fixes the current charging slot of the seeded session (tests pass a fixed clock).
export function createInitialState(now = Date.now()) {
  const slotStart = slotStartOf(now);
  return {
    interfaceMode: InterfaceMode.LIGHT,
    interfaceLanguage: InterfaceLanguage.VI,
    updateSequence: 0,
    lastUpdate: {
      source: "simulator",
      code: "initial_state",
      params: {},
      message: "Initial simulated state loaded.",
      at: null,
    },
    // FR-OPT-4..6: alert thresholds are team decisions and can be changed by the operator.
    settings: { overloadPercent: 85, shortageVehicles: 1 },
    hubs: HUBS.map(([id, name, lat, lng, parkingCapacity, occupiedParking]) => ({
      id, name, lat, lng, parkingCapacity, occupiedParking,
    })),
    places: PLACES.map(([id, name, lat, lng]) => ({ id, name, lat, lng })),
    vehicles: VEHICLES.map(([id, hubId, type, battery, extra = {}]) => ({
      id, hubId, type, battery, status: VehicleStatus.AVAILABLE, upcomingUsage: false, ...extra,
    })),
    chargingPoints: CHARGING_POINTS.map(([id, hubId, status = ChargingPointStatus.AVAILABLE]) => ({ id, hubId, status })),
    reservations: [],
    parkingReservations: [],
    // EM-201 is already charging on CP-03 in the current slot when the simulation starts.
    chargingRequests: [
      {
        id: "CHG-001",
        status: ChargingRequestStatus.CHARGING,
        source: "shared",
        studentId: null,
        requestedBy: DEMO_OPERATOR_ID,
        hubId: "KTX-A",
        vehicleId: "EM-201",
        vehicleLabel: "EM-201",
        battery: 18,
        upcomingUsage: true,
        chargingPointId: "CP-03",
        slotStart: new Date(slotStart).toISOString(),
        slotEnd: new Date(slotEndOf(slotStart)).toISOString(),
        createdAt: null,
        startedAt: null,
        completedAt: null,
      },
    ],
    incidents: [],
    maintenanceTasks: [],
    dispatchOrders: [],
    savedScenarios: [],
    notifications: [],
    operationalEvents: [],
  };
}
