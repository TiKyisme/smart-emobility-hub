// Operator portal — Monitor Network Status (UC-11..UC-13), Manage Smart Charging (UC-16) and
// Redistribute Vehicles (UC-14) on the OperatorDashboardUI.
import { DISPATCH_STAFF_ID } from "../../domain/actors.js";
import { ChargingPointStatus, ChargingRequestStatus, DispatchOrderStatus } from "../../domain/status.js";
import { buildChargingSchedule, getChargingPorts, listChargeableVehicles } from "../../services/chargingService.js";
import { getThresholds, listHubSummaries } from "../../services/hubService.js";
import {
  detectCapacityRisks,
  getNetworkMetrics,
  identifyBottlenecks,
  listMovableVehicles,
  planRedistribution,
} from "../../services/operatorService.js";
import {
  $,
  actionButton,
  badge,
  batteryCell,
  emptyState,
  escapeHtml,
  meter,
  setHtml,
  setInputValue,
  setOptions,
  statusBadge,
  table,
} from "../dom.js";
import { describe, formatClock, formatDate, formatDateTime, statusLabel, t } from "../i18n.js";

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;

/* ---------- Monitor Network Status ---------- */

// OperatorDashboardUI.renderDashboard: KPIs, alerts at the configured thresholds, Hubs, fleet.
export function renderDashboard(state, lang) {
  const metrics = getNetworkMetrics(state);
  setHtml("#operator-metrics", [
    ["hubs", "kpi.hubs", metrics.hubs],
    ["vehicles", "kpi.vehicles", `${metrics.availableVehicles}/${metrics.vehicles}`],
    ["points", "kpi.points", `${metrics.availableChargingPoints}/${metrics.chargingPoints}`],
    ["incidents", "kpi.incidents", metrics.openIncidents],
    ["queue", "kpi.queue", metrics.waitingCharging],
    ["dispatch", "kpi.dispatch", metrics.activeDispatch],
  ].map(([id, key, value]) => `<div class="kpi" data-metric="${id}"><span>${escapeHtml(t(lang, key))}</span><strong>${escapeHtml(value)}</strong></div>`).join(""));

  const thresholds = getThresholds(state);
  setInputValue("#threshold-overload", thresholds.overloadPercent);
  setInputValue("#threshold-shortage", thresholds.shortageVehicles);
  const alerts = identifyBottlenecks(state);
  setHtml("#alert-list", alerts.length === 0
    ? emptyState(t(lang, "alerts.none"))
    : `<ul class="list">${alerts.map((alert) => `<li data-alert="${escapeHtml(alert.type)}" data-hub-id="${escapeHtml(alert.hubId)}">
        <span>${badge(t(lang, `alert.${alert.type}Tag`), alert.type === "overload" ? "danger" : "warning")} ${escapeHtml(t(lang, `alert.${alert.type}`, alert))}</span></li>`).join("")}</ul>`);

  setHtml("#network-table", table(
    [t(lang, "col.hub"), t(lang, "col.parking"), t(lang, "col.vehiclesAvailable"), t(lang, "col.freeChargers"), t(lang, "col.risk"), t(lang, "col.alerts")],
    detectCapacityRisks(state).map((hub) => `<tr data-hub-id="${escapeHtml(hub.id)}">
      <td><strong>${escapeHtml(hub.name)}</strong> <span class="code">${escapeHtml(hub.id)}</span></td>
      <td><span class="usage">${meter(hub.utilization, hub.overloaded ? "danger" : "accent")}<span class="num">${hub.usedParking}/${hub.parkingCapacity}</span><span class="muted">${escapeHtml(t(lang, "network.held", { held: hub.reservedParking }))}</span></span></td>
      <td class="num">${hub.availableVehicles}</td>
      <td class="num">${hub.availableChargingPoints}/${hub.totalChargingPoints}</td>
      <td class="num">${hub.utilizationPercent}%</td>
      <td>${[hub.overloaded ? badge(t(lang, "alert.overloadTag"), "danger") : "", hub.shortage ? badge(t(lang, "alert.shortageTag"), "warning") : ""].join(" ")}</td>
    </tr>`).join(""),
  ));

  setHtml("#fleet-table", table([t(lang, "col.vehicle"), t(lang, "col.type"), t(lang, "col.hub"), t(lang, "col.battery"), t(lang, "col.status")],
    state.vehicles.map((vehicle) => `<tr data-vehicle-id="${escapeHtml(vehicle.id)}">
      <td><strong>${escapeHtml(vehicle.id)}</strong></td>
      <td>${escapeHtml(t(lang, `vtype.${vehicle.type}`))}</td>
      <td>${escapeHtml(hubName(state, vehicle.hubId))}</td>
      <td>${batteryCell(vehicle.battery)}</td>
      <td>${statusBadge(vehicle.status, statusLabel(lang, vehicle.status))}</td>
    </tr>`).join("")));
}

