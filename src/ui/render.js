import { ChargingRequestStatus, ReservationStatus, VehicleStatus } from "../domain/status.js";
import { buildChargingSchedule, priorityScore } from "../services/chargingService.js";
import { findSuitableHubs, findSuitableVehicles, listHubSummaries } from "../services/hubService.js";
import { getCapacityRisks, getNetworkMetrics, suggestRedistribution } from "../services/operatorService.js";
import { getStudentReservations } from "../services/reservationService.js";
import { ScenarioType } from "../services/simulationService.js";
import { describe, formatDuration, formatTime, normalizeLanguage, statusLabel, t } from "./i18n.js";

// D-003: one fixed demo identity; authentication is out of scope.
export const DEMO_STUDENT_ID = "STUDENT-DEMO";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numberInput(id) {
  const value = Number(document.querySelector(`#${id}`)?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function setOptions(id, options, placeholder = null) {
  const select = document.querySelector(`#${id}`);
  if (!select) return;
  const previous = select.value;
  const html = placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : "";
  select.innerHTML = html + options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  if (options.some((option) => option.value === previous)) select.value = previous;
  else if (placeholder) select.value = "";
  else if (options[0]) select.value = options[0].value;
}

function statusBadge(lang, status) {
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(statusLabel(lang, status))}</span>`;
}

function hubName(state, hubId) {
  return state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;
}

function applyStaticText(lang) {
  document.documentElement.lang = lang;
  for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = t(lang, element.dataset.i18n);
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(lang, element.dataset.i18nAriaLabel));
  }
}

function blockedReasons(state) {
  const reasons = new Map();
  for (const hub of state.hubs) {
    for (const request of buildChargingSchedule(state, hub.id).blocked) reasons.set(request.id, request.blockedReason);
  }
  return reasons;
}

function renderHubCards(state, lang) {
  document.querySelector("#hub-grid").innerHTML = listHubSummaries(state).map((hub) => `
    <article class="card hub-card" data-hub-id="${escapeHtml(hub.id)}">
      <div class="card-title-row"><h3>${escapeHtml(hub.name)}</h3><span class="hub-code">${escapeHtml(hub.id)}</span></div>
      <p><strong>${escapeHtml(t(lang, "hub.parking"))}</strong> ${escapeHtml(t(lang, "hub.parkingLine", { occupied: hub.occupiedParking, capacity: hub.parkingCapacity, reserved: hub.reservedParking }))}</p>
      <p><strong>${escapeHtml(t(lang, "hub.vehicles"))}</strong> ${escapeHtml(t(lang, "hub.vehiclesLine", { n: hub.availableVehicles }))}</p>
      <p><strong>${escapeHtml(t(lang, "hub.charging"))}</strong> ${escapeHtml(t(lang, "hub.chargingLine", { n: hub.availableChargingPoints }))}</p>
      <div class="capacity-bar" aria-label="${escapeHtml(t(lang, "hub.utilizationAria", { hubName: hub.name }))}"><span style="width:${Math.min(100, Math.round((hub.usedParking / hub.parkingCapacity) * 100))}%"></span></div>
      <small>${escapeHtml(t(lang, "hub.allocatable", { n: hub.parkingAvailable }))}</small>
    </article>
  `).join("");
}

function renderSearch(state, lang) {
  const hubId = document.querySelector("#vehicle-search-hub")?.value ?? "";
  const chargingRequired = document.querySelector("#charging-required")?.checked ?? false;
  const suitableHubs = findSuitableHubs(state, { minimumParking: numberInput("minimum-parking"), chargingRequired });
  const suitableHubIds = new Set(suitableHubs.map((hub) => hub.id));
  const matches = findSuitableVehicles(state, { hubId: hubId || null, minimumBattery: numberInput("minimum-battery") })
    .filter((vehicle) => suitableHubIds.has(vehicle.hubId));

  const hubResult = suitableHubs.length === 0
    ? `<p class="empty-state">${escapeHtml(t(lang, "search.noHub"))}</p>`
    : `<div class="search-hubs"><strong>${escapeHtml(t(lang, "search.matchingHubs"))}</strong><span>${suitableHubs.map((hub) => escapeHtml(t(lang, "search.hubMatch", { hubName: hub.name, parking: hub.parkingAvailable, charging: hub.availableChargingPoints }))).join(" · ")}</span></div>`;
  const vehicleResult = matches.length === 0
    ? `<p class="empty-state">${escapeHtml(t(lang, "search.noVehicle"))}</p>`
    : matches.map((vehicle) => `
      <div class="result-row" data-vehicle-id="${escapeHtml(vehicle.id)}">
        <div><strong>${escapeHtml(vehicle.id)}</strong><span>${escapeHtml(t(lang, "search.vehicleLine", { hubName: hubName(state, vehicle.hubId), battery: vehicle.battery }))}</span></div>
        <button type="button" data-action="reserve-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">${escapeHtml(t(lang, "action.reserve"))}</button>
      </div>
    `).join("");
  document.querySelector("#search-results").innerHTML = hubResult + vehicleResult;
}

function renderReservationHold(lang, reservation) {
  if (!reservation) return `<span class="muted">${escapeHtml(t(lang, "vehicles.noReservation"))}</span>`;
  const expiry = reservation.expiresAt
    ? t(lang, "vehicles.holdExpiry", { time: formatTime(lang, reservation.expiresAt) })
    : t(lang, "vehicles.noExpiry");
  return `<div class="reservation-hold">${statusBadge(lang, reservation.status)}<small>${escapeHtml(expiry)}</small></div>`;
}

function renderVehicleRows(state, lang) {
  const tbody = document.querySelector("#vehicle-rows");
  // Keep each return destination the user picked; a re-render (timer, simulator) must not reset it.
  const chosenDestinations = new Map(
    [...tbody.querySelectorAll("select[data-vehicle-id]")].map((select) => [select.dataset.vehicleId, select.value]),
  );

  tbody.innerHTML = state.vehicles.map((vehicle) => {
    const reservations = state.reservations.filter((item) => item.vehicleId === vehicle.id);
    const latest = reservations.at(-1) ?? null;
    const own = reservations.filter((item) => item.studentId === DEMO_STUDENT_ID).at(-1);
    let action = `<span class="muted">${escapeHtml(t(lang, "vehicles.noAction"))}</span>`;
    if (vehicle.status === VehicleStatus.AVAILABLE) {
      action = `<button type="button" data-action="reserve-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">${escapeHtml(t(lang, "action.reserve"))}</button>`;
    } else if (vehicle.status === VehicleStatus.RESERVED && own?.status === ReservationStatus.ACTIVE) {
      action = `<button type="button" data-action="pickup-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">${escapeHtml(t(lang, "action.pickup"))}</button>`;
    } else if (vehicle.status === VehicleStatus.RESERVED) {
      action = `<span class="muted">${escapeHtml(t(lang, "vehicles.heldByOther"))}</span>`;
    } else if (vehicle.status === VehicleStatus.IN_USE && own?.status === ReservationStatus.IN_USE) {
      const chosen = chosenDestinations.get(vehicle.id) ?? vehicle.hubId;
      action = `
        <div class="inline-action">
          <select data-vehicle-id="${escapeHtml(vehicle.id)}" aria-label="${escapeHtml(t(lang, "vehicles.returnAria", { vehicleId: vehicle.id }))}">
            ${state.hubs.map((hub) => `<option value="${escapeHtml(hub.id)}"${hub.id === chosen ? " selected" : ""}>${escapeHtml(hub.name)}</option>`).join("")}
          </select>
          <button type="button" data-action="return-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">${escapeHtml(t(lang, "action.return"))}</button>
        </div>`;
    }

    return `<tr data-vehicle-id="${escapeHtml(vehicle.id)}">
      <td><strong>${escapeHtml(vehicle.id)}</strong>${vehicle.upcomingUsage ? `<small class="table-note">${escapeHtml(t(lang, "vehicles.upcoming"))}</small>` : ""}</td>
      <td>${escapeHtml(hubName(state, vehicle.hubId))}</td>
      <td><span class="battery-value battery-${vehicle.battery < 30 ? "low" : "ok"}">${vehicle.battery}%</span></td>
      <td>${statusBadge(lang, vehicle.status)}</td>
      <td>${renderReservationHold(lang, latest)}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");
}

function renderParking(state, lang) {
  const summaries = listHubSummaries(state);
  const selectedHub = document.querySelector("#parking-hub")?.value || state.hubs[0]?.id;
  const summary = summaries.find((hub) => hub.id === selectedHub) ?? summaries[0];
  const ownActive = getStudentReservations(state, DEMO_STUDENT_ID).parking
    .filter((item) => item.status === ReservationStatus.ACTIVE).length;
  document.querySelector("#parking-status").innerHTML = summary
    ? `<div class="state-line"><span>${escapeHtml(summary.name)}</span><strong>${escapeHtml(t(lang, "parking.available", { n: summary.parkingAvailable }))}</strong></div>
       <div class="state-line"><span>${escapeHtml(t(lang, "parking.physical"))}</span><span>${summary.occupiedParking}/${summary.parkingCapacity}</span></div>
       <div class="state-line"><span>${escapeHtml(t(lang, "parking.held"))}</span><span>${summary.reservedParking}</span></div>
       ${ownActive ? `<p class="helper">${escapeHtml(t(lang, "parking.mine", { n: ownActive }))}</p>` : ""}`
    : `<p class="empty-state">${escapeHtml(t(lang, "parking.noHub"))}</p>`;
}

function renderChargingForm(state, lang) {
  const selectedHub = document.querySelector("#charging-hub")?.value || state.hubs[0]?.id;
  const vehicles = state.vehicles.filter((vehicle) => vehicle.hubId === selectedHub && vehicle.status !== VehicleStatus.FAILED);
  setOptions(
    "charging-vehicle",
    vehicles.map((vehicle) => ({
      value: vehicle.id,
      label: t(lang, "charging.vehicleOption", { vehicleId: vehicle.id, battery: vehicle.battery, status: statusLabel(lang, vehicle.status) }),
    })),
    vehicles.length === 0 ? t(lang, "charging.noVehicle") : null,
  );

  const isPrivate = document.querySelector("#charging-type")?.value === "private";
  const batteryInput = document.querySelector("#charging-battery");
  batteryInput.disabled = !isPrivate;
  if (!isPrivate) {
    const vehicle = state.vehicles.find((item) => item.id === document.querySelector("#charging-vehicle").value);
    batteryInput.value = vehicle ? String(vehicle.battery) : "";
  }
  document.querySelector("#charging-battery-hint").textContent = t(lang, isPrivate ? "charging.batteryPrivate" : "charging.batteryFromVehicle");
  document.querySelector("#charging-vehicle-field").classList.toggle("hidden", isPrivate);
  document.querySelector("#private-vehicle-field").classList.toggle("hidden", !isPrivate);
  document.querySelector("#submit-charging").classList.toggle("hidden", isPrivate);
  document.querySelector("#schedule-private").classList.toggle("hidden", !isPrivate);
}

function renderChargingQueue(state, lang) {
  const element = document.querySelector("#charging-queue");
  const requests = [...state.chargingRequests].sort((a, b) => {
    if (a.status !== b.status) return a.status === ChargingRequestStatus.SCHEDULED ? -1 : 1;
    return priorityScore(b) - priorityScore(a);
  });
  if (requests.length === 0) {
    element.innerHTML = `<p class="empty-state">${escapeHtml(t(lang, "queue.empty"))}</p>`;
    return;
  }
  const blocked = blockedReasons(state);
  const queued = requests.filter((item) => item.status === ChargingRequestStatus.QUEUED).length;
  const scheduled = requests.filter((item) => item.status === ChargingRequestStatus.SCHEDULED).length;
  element.innerHTML = `<div class="queue-heading"><strong>${escapeHtml(t(lang, "queue.heading"))}</strong><span>${escapeHtml(t(lang, "queue.counts", { queued, scheduled }))}</span></div>` +
    requests.map((request) => {
      const details = [t(lang, "queue.line", { hubName: hubName(state, request.hubId), battery: request.battery ?? "—" })];
      if (request.upcomingUsage) details.push(t(lang, "queue.upcoming"));
      if (request.chargingPointId) details.push(t(lang, "queue.point", { pointId: request.chargingPointId }));
      const reason = blocked.get(request.id);
      if (reason) details.push(t(lang, "queue.onHold", { reason: t(lang, `blocked.${reason}`) }));
      return `
      <div class="queue-row${reason ? " blocked-row" : ""}" data-request-id="${escapeHtml(request.id)}">
        <div><strong>${escapeHtml(request.vehicleLabel)}</strong><span>${escapeHtml(details.join(" · "))}</span></div>
        <span>${statusBadge(lang, request.status)} <small>${escapeHtml(t(lang, "queue.priority", { score: priorityScore(request) }))}</small></span>
      </div>`;
    }).join("");
}

function renderScheduleRows(lang, schedule) {
  const detail = (request) => escapeHtml(t(lang, "schedule.rowDetail", { battery: request.battery ?? "—", score: request.priorityScore }));
  const scheduled = schedule.scheduled.map((request) => `<div class="queue-row"><div><span>${escapeHtml(request.vehicleLabel)}</span><small>${detail(request)}</small></div><span>${escapeHtml(request.status === ChargingRequestStatus.SCHEDULED ? t(lang, "schedule.assigned", { pointId: request.chargingPointId }) : t(lang, "schedule.plan", { pointId: request.chargingPointId ?? "—" }))}</span></div>`);
  const waiting = schedule.waiting.map((request) => `<div class="queue-row waiting-row"><div><span>${escapeHtml(request.vehicleLabel)}</span><small>${detail(request)}</small></div><span>${escapeHtml(t(lang, "schedule.waiting"))}</span></div>`);
  const blocked = schedule.blocked.map((request) => `<div class="queue-row waiting-row blocked-row"><div><span>${escapeHtml(request.vehicleLabel)}</span><small>${detail(request)}</small></div><span>${escapeHtml(t(lang, "schedule.onHold", { reason: t(lang, `blocked.${request.blockedReason}`) }))}</span></div>`);
  return [...scheduled, ...waiting, ...blocked].join("");
}

function renderOperator(state, lang) {
  const metrics = getNetworkMetrics(state);
  document.querySelector("#operator-metrics").innerHTML = [
    ["metrics.hubs", metrics.hubs],
    ["metrics.vehicles", `${metrics.availableVehicles}/${metrics.vehicles}`],
    ["metrics.points", `${metrics.availableChargingPoints}/${metrics.chargingPoints}`],
    ["metrics.incidents", metrics.openIncidents],
    ["metrics.queued", metrics.queuedChargingRequests],
  ].map(([key, value]) => `<div class="metric"><span>${escapeHtml(t(lang, key))}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

  document.querySelector("#operator-hub-rows").innerHTML = getCapacityRisks(state).map((hub, index) => `
    <tr data-hub-id="${escapeHtml(hub.id)}">
      <td><strong>${escapeHtml(hub.name)}</strong><small class="table-note">${escapeHtml(hub.id)}</small></td>
      <td>${escapeHtml(t(lang, "network.parkingLine", { used: hub.usedParking, capacity: hub.parkingCapacity, free: hub.parkingAvailable }))}</td>
      <td>${hub.availableVehicles}</td>
      <td>${hub.availableChargingPoints}</td>
      <td><span class="risk-pill ${hub.atCapacity ? "risk-critical" : "risk-monitor"}">${escapeHtml(t(lang, hub.atCapacity ? "network.atCapacity" : "network.monitor", { rank: index + 1 }))}</span></td>
    </tr>
  `).join("");

  const redistribution = suggestRedistribution(state);
  document.querySelector("#redistribution-panel").innerHTML = redistribution
    ? `<div><strong>${escapeHtml(t(lang, "redistribution.title"))}</strong><p>${escapeHtml(describe(lang, redistribution))} ${escapeHtml(t(lang, "redistribution.detail", { count: redistribution.vehicleCount }))}</p></div><button type="button" data-action="coordinate-redistribution">${escapeHtml(t(lang, "redistribution.action"))}</button>`
    : `<strong>${escapeHtml(t(lang, "redistribution.none"))}</strong>`;

  setOptions("incident-vehicle", state.vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.id} · ${statusLabel(lang, vehicle.status)}` })));
  setOptions("incident-charging-point", state.chargingPoints.map((point) => ({ value: point.id, label: `${point.id} · ${hubName(state, point.hubId)} · ${statusLabel(lang, point.status)}` })));

  const incidents = [...state.incidents].reverse();
  document.querySelector("#incident-list").innerHTML = incidents.length === 0
    ? `<p class="empty-state">${escapeHtml(t(lang, "incidents.empty"))}</p>`
    : incidents.map((incident) => `<div class="state-line"><span><strong>${escapeHtml(t(lang, `incident.${incident.type}`))}</strong> · ${escapeHtml(incident.resourceId)}</span>${statusBadge(lang, incident.status)}</div>`).join("");

  const schedules = state.hubs.map((hub) => ({ hub, schedule: buildChargingSchedule(state, hub.id) }));
  document.querySelector("#schedule-controls").innerHTML = schedules.map(({ hub, schedule }) => {
    const queued = state.chargingRequests.filter((request) => request.hubId === hub.id && request.status === ChargingRequestStatus.QUEUED).length;
    return `<div class="schedule-control"><span>${escapeHtml(hub.name)} <small>${escapeHtml(t(lang, "schedule.control", { free: schedule.capacity, queued }))}</small></span><button type="button" data-action="schedule-hub" data-hub-id="${escapeHtml(hub.id)}">${escapeHtml(t(lang, "schedule.apply"))}</button></div>`;
  }).join("");

  const scheduleMarkup = schedules
    .filter(({ schedule }) => schedule.scheduled.length + schedule.waiting.length + schedule.blocked.length > 0)
    .map(({ hub, schedule }) => `<div class="schedule-block" data-hub-id="${escapeHtml(hub.id)}"><strong>${escapeHtml(hub.name)}</strong>${renderScheduleRows(lang, schedule)}</div>`)
    .join("");
  document.querySelector("#operator-schedule").innerHTML = scheduleMarkup || `<p class="empty-state">${escapeHtml(t(lang, "schedule.empty"))}</p>`;
}

