// Monitor Network Status, Redistribute Vehicles / Execute Redistribution Task and
// Handle Operational Incident / Resolve Assigned Incident (FR-10..FR-14; FR-OPT, FR-DIS, FR-MNT).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ChargingPointStatus,
  ChargingRequestStatus,
  DispatchOrderStatus,
  IncidentStatus,
  MaintenanceTaskStatus,
  ReservationStatus,
  VehicleStatus,
} from "../../src/domain/status.js";
import { createChargingSession } from "../../src/services/chargingService.js";
import { getAvailableSlotsCount } from "../../src/services/hubService.js";
import {
  applyCoordination,
  applyOperationalAction,
  assignMaintenance,
  cancelRedistributionOrder,
  classifyIncident,
  completeMaintenanceTask,
  completeRedistributionTask,
  createRedistributionOrder,
  detectCapacityRisks,
  getBatteryLevel,
  getNetworkMetrics,
  identifyBottlenecks,
  isOperational,
  markResourceUnavailable,
  planRedistribution,
  recordIncident,
  startMaintenanceTask,
  startRedistributionTask,
  updateAlertThresholds,
} from "../../src/services/operatorService.js";
import { pickUpVehicle, reserveVehicle } from "../../src/services/reservationService.js";
import { freshStore, hub, incident, LIB, METRO, MINUTE, NVH, point, slotAt, STUDENT, T0, UEL, vehicle } from "./helpers.js";

test("detectCapacityRisks / identifyBottlenecks: utilization ranking with configured overload and shortage alerts", () => {
  const state = freshStore().getState();
  const risks = detectCapacityRisks(state);
  assert.equal(risks[0].id, UEL);
  assert.equal(risks[0].overloaded, true);
  for (let index = 1; index < risks.length; index += 1) assert.ok(risks[index - 1].utilization >= risks[index].utilization);
  assert.deepEqual(identifyBottlenecks(state).map((alert) => [alert.type, alert.hubId]), [["overload", UEL], ["shortage", NVH]]);
});

test("FR-OPT-4..6: thresholds are configurable and validated", () => {
  const store = freshStore();
  assert.equal(updateAlertThresholds(store, { overloadPercent: 40, shortageVehicles: 1 }).code, "thresholds_invalid");
  assert.equal(updateAlertThresholds(store, { overloadPercent: 90, shortageVehicles: 0 }).code, "thresholds_updated");
  assert.deepEqual(identifyBottlenecks(store.getState()), []);
  assert.equal(updateAlertThresholds(store, { overloadPercent: 70, shortageVehicles: 2 }).ok, true);
  const alerts = identifyBottlenecks(store.getState());
  assert.ok(alerts.some((alert) => alert.type === "overload" && alert.hubId === "KTX-A"), "70 % now counts");
  assert.ok(alerts.filter((alert) => alert.type === "shortage").length >= 3);
});

test("network metrics, battery level and operational state", () => {
  const state = freshStore().getState();
  const metrics = getNetworkMetrics(state);
  assert.equal(metrics.hubs, 12);
  assert.equal(metrics.vehicles, 23);
  assert.equal(metrics.availableVehicles, 22);
  assert.equal(metrics.chargingPoints, 14);
  assert.equal(metrics.availableChargingPoints, 13);
  assert.equal(metrics.alerts, 2);
  assert.equal(getBatteryLevel(state.vehicles[0]), 82);
  assert.equal(isOperational(state.vehicles[0]), true);
  assert.equal(isOperational({ ...state.chargingPoints[0], status: ChargingPointStatus.UNAVAILABLE }), false);
});

test("planRedistribution: the shortage Hub receives a vehicle from the overloaded Hub", () => {
  const plan = planRedistribution(freshStore().getState());
  assert.equal(plan.code, "plan_shortage");
  assert.equal(plan.fromHubId, UEL);
  assert.equal(plan.toHubId, NVH);
  assert.equal(plan.count, 1);
});