/* ---------- Manage Smart Charging ---------- */

const slotText = (lang, request) => `${formatClock(lang, request.slotStart)}–${formatClock(lang, request.slotEnd)} ${formatDate(lang, request.slotStart)}`;

function scheduleRow(lang, request, stateBadge, { current = false, actions = true } = {}) {
  const buttons = actions
    ? `${actionButton("reschedule-charging", t(lang, "action.reschedule"), { "request-id": request.id }, "btn-sm btn-secondary")}
       ${actionButton("operator-cancel-charging", t(lang, "action.cancel"), { "request-id": request.id }, "btn-sm btn-secondary")}`
    : "";
  return `<tr data-request-id="${escapeHtml(request.id)}"${request.overbooked ? ' class="changed"' : ""}>
    <td class="num">${escapeHtml(slotText(lang, request))}${current ? `<span class="tag">${escapeHtml(t(lang, "tag.current"))}</span>` : ""}</td>
    <td><strong>${escapeHtml(request.vehicleLabel)}</strong>${request.priority ? `<span class="tag">${escapeHtml(t(lang, "tag.priority"))}</span>` : ""}</td>
    <td>${escapeHtml(t(lang, `source.${request.source}`))}</td>
    <td class="num">${escapeHtml(request.battery)}%</td>
    <td class="num">${escapeHtml(request.priorityScore)}</td>
    <td>${stateBadge}</td>
    <td class="actions">${buttons}</td>
  </tr>`;
}

