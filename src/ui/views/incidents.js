// Operator portal — UC-15 Handle Operational Incident (OperatorDashboardUI: selectIncident,
// displayIncidentDetails, classifyIncident, assignMaintenance, chooseOperationalAction).
// The steps follow the Submission #2 activity diagram: confirm and classify, then either assign a
// technical repair to the Maintenance Staff or apply an operational action.
import { MAINTENANCE_STAFF_ID } from "../../domain/actors.js";
import { IncidentSeverity, IncidentStatus } from "../../domain/status.js";
import { INCIDENT_TYPES } from "../../services/operatorService.js";
import { $, actionButton, badge, detailList, emptyState, escapeHtml, setHtml, setOptions, statusBadge } from "../dom.js";
import { formatDateTime, statusLabel, t } from "../i18n.js";

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;

function renderRecordForm(state, lang) {
  const busy = new Set(state.incidents.filter((item) => item.status !== IncidentStatus.RESOLVED).map((item) => item.resourceId));
  const vehicles = state.vehicles.filter((vehicle) => !busy.has(vehicle.id));
  setOptions("#incident-vehicle", vehicles.map((vehicle) => ({
    value: vehicle.id,
    label: `${vehicle.id} · ${hubName(state, vehicle.hubId)} · ${statusLabel(lang, vehicle.status)}`,
  })), vehicles.length === 0 ? t(lang, "incident.noneAvailable") : null);
  const points = state.chargingPoints.filter((point) => !busy.has(point.id));
  setOptions("#incident-charging-point", points.map((point) => ({
    value: point.id,
    label: `${point.id} · ${hubName(state, point.hubId)} · ${statusLabel(lang, point.status)}`,
  })), points.length === 0 ? t(lang, "incident.noneAvailable") : null);
}

function renderKpis(state, lang) {
  setHtml("#incident-kpis", Object.values(IncidentStatus).map((status) => `<div class="kpi kpi-${escapeHtml(status)}" data-metric="incident-${escapeHtml(status)}">
    <span>${escapeHtml(statusLabel(lang, status))}</span><strong>${state.incidents.filter((item) => item.status === status).length}</strong></div>`).join(""));
}

function renderList(state, lang, selectedId) {
  const incidents = [...state.incidents].reverse();
  setHtml("#incident-list", incidents.length === 0
    ? emptyState(t(lang, "incident.none"))
    : `<ul class="list select-list">${incidents.map((incident) => `<li${incident.id === selectedId ? ' class="is-selected"' : ""}>
        <button type="button" class="list-button" data-action="select-incident" data-incident-id="${escapeHtml(incident.id)}">
          <span><span class="code">${escapeHtml(incident.id)}</span> <strong>${escapeHtml(incident.resourceId)}</strong>
          <span class="muted">· ${escapeHtml(hubName(state, incident.hubId))}</span></span>
          ${statusBadge(incident.status, statusLabel(lang, incident.status))}
        </button></li>`).join("")}</ul>`);
}

function classificationForm(lang, incident) {
  const types = INCIDENT_TYPES[incident.resourceType].map((type) => `<option value="${escapeHtml(type)}"${type === incident.type ? " selected" : ""}>${escapeHtml(t(lang, `incident.type.${type}`))}</option>`).join("");
  const severities = Object.values(IncidentSeverity).map((level) => `<option value="${escapeHtml(level)}"${level === incident.severity ? " selected" : ""}>${escapeHtml(t(lang, `severity.${level}`))}</option>`).join("");
  return `<h3>${escapeHtml(t(lang, "incident.step1"))}</h3>
    <div class="form-grid">
      <label class="field"><span>${escapeHtml(t(lang, "field.type"))}</span><select id="incident-type">${types}</select></label>
      <label class="field"><span>${escapeHtml(t(lang, "field.severity"))}</span><select id="incident-severity">${severities}</select></label>
    </div>
    <div class="button-row">${actionButton("classify-incident", t(lang, "action.classify"), { "incident-id": incident.id })}</div>`;
}

