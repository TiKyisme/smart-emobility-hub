// Student portal: FR-01..FR-09 (UC-01..UC-09).
import { ChargingRequestStatus, ReservationStatus, VehicleStatus } from "../../domain/status.js";
import { buildChargingSchedule, listChargeableVehicles } from "../../services/chargingService.js";
import { findSuitableHubs, findSuitableVehicles, listHubSummaries } from "../../services/hubService.js";
import { getActiveTrip, getStudentReservations } from "../../services/reservationService.js";
import {
  $,
  batteryCell,
  DEMO_STUDENT_ID,
  emptyState,
  escapeHtml,
  meter,
  numberValue,
  setHtml,
  setOptions,
  statusBadge,
} from "../dom.js";
import { formatDuration, formatTime, statusLabel, t } from "../i18n.js";

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;

function readFilters() {
  return {
    hubId: $("#vehicle-search-hub").value || null,
    minimumBattery: numberValue("#minimum-battery"),
    onlyAvailable: $("#only-available").checked,
    chargingRequired: $("#charging-required").checked,
    parkingRequired: $("#parking-required").checked,
  };
}

function renderHubTiles(state, lang, matchingHubIds) {
  setHtml("#hub-tiles", listHubSummaries(state).map((hub) => {
    const ratio = hub.parkingCapacity ? hub.usedParking / hub.parkingCapacity : 0;
    const tone = hub.parkingAvailable <= 0 ? "danger" : "accent";
    return `<article class="tile${matchingHubIds.has(hub.id) ? "" : " is-dimmed"}" data-hub-id="${escapeHtml(hub.id)}">
      <header><strong>${escapeHtml(hub.name)}</strong><span class="code">${escapeHtml(hub.id)}</span></header>
      ${meter(ratio, tone)}
      <dl>
        <div><dt>${escapeHtml(t(lang, "tile.parking"))}</dt><dd>${hub.usedParking}/${hub.parkingCapacity}</dd></div>
        <div><dt>${escapeHtml(t(lang, "tile.vehicles"))}</dt><dd>${hub.availableVehicles}</dd></div>
        <div><dt>${escapeHtml(t(lang, "tile.chargers"))}</dt><dd>${hub.availableChargingPoints}</dd></div>
      </dl>
    </article>`;
  }).join(""));
}

function renderVehicleResults(state, lang, filters, matchingHubIds, hasTrip) {
  const vehicles = findSuitableVehicles(state, {
    hubId: filters.hubId,
    minimumBattery: filters.minimumBattery,
    includeUnavailable: !filters.onlyAvailable,
  })
    .filter((vehicle) => matchingHubIds.has(vehicle.hubId))
    .sort((a, b) => Number(b.status === VehicleStatus.AVAILABLE) - Number(a.status === VehicleStatus.AVAILABLE) || b.battery - a.battery);

  if (vehicles.length === 0) {
    setHtml("#search-results", emptyState(t(lang, "find.empty")));
    return;
  }
  const rows = vehicles.map((vehicle) => {
    const action = vehicle.status === VehicleStatus.AVAILABLE
      ? `<button type="button" class="btn btn-sm" data-action="reserve-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}"${hasTrip ? ` disabled title="${escapeHtml(t(lang, "find.oneTrip"))}"` : ""}>${escapeHtml(t(lang, "action.reserve"))}</button>`
      : "";
    return `<tr data-vehicle-id="${escapeHtml(vehicle.id)}">
      <td><strong>${escapeHtml(vehicle.id)}</strong>${vehicle.upcomingUsage ? `<span class="tag">${escapeHtml(t(lang, "vehicle.upcoming"))}</span>` : ""}</td>
      <td>${escapeHtml(hubName(state, vehicle.hubId))}</td>
      <td>${batteryCell(vehicle.battery)}</td>
      <td>${statusBadge(vehicle.status, statusLabel(lang, vehicle.status))}</td>
      <td class="actions">${action}</td>
    </tr>`;
  }).join("");
  setHtml("#search-results", `<table class="table">
    <thead><tr><th>${escapeHtml(t(lang, "col.vehicle"))}</th><th>${escapeHtml(t(lang, "col.hub"))}</th><th>${escapeHtml(t(lang, "col.battery"))}</th><th>${escapeHtml(t(lang, "col.status"))}</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`);
}

function lastTripLine(state, lang) {
  const last = getStudentReservations(state, DEMO_STUDENT_ID).vehicles
    .filter((item) => [ReservationStatus.COMPLETED, ReservationStatus.EXPIRED, ReservationStatus.CANCELLED].includes(item.status))
    .at(-1);
  if (!last) return "";
  const where = last.status === ReservationStatus.COMPLETED ? ` → ${escapeHtml(hubName(state, last.returnHubId))}` : "";
  return `<p class="muted" data-last-trip>${escapeHtml(t(lang, "trip.last"))}: <strong>${escapeHtml(last.vehicleId)}</strong>${where} ${statusBadge(last.status, statusLabel(lang, last.status))}</p>`;
}