function renderSelectors(state, lang) {
  const hubOptions = state.hubs.map((hub) => ({ value: hub.id, label: hub.name }));
  setOptions("vehicle-search-hub", hubOptions, t(lang, "search.allHubs"));
  setOptions("parking-hub", hubOptions);
  setOptions("charging-hub", hubOptions);
  setOptions("scenario-hub", hubOptions);
  setOptions("scenario", Object.values(ScenarioType).map((value) => ({ value, label: t(lang, `scenario.${value}`) })));
  renderChargingForm(state, lang);
}

function renderHeader(state, lang, view) {
  document.querySelector("#toggle-mode").textContent = t(lang, state.interfaceMode === "light" ? "mode.toDark" : "mode.toLight");
  document.querySelector("#language-select").value = lang;
  const update = state.lastUpdate;
  document.querySelector("#last-update").textContent = `${describe(lang, update)} · ${formatTime(lang, update?.at)}`;
  document.querySelector("#toggle-auto-update").textContent = t(lang, view.autoUpdating ? "action.stopAuto" : "action.startAuto");
  document.querySelector("#demo-identity").textContent = t(lang, "student.identity", { studentId: DEMO_STUDENT_ID });
  if (view.holdDurationMs) {
    document.querySelector("#hold-duration").textContent = t(lang, view.customHoldDuration ? "vehicles.holdDemo" : "vehicles.holdDuration", {
      duration: formatDuration(lang, view.holdDurationMs),
    });
  }
}