test("Execute Redistribution Task: assigned → in progress → completed updates the vehicle and both Hubs", () => {
  const store = freshStore();
  const created = createRedistributionOrder(store, { vehicleId: "EM-208", toHubId: NVH, now: T0 });
  assert.equal(created.code, "dispatch_created");
  const { order } = created;
  assert.equal(order.status, DispatchOrderStatus.ASSIGNED);
  assert.equal(vehicle(store, "EM-208").status, VehicleStatus.IN_TRANSIT);
  assert.equal(getAvailableSlotsCount(store.getState(), NVH), 3, "one space held at the destination");
  assert.equal(reserveVehicle(store, { studentId: STUDENT, vehicleId: "EM-208", now: T0 }).code, "vehicle_not_available");
  assert.equal(completeRedistributionTask(store, { orderId: order.id }).code, "dispatch_not_started");
  assert.equal(startRedistributionTask(store, { orderId: order.id, now: T0 + MINUTE }).code, "dispatch_started");
  assert.equal(hub(store, UEL).occupiedParking, 6);
  assert.equal(completeRedistributionTask(store, { orderId: order.id, now: T0 + 10 * MINUTE }).code, "dispatch_completed");
  assert.equal(vehicle(store, "EM-208").hubId, NVH);
  assert.equal(vehicle(store, "EM-208").status, VehicleStatus.AVAILABLE);
  assert.equal(hub(store, NVH).occupiedParking, 3);
  assert.equal(getAvailableSlotsCount(store.getState(), NVH), 3, "the hold was released");
  assert.equal(store.getState().dispatchOrders[0].status, DispatchOrderStatus.COMPLETED);
  assert.ok(!identifyBottlenecks(store.getState()).length, "both alerts cleared");
});

test("redistribution orders: invalid requests are refused; an assigned order can be cancelled", () => {
  const store = freshStore();
  assert.equal(createRedistributionOrder(store, { vehicleId: "EB-101", toHubId: METRO }).code, "dispatch_same_hub");
  assert.equal(createRedistributionOrder(store, { vehicleId: "EM-201", toHubId: NVH }).code, "dispatch_vehicle_unavailable");
  store.update((draft) => { draft.hubs.find((item) => item.id === NVH).occupiedParking = 6; });
  assert.equal(createRedistributionOrder(store, { vehicleId: "EB-101", toHubId: NVH }).code, "dispatch_destination_full");
  const { order } = createRedistributionOrder(store, { vehicleId: "EB-101", toHubId: LIB, now: T0 });
  assert.equal(cancelRedistributionOrder(store, { orderId: order.id }).code, "dispatch_cancelled");
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.AVAILABLE);
  assert.equal(store.getState().parkingReservations[0].status, ReservationStatus.CANCELLED);
  assert.equal(cancelRedistributionOrder(store, { orderId: order.id }).code, "dispatch_cancel_not_allowed");
});

test("applyCoordination: a redistribution plan becomes tasks for the Vehicle Dispatch Staff", () => {
  const store = freshStore();
  const result = applyCoordination(store, [planRedistribution(store.getState())], T0);
  assert.equal(result.code, "coordination_applied");
  assert.equal(result.params.orders, 1);
  assert.equal(store.getState().dispatchOrders[0].toHubId, NVH);
  assert.equal(applyCoordination(store, [{ kind: "user_redirect" }], T0).code, "coordination_nothing");
});

test("UC-15 repair branch: record → classify → assign (resource unavailable) → start → complete (resolved, restored)", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  const recorded = recordIncident(store, { resourceType: "vehicle", resourceId: "EB-101", now: T0 });
  assert.equal(recorded.code, "incident_recorded");
  const id = recorded.incident.id;
  assert.equal(incident(store, id).status, IncidentStatus.NEW);
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.RESERVED, "recording alone does not change the resource");
  assert.equal(recordIncident(store, { resourceType: "vehicle", resourceId: "EB-101" }).code, "incident_duplicate");
  assert.equal(assignMaintenance(store, { incidentId: id }).code, "incident_not_classified");
  assert.equal(classifyIncident(store, { incidentId: id, type: "charging_point_power", severity: "high" }).code, "incident_classification_invalid");
  assert.equal(classifyIncident(store, { incidentId: id, type: "vehicle_failure", severity: "high", now: T0 }).code, "incident_classified");
  const assigned = assignMaintenance(store, { incidentId: id, now: T0 });
  assert.equal(assigned.code, "maintenance_assigned");
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.FAILED);
  assert.equal(store.getState().reservations[0].status, ReservationStatus.CANCELLED, "the student's hold is cancelled");
  assert.equal(incident(store, id).status, IncidentStatus.ASSIGNED);
  const taskId = assigned.task.id;
  assert.equal(completeMaintenanceTask(store, { taskId }).code, "task_not_started");
  assert.equal(startMaintenanceTask(store, { taskId, now: T0 + MINUTE }).code, "maintenance_started");
  assert.equal(incident(store, id).status, IncidentStatus.IN_PROGRESS);
  assert.equal(completeMaintenanceTask(store, { taskId, now: T0 + 5 * MINUTE }).code, "vehicle_repaired");
  assert.equal(incident(store, id).status, IncidentStatus.RESOLVED);
  assert.equal(incident(store, id).resolution, "repair");
  assert.equal(vehicle(store, "EB-101").status, VehicleStatus.AVAILABLE);
  assert.equal(store.getState().maintenanceTasks[0].status, MaintenanceTaskStatus.COMPLETED);
});