function renderTrip(state, lang) {
  const trip = getActiveTrip(state, DEMO_STUDENT_ID);
  const vehicle = trip ? state.vehicles.find((item) => item.id === trip.vehicleId) : null;
  if (!trip || !vehicle) {
    setHtml("#my-trip", `<div class="trip-empty"><p>${escapeHtml(t(lang, "trip.none"))}</p></div>${lastTripLine(state, lang)}`);
    return;
  }

  const head = `<div class="trip-head" data-trip-state="${escapeHtml(trip.status)}">
      <div><span class="trip-vehicle">${escapeHtml(vehicle.id)}</span>
      <span class="muted">${escapeHtml(hubName(state, trip.hubId ?? vehicle.hubId))} · ${escapeHtml(t(lang, "trip.battery", { battery: vehicle.battery }))}</span></div>
      ${statusBadge(trip.status === ReservationStatus.ACTIVE ? "reserved" : "in_use", statusLabel(lang, trip.status === ReservationStatus.ACTIVE ? "reserved" : "in_use"))}
    </div>`;

  if (trip.status === ReservationStatus.ACTIVE) {
    setHtml("#my-trip", `${head}
      <div class="countdown"><span class="muted">${escapeHtml(t(lang, "trip.remaining"))}</span><strong data-countdown="${escapeHtml(trip.expiresAt)}"></strong>
      <span class="muted">${escapeHtml(t(lang, "trip.until", { time: formatTime(lang, trip.expiresAt) }))}</span></div>
      <div class="button-row">
        <button type="button" class="btn" data-action="pickup-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">${escapeHtml(t(lang, "action.pickup"))}</button>
        <button type="button" class="btn btn-secondary" data-action="cancel-hold" data-vehicle-id="${escapeHtml(vehicle.id)}">${escapeHtml(t(lang, "action.cancelHold"))}</button>
      </div>`);
    return;
  }

  const current = $("#return-hub")?.value;
  const chosen = state.hubs.some((hub) => hub.id === current) ? current : (trip.hubId ?? vehicle.hubId);
  const options = listHubSummaries(state).map((hub) => {
    const label = hub.parkingAvailable > 0
      ? t(lang, "trip.hubOption", { hubName: hub.name, free: hub.parkingAvailable })
      : t(lang, "trip.hubFull", { hubName: hub.name });
    return `<option value="${escapeHtml(hub.id)}"${hub.id === chosen ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  setHtml("#my-trip", `${head}
    <label class="field"><span>${escapeHtml(t(lang, "trip.returnTo"))}</span><select id="return-hub">${options}</select></label>
    <div class="button-row">
      <button type="button" class="btn" data-action="return-vehicle" data-vehicle-id="${escapeHtml(vehicle.id)}">${escapeHtml(t(lang, "action.return"))}</button>
    </div>`);
}

export function renderFindPage(state, lang, view) {
  const filters = readFilters();
  const matchingHubIds = new Set(findSuitableHubs(state, {
    minimumParking: filters.parkingRequired ? 1 : 0,
    chargingRequired: filters.chargingRequired,
  }).map((hub) => hub.id));
  const hasTrip = Boolean(getActiveTrip(state, DEMO_STUDENT_ID));

  renderHubTiles(state, lang, matchingHubIds);
  renderVehicleResults(state, lang, filters, matchingHubIds, hasTrip);
  renderTrip(state, lang);
  $("#hold-duration").textContent = t(lang, view.customHoldDuration ? "trip.holdDemo" : "trip.hold", {
    duration: formatDuration(lang, view.holdDurationMs),
  });
}

function renderParking(state, lang) {
  setOptions("#parking-hub", listHubSummaries(state).map((hub) => ({
    value: hub.id,
    label: hub.parkingAvailable > 0
      ? t(lang, "parking.hubOption", { hubName: hub.name, free: hub.parkingAvailable })
      : t(lang, "trip.hubFull", { hubName: hub.name }),
  })));

  const holds = getStudentReservations(state, DEMO_STUDENT_ID).parking.filter((item) => item.status === ReservationStatus.ACTIVE);
  setHtml("#my-parking", holds.length === 0
    ? emptyState(t(lang, "parking.none"))
    : `<ul class="list">${holds.map((hold) => {
      const request = state.chargingRequests.find((item) => item.id === hold.linkedChargingRequest);
      const detail = request ? ` · ${escapeHtml(t(lang, "parking.forEv", { label: request.vehicleLabel }))}` : "";
      return `<li data-reservation-id="${escapeHtml(hold.id)}"><span><span class="code">${escapeHtml(hold.id)}</span> ${escapeHtml(hubName(state, hold.hubId))}${detail}</span>
        <button type="button" class="btn btn-sm btn-secondary" data-action="cancel-parking" data-reservation-id="${escapeHtml(hold.id)}">${escapeHtml(t(lang, "action.cancel"))}</button></li>`;
    }).join("")}</ul>`);
}

function renderChargingForm(state, lang, view) {
  const isPrivate = view.chargingType === "private";
  for (const button of document.querySelectorAll("[data-charging-type]")) {
    const active = button.dataset.chargingType === view.chargingType;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  setOptions("#charging-hub", listHubSummaries(state).map((hub) => ({
    value: hub.id,
    label: t(lang, "charging.hubOption", { hubName: hub.name, free: hub.availableChargingPoints }),
  })));

  const vehicles = listChargeableVehicles(state, $("#charging-hub").value);
  setOptions("#charging-vehicle", vehicles.map((vehicle) => ({
    value: vehicle.id,
    label: `${vehicle.id} · ${vehicle.battery}%`,
  })), vehicles.length === 0 ? t(lang, "charging.noVehicle") : null);

  $("#charging-vehicle-field").hidden = isPrivate;
  $("#private-label-field").hidden = !isPrivate;
  $("#private-battery-field").hidden = !isPrivate;
  $("#submit-charging").textContent = t(lang, isPrivate ? "charging.submitPrivate" : "charging.submitShared");
  $("#submit-charging").disabled = !isPrivate && vehicles.length === 0;
  $("#charging-hint").textContent = t(lang, isPrivate ? "charging.hintPrivate" : (vehicles.length === 0 ? "charging.hintNone" : "charging.hintShared"));
}

function requestStateBadge(state, lang, request, schedules) {
  if (request.status === ChargingRequestStatus.SCHEDULED) {
    return statusBadge("scheduled", t(lang, "request.charging", { pointId: request.chargingPointId }));
  }
  if (request.status === ChargingRequestStatus.QUEUED) {
    const schedule = schedules.get(request.hubId);
    const blocked = schedule.blocked.find((item) => item.id === request.id);
    if (blocked) return statusBadge("reserved", t(lang, "request.onHold", { reason: t(lang, `blocked.${blocked.blockedReason}`) }));
    const position = schedule.waiting.findIndex((item) => item.id === request.id) + 1;
    return statusBadge("queued", t(lang, "request.waiting", { position: Math.max(position, 1) }));
  }
  return statusBadge(request.status, statusLabel(lang, request.status));
}

function renderMyCharging(state, lang) {
  const requests = state.chargingRequests.filter((item) => item.studentId === DEMO_STUDENT_ID).slice(-8).reverse();
  if (requests.length === 0) {
    setHtml("#my-charging", emptyState(t(lang, "charging.none")));
    return;
  }
  const schedules = new Map(state.hubs.map((hub) => [hub.id, buildChargingSchedule(state, hub.id)]));
  setHtml("#my-charging", `<table class="table">
    <thead><tr><th>${escapeHtml(t(lang, "col.request"))}</th><th>${escapeHtml(t(lang, "col.vehicle"))}</th><th>${escapeHtml(t(lang, "col.hub"))}</th><th>${escapeHtml(t(lang, "col.battery"))}</th><th>${escapeHtml(t(lang, "col.status"))}</th><th></th></tr></thead>
    <tbody>${requests.map((request) => `<tr data-request-id="${escapeHtml(request.id)}">
      <td class="code">${escapeHtml(request.id)}</td>
      <td><strong>${escapeHtml(request.vehicleLabel)}</strong>${request.upcomingUsage ? `<span class="tag">${escapeHtml(t(lang, "vehicle.upcoming"))}</span>` : ""}</td>
      <td>${escapeHtml(hubName(state, request.hubId))}</td>
      <td class="num">${escapeHtml(request.battery)}%</td>
      <td>${requestStateBadge(state, lang, request, schedules)}</td>
      <td class="actions">${request.status === ChargingRequestStatus.QUEUED ? `<button type="button" class="btn btn-sm btn-secondary" data-action="cancel-charging" data-request-id="${escapeHtml(request.id)}">${escapeHtml(t(lang, "action.cancel"))}</button>` : ""}</td>
    </tr>`).join("")}</tbody>
  </table>`);
}

export function renderServicesPage(state, lang, view) {
  renderParking(state, lang);
  renderChargingForm(state, lang, view);
  renderMyCharging(state, lang);
}
