// Operator portal: FR-10..FR-18 (UC-11..UC-18).
import { ChargingPointStatus, ChargingRequestStatus, IncidentStatus, VehicleStatus } from "../../domain/status.js";
import { buildChargingSchedule } from "../../services/chargingService.js";
import { getCapacityRisks, getNetworkMetrics, suggestRedistribution } from "../../services/operatorService.js";
import { ScenarioType } from "../../services/simulationService.js";
import { badge, batteryCell, emptyState, escapeHtml, meter, setHtml, setOptions, statusBadge } from "../dom.js";
import { describe, formatTime, statusLabel, t } from "../i18n.js";

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;

function table(lang, headers, rows) {
  return `<table class="table"><thead><tr>${headers.map((key) => `<th>${key ? escapeHtml(t(lang, key)) : ""}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderNetworkPage(state, lang) {
  const metrics = getNetworkMetrics(state);
  setHtml("#operator-metrics", [
    ["hubs", "kpi.hubs", metrics.hubs],
    ["vehicles", "kpi.vehicles", `${metrics.availableVehicles}/${metrics.vehicles}`],
    ["points", "kpi.points", `${metrics.availableChargingPoints}/${metrics.chargingPoints}`],
    ["incidents", "kpi.incidents", metrics.openIncidents],
    ["queue", "kpi.queue", metrics.queuedChargingRequests],
  ].map(([id, key, value]) => `<div class="kpi" data-metric="${id}"><span>${escapeHtml(t(lang, key))}</span><strong>${escapeHtml(value)}</strong></div>`).join(""));

  setHtml("#network-table", table(lang, ["col.hub", "col.parking", "col.vehiclesAvailable", "col.freeChargers", "col.risk"],
    getCapacityRisks(state).map((hub, index) => {
      const percent = Math.round(hub.utilization * 100);
      const risk = hub.atCapacity
        ? badge(t(lang, "risk.full", { rank: index + 1 }), "danger")
        : `<span class="muted">#${index + 1}</span>`;
      return `<tr data-hub-id="${escapeHtml(hub.id)}">
        <td><strong>${escapeHtml(hub.name)}</strong> <span class="code">${escapeHtml(hub.id)}</span></td>
        <td><span class="usage">${meter(hub.utilization, hub.atCapacity ? "danger" : "accent")}<span class="num">${hub.usedParking}/${hub.parkingCapacity}</span><span class="muted">${escapeHtml(t(lang, "network.held", { held: hub.reservedParking }))}</span></span></td>
        <td class="num">${hub.availableVehicles}</td>
        <td class="num">${hub.availableChargingPoints}</td>
        <td><span class="risk"><span class="num">${percent}%</span>${risk}</span></td>
      </tr>`;
    }).join("")));

  const suggestion = suggestRedistribution(state);
  setHtml("#redistribution-panel", suggestion
    ? `<p class="route"><strong>${escapeHtml(suggestion.params.fromHub)}</strong><span aria-hidden="true">→</span><strong>${escapeHtml(suggestion.params.toHub)}</strong></p>
       <p class="muted">${escapeHtml(t(lang, "redistribution.detail", { count: suggestion.vehicleCount }))}</p>
       <button type="button" class="btn" data-action="coordinate-redistribution">${escapeHtml(t(lang, "action.coordinate"))}</button>`
    : emptyState(t(lang, "redistribution.none")));

  setHtml("#fleet-table", table(lang, ["col.vehicle", "col.hub", "col.battery", "col.status"],
    state.vehicles.map((vehicle) => `<tr data-vehicle-id="${escapeHtml(vehicle.id)}">
      <td><strong>${escapeHtml(vehicle.id)}</strong></td>
      <td>${escapeHtml(hubName(state, vehicle.hubId))}</td>
      <td>${batteryCell(vehicle.battery)}</td>
      <td>${statusBadge(vehicle.status, statusLabel(lang, vehicle.status))}</td>
    </tr>`).join("")));
}

export function renderChargingPage(state, lang) {
  setHtml("#points-table", table(lang, ["col.point", "col.hub", "col.status", "col.session", ""],
    state.chargingPoints.map((point) => {
      const session = state.chargingRequests.find(
        (item) => item.status === ChargingRequestStatus.SCHEDULED && item.chargingPointId === point.id,
      );
      let sessionText = "—";
      if (session) sessionText = `<strong>${escapeHtml(session.vehicleLabel)}</strong> <span class="muted">${escapeHtml(session.battery)}%</span>`;
      else if (point.simulatedOccupancy) sessionText = `<span class="muted">${escapeHtml(t(lang, "points.simulated"))}</span>`;
      const action = session
        ? `<button type="button" class="btn btn-sm" data-action="finish-charging" data-point-id="${escapeHtml(point.id)}">${escapeHtml(t(lang, "action.finish"))}</button>`
        : "";
      return `<tr data-point-id="${escapeHtml(point.id)}">
        <td><strong>${escapeHtml(point.id)}</strong></td>
        <td>${escapeHtml(hubName(state, point.hubId))}</td>
        <td>${statusBadge(point.status, statusLabel(lang, point.status === ChargingPointStatus.OCCUPIED && session ? "charging" : point.status))}</td>
        <td>${sessionText}</td>
        <td class="actions">${action}</td>
      </tr>`;
    }).join("")));

  const rows = state.hubs.flatMap((hub) => {
    const schedule = buildChargingSchedule(state, hub.id);
    return [
      ...schedule.waiting.map((request, index) => ({ request, hub, state: badge(t(lang, "queue.waiting", { position: index + 1 }), "neutral") })),
      ...schedule.blocked.map((request) => ({ request, hub, state: badge(t(lang, "request.onHold", { reason: t(lang, `blocked.${request.blockedReason}`) }), "warning") })),
    ];
  });
  setHtml("#charging-queue", rows.length === 0
    ? emptyState(t(lang, "queue.empty"))
    : table(lang, ["col.request", "col.hub", "col.battery", "col.priority", "col.state"], rows.map(({ request, hub, state: badgeHtml }) => `<tr data-request-id="${escapeHtml(request.id)}">
        <td><strong>${escapeHtml(request.vehicleLabel)}</strong>${request.upcomingUsage ? `<span class="tag">${escapeHtml(t(lang, "vehicle.upcoming"))}</span>` : ""}</td>
        <td>${escapeHtml(hub.name)}</td>
        <td class="num">${escapeHtml(request.battery)}%</td>
        <td class="num">${escapeHtml(request.priorityScore)}</td>
        <td>${badgeHtml}</td>
      </tr>`).join("")));
}

export function renderIncidentsPage(state, lang) {
  const vehicles = state.vehicles.filter((vehicle) => vehicle.status !== VehicleStatus.FAILED);
  setOptions("#incident-vehicle", vehicles.map((vehicle) => ({
    value: vehicle.id,
    label: `${vehicle.id} · ${hubName(state, vehicle.hubId)} · ${statusLabel(lang, vehicle.status)}`,
  })), vehicles.length === 0 ? t(lang, "incident.noneAvailable") : null);
  const points = state.chargingPoints.filter((point) => point.status !== ChargingPointStatus.UNAVAILABLE);
  setOptions("#incident-charging-point", points.map((point) => ({
    value: point.id,
    label: `${point.id} · ${hubName(state, point.hubId)} · ${statusLabel(lang, point.status)}`,
  })), points.length === 0 ? t(lang, "incident.noneAvailable") : null);

  const open = state.incidents.filter((item) => item.status === IncidentStatus.OPEN).length;
  document.querySelector("#incident-summary").textContent = t(lang, "incident.summary", { open, resolved: state.incidents.length - open });

  const incidents = [...state.incidents].reverse();
  setHtml("#incident-list", incidents.length === 0
    ? emptyState(t(lang, "incident.none"))
    : `<ul class="list incident-list">${incidents.map((incident) => {
      const isOpen = incident.status === IncidentStatus.OPEN;
      const resolveKey = incident.type === "vehicle_failure" ? "action.markRepaired" : "action.restorePoint";
      const when = isOpen
        ? t(lang, "incident.opened", { time: formatTime(lang, incident.openedAt) })
        : t(lang, "incident.resolvedAt", { time: formatTime(lang, incident.resolvedAt) });
      return `<li data-incident-id="${escapeHtml(incident.id)}">
        <div><span class="code">${escapeHtml(incident.id)}</span> <strong>${escapeHtml(t(lang, `incident.${incident.type}`))}</strong> · ${escapeHtml(incident.resourceId)} <span class="muted">· ${escapeHtml(hubName(state, incident.hubId))} · ${escapeHtml(when)}</span></div>
        <div class="list-actions">${statusBadge(incident.status, statusLabel(lang, incident.status))}${isOpen ? `<button type="button" class="btn btn-sm" data-action="resolve-incident" data-incident-id="${escapeHtml(incident.id)}">${escapeHtml(t(lang, resolveKey))}</button>` : ""}</div>
      </li>`;
    }).join("")}</ul>`);
}

export function renderWhatIfPage(state, lang, view) {
  setOptions("#scenario", Object.values(ScenarioType).map((value) => ({ value, label: t(lang, `scenario.${value}`) })));
  const result = view.simulation;
  if (!result) {
    setHtml("#simulation-output", emptyState(t(lang, "whatif.empty")));
    return;
  }
  const { impact } = result;
  const none = t(lang, "common.none");
  const row = (key, before, after) => `<tr${String(before) === String(after) ? "" : ` class="changed"`}><td>${escapeHtml(t(lang, key))}</td><td class="num">${escapeHtml(before)}</td><td class="num">${escapeHtml(after)}</td></tr>`;
  setHtml("#simulation-output", `<article class="card">
    <header class="card-header"><h2>${escapeHtml(t(lang, `scenario.${result.scenario.type}`))}</h2>
      ${result.liveStateUnchanged ? badge(t(lang, "whatif.liveUnchanged"), "success") : badge(t(lang, "whatif.liveChanged"), "danger")}</header>
    <div class="card-body">
      <p class="muted">${result.notes.map((note) => escapeHtml(describe(lang, note))).join(" ")}</p>
      <div class="split">
        <table class="table"><thead><tr><th>${escapeHtml(t(lang, "col.metric"))}</th><th>${escapeHtml(t(lang, "col.before"))}</th><th>${escapeHtml(t(lang, "col.after"))}</th></tr></thead><tbody>
          ${row("impact.parking", impact.parking.occupiedBefore, impact.parking.occupiedAfter)}
          ${row("impact.topRisk", impact.parking.topRiskBefore ?? none, impact.parking.topRiskAfter ?? none)}
          ${row("impact.vehicles", impact.vehicles.availableBefore, impact.vehicles.availableAfter)}
          ${row("impact.queue", impact.charging.queuedBefore, impact.charging.queuedAfter)}
          ${row("impact.points", impact.charging.availablePointsBefore, impact.charging.availablePointsAfter)}
        </tbody></table>
        <div><h3>${escapeHtml(t(lang, "whatif.recommendations"))}</h3><ol class="recommendations">${result.recommendations.map((item) => `<li>${escapeHtml(describe(lang, item))}</li>`).join("")}</ol></div>
      </div>
    </div>
  </article>`);
}