test("UC-15 operational branch: classify → restore without repair resolves the incident", () => {
  const store = freshStore();
  const { incident: recorded } = recordIncident(store, { resourceType: "charging_point", resourceId: "CP-02", now: T0 });
  assert.equal(markResourceUnavailable(store, { incidentId: recorded.id, now: T0 }).code, "resource_marked_unavailable");
  assert.equal(point(store, "CP-02").status, ChargingPointStatus.UNAVAILABLE);
  assert.equal(markResourceUnavailable(store, { incidentId: recorded.id }).code, "resource_already_unavailable");
  classifyIncident(store, { incidentId: recorded.id, type: "charging_point_power", severity: "medium" });
  const result = applyOperationalAction(store, { incidentId: recorded.id, now: T0 + MINUTE });
  assert.equal(result.code, "point_restored");
  assert.equal(point(store, "CP-02").status, ChargingPointStatus.AVAILABLE);
  assert.equal(incident(store, recorded.id).resolution, "operational");
  assert.equal(applyOperationalAction(store, { incidentId: recorded.id }).code, "incident_not_new");
});

test("a port taken out of service: its session moves to another free port; restoring hands it the next request", () => {
  const store = freshStore();
  const first = createChargingSession(store, { studentId: STUDENT, hubId: METRO, slotStart: slotAt(0), vehicleLabel: "59A-1", battery: 40, now: T0 }).request;
  const portOfFirst = first.chargingPointId;
  const otherPort = portOfFirst === "CP-01" ? "CP-02" : "CP-01";
  const { incident: recorded } = recordIncident(store, { resourceType: "charging_point", resourceId: portOfFirst, now: T0 });
  classifyIncident(store, { incidentId: recorded.id, type: "charging_point_unavailable", severity: "high" });
  assignMaintenance(store, { incidentId: recorded.id, now: T0 });
  const moved = store.getState().chargingRequests.find((item) => item.id === first.id);
  assert.equal(moved.status, ChargingRequestStatus.CHARGING);
  assert.equal(moved.chargingPointId, otherPort);
  // A second session in the same slot has to wait: the Hub has one working port left.
  const second = createChargingSession(store, { studentId: "STUDENT-C", hubId: METRO, slotStart: slotAt(1), vehicleLabel: "59A-2", battery: 30, now: T0 });
  assert.equal(second.code, "session_scheduled");
  const taskId = store.getState().maintenanceTasks[0].id;
  startMaintenanceTask(store, { taskId, now: T0 });
  assert.equal(completeMaintenanceTask(store, { taskId, now: T0 }).code, "point_restored");
  assert.equal(point(store, portOfFirst).status, ChargingPointStatus.AVAILABLE);
});

test("a vehicle that failed during a trip needs a free space at its Hub before it is restored", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 });
  pickUpVehicle(store, { studentId: STUDENT, vehicleId: "EB-101", now: T0 + MINUTE });
  const { incident: recorded } = recordIncident(store, { resourceType: "vehicle", resourceId: "EB-101", now: T0 });
  classifyIncident(store, { incidentId: recorded.id, type: "vehicle_failure", severity: "high" });
  const { task } = assignMaintenance(store, { incidentId: recorded.id, now: T0 });
  startMaintenanceTask(store, { taskId: task.id, now: T0 });
  store.update((draft) => { draft.hubs.find((item) => item.id === METRO).occupiedParking = 8; });
  assert.equal(completeMaintenanceTask(store, { taskId: task.id, now: T0 }).code, "repair_hub_full");
  assert.equal(store.getState().maintenanceTasks[0].status, MaintenanceTaskStatus.IN_PROGRESS);
  store.update((draft) => { draft.hubs.find((item) => item.id === METRO).occupiedParking = 3; });
  assert.equal(completeMaintenanceTask(store, { taskId: task.id, now: T0 }).code, "vehicle_repaired");
  assert.equal(hub(store, METRO).occupiedParking, 4, "the repaired vehicle is parked again");
});