function handlingStep(lang, incident) {
  return `<h3>${escapeHtml(t(lang, "incident.step2"))}</h3>
    <div class="button-row">
      ${actionButton("assign-maintenance", t(lang, "action.assignMaintenance", { staffId: MAINTENANCE_STAFF_ID }), { "incident-id": incident.id })}
      ${actionButton("operational-action", t(lang, "action.operationalAction"), { "incident-id": incident.id }, "btn-secondary")}
    </div>`;
}

// OperatorDashboardUI.displayIncidentDetails + the actions allowed in the current status.
function displayIncidentDetails(state, lang, incident) {
  $("#incident-detail-status").innerHTML = incident ? statusBadge(incident.status, statusLabel(lang, incident.status)) : "";
  if (!incident) {
    setHtml("#incident-detail", emptyState(t(lang, "incident.selectHint")));
    return;
  }
  const task = state.maintenanceTasks.find((item) => item.id === incident.taskId);
  const details = detailList([
    [t(lang, "field.incident"), `<span class="code" data-incident-id="${escapeHtml(incident.id)}">${escapeHtml(incident.id)}</span>`],
    [t(lang, "field.resource"), `${escapeHtml(t(lang, `resourceType.${incident.resourceType}`))} <strong>${escapeHtml(incident.resourceId)}</strong>`],
    [t(lang, "field.hub"), escapeHtml(hubName(state, incident.hubId))],
    [t(lang, "field.type"), escapeHtml(t(lang, `incident.type.${incident.type}`))],
    [t(lang, "field.severity"), escapeHtml(t(lang, `severity.${incident.severity}`))],
    [t(lang, "field.source"), escapeHtml(t(lang, `source.${incident.source}`))],
    [t(lang, "field.assignee"), incident.assignedTo ? `<span class="code">${escapeHtml(incident.assignedTo)}</span>${task ? ` ${statusBadge(task.status, statusLabel(lang, task.status))}` : ""}` : "—"],
    [t(lang, "field.openedAt"), escapeHtml(formatDateTime(lang, incident.openedAt))],
    [t(lang, "field.resourceState"), incident.resourceUnavailable && incident.status !== IncidentStatus.RESOLVED
      ? badge(t(lang, "resource.outOfService"), "danger") : badge(t(lang, "resource.inService"), "success")],
    incident.status === IncidentStatus.RESOLVED ? [t(lang, "field.resolvedAt"), escapeHtml(formatDateTime(lang, incident.resolvedAt))] : null,
    incident.resolution ? [t(lang, "field.resolution"), escapeHtml(t(lang, `incident.resolution.${incident.resolution}`))] : null,
  ]);
  let actions = "";
  if (incident.status === IncidentStatus.NEW) {
    actions = incident.classified ? handlingStep(lang, incident) : classificationForm(lang, incident);
    if (!incident.resourceUnavailable) {
      actions += `<div class="button-row">${actionButton("mark-unavailable", t(lang, "action.markUnavailable"), { "incident-id": incident.id }, "btn-danger")}</div>`;
    }
  } else if (incident.status === IncidentStatus.RESOLVED) {
    actions = `<p class="notice notice-success">${escapeHtml(t(lang, "incident.resolved"))}</p>`;
  } else {
    actions = `<p class="notice">${escapeHtml(t(lang, "incident.tracking", { staffId: incident.assignedTo }))}</p>`;
  }
  setHtml("#incident-detail", details + actions);
}

export function renderIncidentsPage(state, lang, view) {
  renderRecordForm(state, lang);
  renderKpis(state, lang);
  const selected = state.incidents.find((item) => item.id === view.selectedIncidentId) ?? state.incidents.at(-1) ?? null;
  renderList(state, lang, selected?.id);
  displayIncidentDetails(state, lang, selected);
}