function renderFeedback(lang, feedback) {
  const element = document.querySelector("#feedback");
  if (!feedback) {
    element.textContent = "";
    element.className = "feedback";
    return;
  }
  const text = feedback.result
    ? describe(lang, feedback.result) || t(lang, feedback.result.ok ? "feedback.ok" : "feedback.fail")
    : t(lang, feedback.key, feedback.params);
  element.textContent = text;
  element.className = `feedback ${feedback.ok ? "feedback-success" : "feedback-error"}`;
}

function renderSimulationOutput(lang, result) {
  const output = document.querySelector("#simulation-output");
  if (!result) {
    output.textContent = t(lang, "simulation.initial");
    return;
  }
  const { impact } = result;
  const none = t(lang, "common.none");
  const cell = (key, before, after) => `<div><span>${escapeHtml(t(lang, key))}</span><strong>${escapeHtml(before)} → ${escapeHtml(after)}</strong></div>`;
  output.innerHTML = `
    <div class="simulation-summary"><strong>${escapeHtml(t(lang, `scenario.${result.scenario.type}`))}</strong><span class="${result.liveStateUnchanged ? "success-label" : "danger-label"}" data-live-unchanged="${result.liveStateUnchanged}">${escapeHtml(t(lang, "simulation.liveUnchanged", { answer: t(lang, result.liveStateUnchanged ? "common.yes" : "common.no") }))}</span></div>
    <p>${result.notes.map((note) => escapeHtml(describe(lang, note))).join(" ")}</p>
    <div class="impact-grid">
      ${cell("impact.parking", impact.parking.occupiedBefore, impact.parking.occupiedAfter)}
      ${cell("impact.topRisk", impact.parking.topRiskBefore ?? none, impact.parking.topRiskAfter ?? none)}
      ${cell("impact.vehicles", impact.vehicles.availableBefore, impact.vehicles.availableAfter)}
      ${cell("impact.queue", impact.charging.queuedBefore, impact.charging.queuedAfter)}
      ${cell("impact.points", impact.charging.availablePointsBefore, impact.charging.availablePointsAfter)}
    </div>
    <div><strong>${escapeHtml(t(lang, "simulation.recommendations"))}</strong><ul>${result.recommendations.map((item) => `<li>${escapeHtml(describe(lang, item))}</li>`).join("")}</ul></div>
  `;
}

// `view` holds transient UI state owned by main.js (feedback, last What-if result, timers).
export function renderApp(state, view = {}) {
  const lang = normalizeLanguage(state.interfaceLanguage);
  document.documentElement.dataset.mode = state.interfaceMode;
  applyStaticText(lang);
  renderHeader(state, lang, view);
  renderSelectors(state, lang);
  renderHubCards(state, lang);
  renderSearch(state, lang);
  renderVehicleRows(state, lang);
  renderParking(state, lang);
  renderChargingQueue(state, lang);
  renderOperator(state, lang);
  renderFeedback(lang, view.feedback);
  renderSimulationOutput(lang, view.simulation);
}
