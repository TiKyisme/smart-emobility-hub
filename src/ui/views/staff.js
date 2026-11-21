// Field staff — Execute Redistribution Task (Vehicle Dispatch Staff, FR-DIS-1..8) and
// Resolve Assigned Incident (Maintenance Staff, FR-MNT-1..6), actors of the Submission #1 diagram.
import { DISPATCH_STAFF_ID, MAINTENANCE_STAFF_ID } from "../../domain/actors.js";
import { DispatchOrderStatus, MaintenanceTaskStatus } from "../../domain/status.js";
import { $, actionButton, emptyState, escapeHtml, setHtml, statusBadge, table } from "../dom.js";
import { formatDateTime, statusLabel, t } from "../i18n.js";

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;

export function renderDispatchPage(state, lang) {
  const orders = state.dispatchOrders.filter((order) => order.staffId === DISPATCH_STAFF_ID && order.status !== DispatchOrderStatus.CANCELLED).reverse();
  const count = (status) => orders.filter((order) => order.status === status).length;
  $("#dispatch-staff-summary").textContent = t(lang, "dispatchStaff.summary", {
    assigned: count(DispatchOrderStatus.ASSIGNED), inProgress: count(DispatchOrderStatus.IN_PROGRESS),
  });
  setHtml("#dispatch-tasks", orders.length === 0
    ? emptyState(t(lang, "dispatchStaff.none"))
    : table([t(lang, "col.order"), t(lang, "col.vehicle"), t(lang, "col.route"), t(lang, "col.time"), t(lang, "col.status"), ""], orders.map((order) => {
      let action = "";
      if (order.status === DispatchOrderStatus.ASSIGNED) action = actionButton("start-dispatch", t(lang, "action.startTask"), { "order-id": order.id }, "btn-sm");
      if (order.status === DispatchOrderStatus.IN_PROGRESS) action = actionButton("complete-dispatch", t(lang, "action.completeTask"), { "order-id": order.id }, "btn-sm");
      return `<tr data-order-id="${escapeHtml(order.id)}">
        <td class="code">${escapeHtml(order.id)}</td>
        <td><strong>${escapeHtml(order.vehicleId)}</strong></td>
        <td>${escapeHtml(`${hubName(state, order.fromHubId)} → ${hubName(state, order.toHubId)}`)}</td>
        <td class="num">${escapeHtml(formatDateTime(lang, order.completedAt ?? order.startedAt ?? order.createdAt))}</td>
        <td>${statusBadge(order.status, statusLabel(lang, order.status))}</td>
        <td class="actions">${action}</td>
      </tr>`;
    }).join("")));
}

export function renderMaintenancePage(state, lang) {
  const tasks = state.maintenanceTasks.filter((task) => task.staffId === MAINTENANCE_STAFF_ID).reverse();
  const count = (status) => tasks.filter((task) => task.status === status).length;
  $("#maintenance-summary").textContent = t(lang, "maintenance.summary", {
    assigned: count(MaintenanceTaskStatus.ASSIGNED), inProgress: count(MaintenanceTaskStatus.IN_PROGRESS),
  });
  setHtml("#maintenance-tasks", tasks.length === 0
    ? emptyState(t(lang, "maintenance.none"))
    : table([t(lang, "col.task"), t(lang, "col.incident"), t(lang, "col.resource"), t(lang, "col.hub"), t(lang, "col.severity"), t(lang, "col.status"), ""], tasks.map((task) => {
      const incident = state.incidents.find((item) => item.id === task.incidentId);
      let action = "";
      if (task.status === MaintenanceTaskStatus.ASSIGNED) action = actionButton("start-maintenance", t(lang, "action.startRepair"), { "task-id": task.id }, "btn-sm");
      if (task.status === MaintenanceTaskStatus.IN_PROGRESS) action = actionButton("complete-maintenance", t(lang, "action.completeRepair"), { "task-id": task.id }, "btn-sm");
      return `<tr data-task-id="${escapeHtml(task.id)}">
        <td class="code">${escapeHtml(task.id)}</td>
        <td class="code">${escapeHtml(task.incidentId)}</td>
        <td>${escapeHtml(t(lang, `resourceType.${incident.resourceType}`))} <strong>${escapeHtml(incident.resourceId)}</strong><br><span class="muted">${escapeHtml(t(lang, `incident.type.${incident.type}`))}</span></td>
        <td>${escapeHtml(hubName(state, incident.hubId))}</td>
        <td>${escapeHtml(t(lang, `severity.${incident.severity}`))}</td>
        <td>${statusBadge(task.status, statusLabel(lang, task.status))}</td>
        <td class="actions">${action}</td>
      </tr>`;
    }).join("")));
}