export function renderChargingPage(state, lang) {
  setOptions("#charging-hub", state.hubs.map((hub) => ({
    value: hub.id,
    label: t(lang, "ev.hubOption", { hubName: hub.name, ports: getChargingPorts(state, hub.id).length }),
  })));
  const hubId = $("#charging-hub").value;
  const schedule = buildChargingSchedule(state, hubId);
  const ports = getChargingPorts(state, hubId);
  const booked = schedule.upcoming.reduce((total, slot) => total + slot.bookings.length, 0);
  $("#charging-summary").textContent = t(lang, "charging.summary", {
    charging: schedule.charging.length,
    waiting: schedule.waiting.length + schedule.blocked.length,
    scheduled: booked,
    down: ports.filter((point) => point.status === ChargingPointStatus.UNAVAILABLE).length,
  });

  setHtml("#points-table", table([t(lang, "col.point"), t(lang, "col.status"), t(lang, "col.session"), ""], ports.map((point) => {
    const session = schedule.charging.find((item) => item.chargingPointId === point.id);
    let sessionText = "—";
    if (session) {
      sessionText = `<strong>${escapeHtml(session.vehicleLabel)}</strong> <span class="muted">${escapeHtml(session.battery)}% · ${escapeHtml(t(lang, "trip.until", { time: formatClock(lang, session.slotEnd) }))}</span>`;
    }
    else if (point.simulatedOccupancy) sessionText = `<span class="muted">${escapeHtml(t(lang, "points.simulated"))}</span>`;
    return `<tr data-point-id="${escapeHtml(point.id)}">
      <td><strong>${escapeHtml(point.id)}</strong></td>
      <td>${statusBadge(point.status, statusLabel(lang, point.status === ChargingPointStatus.OCCUPIED && session ? "charging" : point.status))}</td>
      <td>${sessionText}</td>
      <td class="actions">${session ? actionButton("finish-charging", t(lang, "action.finish"), { "point-id": point.id }, "btn-sm") : ""}</td>
    </tr>`;
  }).join("")));

  const vehicles = listChargeableVehicles(state, hubId);
  setOptions("#charging-vehicle", vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.id} · ${vehicle.battery}%` })),
    vehicles.length === 0 ? t(lang, "charging.noVehicle") : null);
  $("#submit-charging").disabled = vehicles.length === 0;
  $("#charging-hint").textContent = t(lang, vehicles.length === 0 ? "charging.hintNone" : "charging.hint");

  const { QUEUED } = ChargingRequestStatus;
  const rows = [
    ...schedule.charging.map((request) => scheduleRow(lang, request, statusBadge("charging", t(lang, "request.charging", { pointId: request.chargingPointId })), { current: true, actions: false })),
    ...schedule.waiting.map((request, index) => scheduleRow(lang, request, statusBadge(QUEUED, t(lang, "request.waiting", { position: index + 1 })), { current: true })),
    ...schedule.blocked.map((request) => scheduleRow(lang, request, statusBadge("reserved", t(lang, "request.onHold", { reason: t(lang, `blocked.${request.blockedReason}`) })), { current: true })),
    ...schedule.upcoming.flatMap((slot) => slot.bookings.map((request) => scheduleRow(lang, request,
      `${statusBadge("scheduled", statusLabel(lang, "scheduled"))}${request.overbooked ? ` ${badge(t(lang, "tag.overbooked"), "danger")}` : ""}`))),
  ];
  setHtml("#charging-schedule", rows.length === 0
    ? emptyState(t(lang, "schedule.empty"))
    : table([t(lang, "col.slot"), t(lang, "col.label"), t(lang, "col.source"), t(lang, "col.battery"), t(lang, "col.priority"), t(lang, "col.state"), ""], rows.join("")));
}

/* ---------- Redistribute Vehicles ---------- */

export function renderRedistributionPage(state, lang) {
  const plan = planRedistribution(state);
  setHtml("#redistribution-plan", plan
    ? `<p class="route" data-plan-from="${escapeHtml(plan.fromHubId)}" data-plan-to="${escapeHtml(plan.toHubId)}"><strong>${escapeHtml(plan.params.fromHub)}</strong><span aria-hidden="true">→</span><strong>${escapeHtml(plan.params.toHub)}</strong></p>
       <p class="muted">${escapeHtml(describe(lang, plan))}</p>
       <div class="button-row">${actionButton("apply-plan", t(lang, "action.applyPlan"))}</div>`
    : emptyState(t(lang, "redistribution.none")));

  const summaries = listHubSummaries(state);
  setOptions("#dispatch-from", summaries.map((hub) => ({ value: hub.id, label: `${hub.name} · ${listMovableVehicles(state, hub.id).length}` })));
  const fromHubId = $("#dispatch-from").value;
  const movable = listMovableVehicles(state, fromHubId);
  setOptions("#dispatch-vehicle", movable.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.id} · ${vehicle.battery}%` })),
    movable.length === 0 ? t(lang, "dispatch.noVehicle") : null);
  setOptions("#dispatch-to", summaries.filter((hub) => hub.id !== fromHubId).map((hub) => ({
    value: hub.id,
    label: hub.parkingAvailable > 0 ? t(lang, "parking.hubOption", { hubName: hub.name, free: hub.parkingAvailable }) : t(lang, "trip.hubFull", { hubName: hub.name }),
  })));
  $("#create-dispatch").textContent = t(lang, "action.createDispatch", { staffId: DISPATCH_STAFF_ID });
  $("#create-dispatch").disabled = movable.length === 0;

  const orders = [...state.dispatchOrders].reverse();
  const active = orders.filter((order) => [DispatchOrderStatus.ASSIGNED, DispatchOrderStatus.IN_PROGRESS].includes(order.status)).length;
  $("#dispatch-summary").textContent = t(lang, "dispatch.summary", { active, done: orders.filter((order) => order.status === DispatchOrderStatus.COMPLETED).length });
  setHtml("#dispatch-orders", orders.length === 0
    ? emptyState(t(lang, "dispatch.none"))
    : table([t(lang, "col.order"), t(lang, "col.vehicle"), t(lang, "col.route"), t(lang, "col.staff"), t(lang, "col.time"), t(lang, "col.status"), ""],
      orders.map((order) => `<tr data-order-id="${escapeHtml(order.id)}">
        <td class="code">${escapeHtml(order.id)}</td>
        <td><strong>${escapeHtml(order.vehicleId)}</strong></td>
        <td>${escapeHtml(`${hubName(state, order.fromHubId)} → ${hubName(state, order.toHubId)}`)}</td>
        <td class="code">${escapeHtml(order.staffId)}</td>
        <td class="num">${escapeHtml(formatDateTime(lang, order.createdAt))}</td>
        <td>${statusBadge(order.status, statusLabel(lang, order.status))}</td>
        <td class="actions">${order.status === DispatchOrderStatus.ASSIGNED ? actionButton("cancel-dispatch", t(lang, "action.cancel"), { "order-id": order.id }, "btn-sm btn-secondary") : ""}</td>
      </tr>`).join("")));
}
