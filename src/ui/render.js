import { ChargingRequestStatus, ReservationStatus, VehicleStatus } from "../domain/status.js";
import { buildChargingSchedule } from "../services/chargingService.js";
import { findSuitableHubs, findSuitableVehicles, listHubSummaries } from "../services/hubService.js";
import { getCapacityRisks, getNetworkMetrics, suggestRedistribution } from "../services/operatorService.js";
import { getStudentReservations } from "../services/reservationService.js";
import { ScenarioLabels, ScenarioType } from "../services/simulationService.js";

const DEMO_STUDENT_ID = "STUDENT-DEMO";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function humanize(value) {
  return String(value ?? "").replaceAll("_", " ");
}

function formatTime(value) {
  if (!value) return "at startup";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatReservationExpiry(value) {
  if (!value) return "No expiry recorded";
  return new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function priorityScore(request) {
  return (request.upcomingUsage ? 1000 : 0) + (request.battery == null ? 0 : 100 - request.battery);
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

function statusBadge(status) {
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(humanize(status))}</span>`;
}

function latestVehicleReservation(state, vehicleId) {
  const reservations = state.reservations.filter((item) => item.vehicleId === vehicleId);
  return reservations[reservations.length - 1] ?? null;
}

function renderReservationHold(reservation) {
  if (!reservation) return `<span class="muted">No reservation</span>`;
  return `<div class="reservation-hold">${statusBadge(reservation.status)}<small>Hold expiry: ${escapeHtml(formatReservationExpiry(reservation.expiresAt))}</small></div>`;
}

function renderHubCards(state) {
  const hubGrid = document.querySelector("#hub-grid");
  const hubs = listHubSummaries(state);
  hubGrid.innerHTML = hubs.map((hub) => `
    <article class="card hub-card">
      <div class="card-title-row"><h3>${escapeHtml(hub.name)}</h3><span class="hub-code">${escapeHtml(hub.id)}</span></div>
      <p><strong>Parking</strong> ${hub.occupiedParking}/${hub.parkingCapacity} occupied · ${hub.reservedParking} reserved</p>
      <p><strong>Vehicles</strong> ${hub.availableVehicles} available</p>
      <p><strong>Charging</strong> ${hub.availableChargingPoints} points available</p>
      <div class="capacity-bar" aria-label="${escapeHtml(hub.name)} parking utilization"><span style="width:${Math.min(100, Math.round((hub.usedParking / hub.parkingCapacity) * 100))}%"></span></div>
      <small>${hub.parkingAvailable} parking spaces available for allocation</small>
    </article>
  `).join("");
}

function renderSearch(state) {
  const hubId = document.querySelector("#vehicle-search-hub")?.value ?? "";
  const minimumBattery = Number(document.querySelector("#minimum-battery")?.value ?? 0);
  const minimumParking = Number(document.querySelector("#minimum-parking")?.value ?? 0);
  const chargingRequired = document.querySelector("#charging-required")?.checked ?? false;
  const hubNames = new Map(state.hubs.map((hub) => [hub.id, hub.name]));
  const suitableHubs = findSuitableHubs(state, {
    minimumParking: Number.isFinite(minimumParking) ? minimumParking : 0,
    chargingRequired,
  });
  const suitableHubIds = new Set(suitableHubs.map((hub) => hub.id));
  const matches = findSuitableVehicles(state, { hubId: hubId || null, minimumBattery: Number.isFinite(minimumBattery) ? minimumBattery : 0 })
    .filter((vehicle) => suitableHubIds.has(vehicle.hubId));
  const results = document.querySelector("#search-results");

  const hubResult = suitableHubs.length === 0
    ? `<p class="empty-state">No Hub matches the parking and charging filters.</p>`
    : `<div class="search-hubs"><strong>Matching Hubs</strong><span>${suitableHubs.map((hub) => `${escapeHtml(hub.name)} · ${hub.parkingAvailable} parking · ${hub.availableChargingPoints} charging`).join(" · ")}</span></div>`;
  const vehicleResult = matches.length === 0
    ? `<p class="empty-state">No available vehicle matches the current filters.</p>`
    : matches.map((vehicle) => `
      <div class="result-row">
        <div><strong>${escapeHtml(vehicle.id)}</strong><span>${escapeHtml(hubNames.get(vehicle.hubId))} · ${vehicle.battery}% battery</span></div>
        <button type="button" data-action="reserve-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">Reserve</button>
      </div>
    `).join("");
  results.innerHTML = hubResult + vehicleResult;
}

function renderVehicleRows(state) {
  const hubOptions = state.hubs.map((hub) => ({ value: hub.id, label: hub.name }));
  const rows = state.vehicles.map((vehicle) => {
    const reservation = latestVehicleReservation(state, vehicle.id);
    const studentReservation = state.reservations
      .filter((item) => item.vehicleId === vehicle.id && item.studentId === DEMO_STUDENT_ID)
      .at(-1);
    let action = `<span class="muted">No action</span>`;
    if (vehicle.status === VehicleStatus.AVAILABLE) {
      action = `<button type="button" data-action="reserve-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">Reserve</button>`;
    } else if (vehicle.status === VehicleStatus.RESERVED && studentReservation?.status === ReservationStatus.ACTIVE) {
      action = `<button type="button" data-action="pickup-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">Pick up</button>`;
    } else if (vehicle.status === VehicleStatus.IN_USE && studentReservation?.status === ReservationStatus.IN_USE) {
      action = `
        <div class="inline-action">
          <select aria-label="Return destination for ${escapeHtml(vehicle.id)}">
            ${hubOptions.map((hub) => `<option value="${escapeHtml(hub.value)}">${escapeHtml(hub.label)}</option>`).join("")}
          </select>
          <button type="button" data-action="return-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">Return</button>
        </div>`;
    }

    return `<tr>
      <td><strong>${escapeHtml(vehicle.id)}</strong>${vehicle.upcomingUsage ? `<small class="table-note">Upcoming use</small>` : ""}</td>
      <td>${escapeHtml(state.hubs.find((hub) => hub.id === vehicle.hubId)?.name ?? vehicle.hubId)}</td>
      <td><span class="battery-value battery-${vehicle.battery < 30 ? "low" : "ok"}">${vehicle.battery}%</span></td>
      <td>${statusBadge(vehicle.status)}</td>
      <td>${renderReservationHold(reservation)}</td>
      <td>${action}</td>
    </tr>`;
  });
  document.querySelector("#vehicle-rows").innerHTML = rows.join("");
}

function renderParking(state) {
  const selectedHub = document.querySelector("#parking-hub")?.value || state.hubs[0]?.id;
  const summary = listHubSummaries(state).find((hub) => hub.id === selectedHub) ?? listHubSummaries(state)[0];
  const reservations = getStudentReservations(state, DEMO_STUDENT_ID).parking;
  document.querySelector("#parking-status").innerHTML = summary
    ? `<div class="state-line"><span>${escapeHtml(summary.name)}</span><strong>${summary.parkingAvailable} available</strong></div>
       <div class="state-line"><span>Physical occupancy</span><span>${summary.occupiedParking}/${summary.parkingCapacity}</span></div>
       <div class="state-line"><span>Active held spaces</span><span>${summary.reservedParking}</span></div>
       ${reservations.length ? `<p class="helper">Your active parking reservations: ${reservations.filter((item) => item.status === "active").length}</p>` : ""}`
    : `<p class="empty-state">No Hub selected.</p>`;
}

function renderChargingForm(state) {
  const selectedHub = document.querySelector("#charging-hub")?.value || state.hubs[0]?.id;
  const vehicles = state.vehicles.filter((vehicle) => vehicle.hubId === selectedHub && vehicle.status !== VehicleStatus.FAILED);
  setOptions("charging-vehicle", vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.id} · ${vehicle.battery}%` })));
}

function renderChargingQueue(state) {
  const requests = [...state.chargingRequests].sort((a, b) => {
    if (a.status !== b.status) return a.status === ChargingRequestStatus.SCHEDULED ? -1 : 1;
    return priorityScore(b) - priorityScore(a);
  });
  const element = document.querySelector("#charging-queue");
  if (requests.length === 0) {
    element.innerHTML = `<p class="empty-state">No charging requests yet. Submit one to demonstrate the queue.</p>`;
    return;
  }
  element.innerHTML = `<div class="queue-heading"><strong>Current charging queue</strong><span>${requests.filter((item) => item.status === "queued").length} queued · ${requests.filter((item) => item.status === "scheduled").length} scheduled</span></div>` +
    requests.map((request) => `
      <div class="queue-row">
        <div><strong>${escapeHtml(request.vehicleLabel)}</strong><span>${escapeHtml(state.hubs.find((hub) => hub.id === request.hubId)?.name ?? request.hubId)} · ${request.battery ?? "—"}% battery${request.upcomingUsage ? " · upcoming use" : ""}</span></div>
        <span>${statusBadge(request.status)} <small>priority ${priorityScore(request)}</small></span>
      </div>
    `).join("");
}

function renderOperator(state) {
  const metrics = getNetworkMetrics(state);
  document.querySelector("#operator-metrics").innerHTML = [
    ["Hubs monitored", metrics.hubs],
    ["Vehicles available", `${metrics.availableVehicles}/${metrics.vehicles}`],
    ["Charging points available", `${metrics.availableChargingPoints}/${metrics.chargingPoints}`],
    ["Open incidents", metrics.openIncidents],
    ["Queued charging", metrics.queuedChargingRequests],
  ].map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

  const risks = getCapacityRisks(state);
  document.querySelector("#operator-hub-rows").innerHTML = risks.map((hub, index) => `
    <tr>
      <td><strong>${escapeHtml(hub.name)}</strong><small class="table-note">${escapeHtml(hub.id)}</small></td>
      <td>${hub.usedParking}/${hub.parkingCapacity} used · ${hub.parkingAvailable} free</td>
      <td>${hub.availableVehicles}</td>
      <td>${hub.availableChargingPoints}</td>
      <td><span class="risk-pill ${hub.atCapacity ? "risk-critical" : "risk-monitor"}">#${index + 1} · ${hub.atCapacity ? "at capacity" : "monitor"}</span></td>
    </tr>
  `).join("");

  const redistribution = suggestRedistribution(state);
  document.querySelector("#redistribution-panel").innerHTML = redistribution
    ? `<div><strong>Vehicle redistribution recommendation</strong><p>${escapeHtml(redistribution.message)} Move up to ${redistribution.vehicleCount} vehicle${redistribution.vehicleCount === 1 ? "" : "s"} based on current capacity.</p></div><button type="button" data-action="coordinate-redistribution">Coordinate one vehicle</button>`
    : `<strong>No redistribution recommendation is available from the current state.</strong>`;

  setOptions("incident-vehicle", state.vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.id} · ${humanize(vehicle.status)}` })));
  setOptions("incident-charging-point", state.chargingPoints.map((point) => ({ value: point.id, label: `${point.id} · ${humanize(point.status)}` })));

  const incidents = [...state.incidents].reverse();
  document.querySelector("#incident-list").innerHTML = incidents.length === 0
    ? `<p class="empty-state">No operational incidents reported.</p>`
    : incidents.map((incident) => `<div class="state-line"><span><strong>${escapeHtml(humanize(incident.type))}</strong> · ${escapeHtml(incident.resourceId)}</span>${statusBadge(incident.status)}</div>`).join("");

  document.querySelector("#schedule-controls").innerHTML = state.hubs.map((hub) => {
    const schedule = buildChargingSchedule(state, hub.id);
    const queued = state.chargingRequests.filter((request) => request.hubId === hub.id && request.status === ChargingRequestStatus.QUEUED).length;
    return `<div class="schedule-control"><span>${escapeHtml(hub.name)} <small>${schedule.capacity} free point${schedule.capacity === 1 ? "" : "s"} · ${queued} queued</small></span><button type="button" data-action="schedule-hub" data-hub-id="${escapeHtml(hub.id)}">Apply schedule</button></div>`;
  }).join("");

  const scheduleMarkup = state.hubs.map((hub) => {
    const schedule = buildChargingSchedule(state, hub.id);
    if (schedule.scheduled.length === 0 && schedule.waiting.length === 0) return "";
    return `<div class="schedule-block"><strong>${escapeHtml(hub.name)}</strong>${schedule.scheduled.map((request) => `<div class="queue-row"><div><span>${escapeHtml(request.vehicleLabel)}</span><small>${request.battery ?? "—"}% battery${request.upcomingUsage ? " · upcoming use" : ""} · priority ${request.priorityScore}</small></div><span>${request.status === ChargingRequestStatus.SCHEDULED ? "Assigned" : `Plan ${escapeHtml(request.chargingPointId ?? "—")}`}</span></div>`).join("")}${schedule.waiting.map((request) => `<div class="queue-row waiting-row"><div><span>${escapeHtml(request.vehicleLabel)}</span><small>${request.battery ?? "—"}% battery · priority ${request.priorityScore}</small></div><span>Waiting</span></div>`).join("")}</div>`;
  }).join("");
  document.querySelector("#operator-schedule").innerHTML = scheduleMarkup || `<p class="empty-state">No charging requests to schedule.</p>`;
}

function renderSelectors(state) {
  const hubOptions = state.hubs.map((hub) => ({ value: hub.id, label: hub.name }));
  setOptions("vehicle-search-hub", hubOptions, "All Hubs");
  setOptions("parking-hub", hubOptions);
  setOptions("charging-hub", hubOptions);
  setOptions("scenario-hub", hubOptions);
  setOptions("scenario", Object.entries(ScenarioType).map(([key, value]) => ({ value, label: ScenarioLabels[value] ?? humanize(key) })));
  renderChargingForm(state);
}

function renderModeButton(state) {
  const modeButton = document.querySelector("#toggle-mode");
  modeButton.textContent = state.interfaceMode === "light" ? "Use dark mode" : "Use light mode";
}

export function renderApp(state) {
  document.documentElement.dataset.mode = state.interfaceMode;
  renderModeButton(state);
  renderSelectors(state);
  renderHubCards(state);
  renderSearch(state);
  renderVehicleRows(state);
  renderParking(state);
  renderChargingQueue(state);
  renderOperator(state);

  const update = state.lastUpdate;
  document.querySelector("#last-update").textContent = `${update?.message ?? "State ready."} · ${formatTime(update?.at)}`;

  const type = document.querySelector("#charging-type")?.value ?? "shared";
  document.querySelector("#charging-vehicle-field").classList.toggle("hidden", type === "private");
  document.querySelector("#private-vehicle-field").classList.toggle("hidden", type !== "private");
  document.querySelector("#submit-charging").classList.toggle("hidden", type === "private");
  document.querySelector("#schedule-private").classList.toggle("hidden", type !== "private");
}

export function renderSimulationResult(result) {
  const output = document.querySelector("#simulation-output");
  if (!result) {
    output.textContent = "Run a scenario to inspect impact and recommendations.";
    return;
  }
  const impact = result.impact;
  output.innerHTML = `
    <div class="simulation-summary"><strong>${escapeHtml(ScenarioLabels[result.scenario.type] ?? result.scenario.type)}</strong><span class="success-label">Live state unchanged: ${result.liveStateUnchanged ? "yes" : "no"}</span></div>
    <p>${result.notes.map((note) => escapeHtml(note)).join(" ")}</p>
    <div class="impact-grid">
      <div><span>Parking occupied</span><strong>${impact.parking.occupiedBefore} → ${impact.parking.occupiedAfter}</strong></div>
      <div><span>Top capacity risk</span><strong>${escapeHtml(impact.parking.topRiskBefore)} → ${escapeHtml(impact.parking.topRiskAfter)}</strong></div>
      <div><span>Available vehicles</span><strong>${impact.vehicles.availableBefore} → ${impact.vehicles.availableAfter}</strong></div>
      <div><span>Charging queue</span><strong>${impact.charging.queuedBefore} → ${impact.charging.queuedAfter}</strong></div>
      <div><span>Available charging points</span><strong>${impact.charging.availablePointsBefore} → ${impact.charging.availablePointsAfter}</strong></div>
    </div>
    <div><strong>Coordination recommendations</strong><ul>${result.recommendations.map((recommendation) => `<li>${escapeHtml(recommendation)}</li>`).join("")}</ul></div>
  `;
}

export { DEMO_STUDENT_ID };
