// Student portal — UC-04 Reserve Shared Vehicle, UC-06 Pick Up, UC-07 Return (StudentUI).
// Screens follow the Submission #2 mockups: confirmation, "Reservation confirmed" with the hold
// details, expiry (A3); the next-step card offers pickup and return.
import { DEMO_STUDENT_ID } from "../../domain/actors.js";
import { ReservationStatus } from "../../domain/status.js";
import { estimatedRangeKm } from "../../domain/vehicle.js";
import { listHubSummaries } from "../../services/hubService.js";
import { getActiveTrip, getTripHistory } from "../../services/reservationService.js";
import { $, actionButton, batteryCell, detailList, emptyState, escapeHtml, setHtml, statusBadge, table } from "../dom.js";
import { formatDateTime, formatDuration, formatTime, statusLabel, t } from "../i18n.js";

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;

function vehicleCard(state, lang, vehicle) {
  return `<div class="vehicle-card" data-vehicle-id="${escapeHtml(vehicle.id)}">
    <div><span class="trip-vehicle">${escapeHtml(vehicle.id)}</span>
      <span class="muted">${escapeHtml(t(lang, `vtype.${vehicle.type}`))} · ${escapeHtml(hubName(state, vehicle.hubId))}</span></div>
    <div class="vehicle-meta">${batteryCell(vehicle.battery)}<span class="muted">${escapeHtml(t(lang, "range.value", { km: estimatedRangeKm(vehicle) }))}</span></div>
  </div>`;
}

// StudentUI.showVehicleDetails: Hub, status and battery before the reservation is confirmed.
function showVehicleDetails(state, lang, vehicle, view) {
  const panel = `${vehicleCard(state, lang, vehicle)}
    ${detailList([
      [t(lang, "field.hub"), escapeHtml(hubName(state, vehicle.hubId))],
      [t(lang, "field.status"), statusBadge(vehicle.status, statusLabel(lang, vehicle.status))],
      [t(lang, "field.battery"), `${escapeHtml(vehicle.battery)}%`],
      [t(lang, "field.range"), escapeHtml(t(lang, "range.value", { km: estimatedRangeKm(vehicle) }))],
    ])}
    <p class="muted">${escapeHtml(t(lang, "reserve.confirmHint", { duration: formatDuration(lang, view.holdDurationMs) }))}</p>
    <details class="demo"><summary>${escapeHtml(t(lang, "common.demo"))}</summary><div class="button-row">
      ${actionButton("sim-conflict", t(lang, "action.simConflict"), { "vehicle-id": vehicle.id }, "btn-sm btn-secondary")}
      ${actionButton("sim-read-error", t(lang, "action.simReadError"), { "vehicle-id": vehicle.id }, "btn-sm btn-secondary")}
    </div></details>`;
  const next = `<p class="muted">${escapeHtml(t(lang, "reserve.nextConfirm"))}</p>
    <div class="button-row">
      ${actionButton("confirm-reservation", t(lang, "action.confirmReservation"), { "vehicle-id": vehicle.id })}
      ${actionButton("cancel-before-confirm", t(lang, "action.cancel"), { "vehicle-id": vehicle.id }, "btn-secondary")}
      ${actionButton("choose-another", t(lang, "action.chooseAnother"), {}, "btn-secondary")}
    </div>`;
  return { title: t(lang, "reserve.titleConfirm"), status: "", panel, next };
}

// StudentUI.showReservationResult: Active hold with its timestamps, then the pickup step.
function showReservationResult(state, lang, trip, vehicle) {
  const panel = `<p class="notice notice-success">${escapeHtml(t(lang, "reserve.reservedHint"))}</p>
    ${vehicleCard(state, lang, vehicle)}
    <div class="transition"><span class="muted">${escapeHtml(t(lang, "reserve.transition"))}</span>
      ${statusBadge("available", statusLabel(lang, "available"))}<span aria-hidden="true">→</span>${statusBadge("reserved", statusLabel(lang, "reserved"))}</div>
    <h3>${escapeHtml(t(lang, "reserve.details"))}</h3>
    ${detailList([
      [t(lang, "field.reservationId"), `<span class="code" data-reservation-id>${escapeHtml(trip.id)}</span>`],
      [t(lang, "field.status"), statusBadge(trip.status, statusLabel(lang, trip.status))],
      [t(lang, "field.createdAt"), escapeHtml(formatDateTime(lang, trip.createdAt))],
      [t(lang, "field.expiresAt"), escapeHtml(formatDateTime(lang, trip.expiresAt))],
      [t(lang, "field.heldFor"), escapeHtml(trip.studentId)],
    ])}`;
  const next = `<div class="countdown"><span class="muted">${escapeHtml(t(lang, "trip.remaining"))}</span><strong data-countdown="${escapeHtml(trip.expiresAt)}"></strong>
      <span class="muted">${escapeHtml(t(lang, "trip.until", { time: formatTime(lang, trip.expiresAt) }))}</span></div>
    <p class="muted">${escapeHtml(t(lang, "reserve.nextPickup"))}</p>
    <div class="button-row">
      ${actionButton("pickup-vehicle", t(lang, "action.pickup"), { "vehicle-id": vehicle.id })}
      ${actionButton("cancel-hold", t(lang, "action.cancelHold"), { "vehicle-id": vehicle.id }, "btn-secondary")}
    </div>`;
  return { title: t(lang, "reserve.titleReserved"), status: "reserved", panel, next };
}

function showTripInProgress(state, lang, trip, vehicle) {
  const panel = `${vehicleCard(state, lang, vehicle)}
    ${detailList([
      [t(lang, "field.reservationId"), `<span class="code">${escapeHtml(trip.id)}</span>`],
      [t(lang, "field.status"), statusBadge(trip.status, statusLabel(lang, trip.status))],
      [t(lang, "field.pickedUpAt"), escapeHtml(formatDateTime(lang, trip.pickedUpAt))],
    ])}`;
  const current = $("#return-hub")?.value;
  const chosen = state.hubs.some((hub) => hub.id === current) ? current : trip.hubId;
  const options = listHubSummaries(state).map((hub) => {
    const label = hub.parkingAvailable > 0
      ? t(lang, "trip.hubOption", { hubName: hub.name, free: hub.parkingAvailable })
      : t(lang, "trip.hubFull", { hubName: hub.name });
    return `<option value="${escapeHtml(hub.id)}"${hub.id === chosen ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  const next = `<p class="muted">${escapeHtml(t(lang, "reserve.nextReturn"))}</p>
    <label class="field"><span>${escapeHtml(t(lang, "trip.returnTo"))}</span><select id="return-hub">${options}</select></label>
    <div class="button-row">${actionButton("return-vehicle", t(lang, "action.return"), { "vehicle-id": vehicle.id })}</div>`;
  return { title: t(lang, "reserve.titleInUse"), status: "in_use", panel, next };
}

function showExpired(state, lang, reservation) {
  const vehicle = state.vehicles.find((item) => item.id === reservation.vehicleId);
  return {
    title: t(lang, "reserve.titleExpired"),
    status: "expired",
    panel: `<p class="notice notice-warning">${escapeHtml(t(lang, "reserve.expired", { reservationId: reservation.id, vehicleId: reservation.vehicleId }))}</p>
      ${vehicle ? vehicleCard(state, lang, vehicle) : ""}`,
    next: `<div class="button-row">${actionButton("choose-another", t(lang, "action.chooseAnother"))}</div>`,
  };
}

function showEmpty(lang) {
  return {
    title: t(lang, "reserve.titleEmpty"),
    status: "",
    panel: emptyState(t(lang, "reserve.empty")),
    next: `<p class="muted">${escapeHtml(t(lang, "reserve.nextNone"))}</p><div class="button-row">${actionButton("choose-another", t(lang, "action.goFind"))}</div>`,
  };
}

function renderHistory(state, lang) {
  const history = getTripHistory(state, DEMO_STUDENT_ID);
  if (history.length === 0) {
    setHtml("#trip-history", emptyState(t(lang, "history.empty")));
    return;
  }
  const rows = history.map((item) => {
    const route = item.returnHubId ? `${hubName(state, item.hubId)} → ${hubName(state, item.returnHubId)}` : hubName(state, item.hubId);
    return `<tr data-reservation-id="${escapeHtml(item.id)}">
      <td class="code">${escapeHtml(item.id)}</td>
      <td><strong>${escapeHtml(item.vehicleId)}</strong></td>
      <td>${escapeHtml(route)}</td>
      <td class="num">${escapeHtml(formatDateTime(lang, item.createdAt))}</td>
      <td>${statusBadge(item.status, statusLabel(lang, item.status))}</td>
    </tr>`;
  }).join("");
  setHtml("#trip-history", table([t(lang, "col.reservation"), t(lang, "col.vehicle"), t(lang, "col.route"), t(lang, "col.time"), t(lang, "col.status")], rows));
}

export function renderReservePage(state, lang, view) {
  const trip = getActiveTrip(state, DEMO_STUDENT_ID);
  const tripVehicle = trip ? state.vehicles.find((item) => item.id === trip.vehicleId) : null;
  const selected = view.selectedVehicleId ? state.vehicles.find((item) => item.id === view.selectedVehicleId) : null;
  const latest = getTripHistory(state, DEMO_STUDENT_ID)[0];
  let screen;
  if (trip?.status === ReservationStatus.ACTIVE && tripVehicle) screen = showReservationResult(state, lang, trip, tripVehicle);
  else if (trip?.status === ReservationStatus.IN_USE && tripVehicle) screen = showTripInProgress(state, lang, trip, tripVehicle);
  else if (selected) screen = showVehicleDetails(state, lang, selected, view);
  else if (latest?.status === ReservationStatus.EXPIRED) screen = showExpired(state, lang, latest);
  else screen = showEmpty(lang);

  $("#reserve-title").textContent = screen.title;
  setHtml("#reserve-state", screen.status ? statusBadge(screen.status, statusLabel(lang, screen.status)) : "");
  setHtml("#reserve-panel", screen.panel);
  setHtml("#reserve-next", screen.next);
  $("#reserve-panel").dataset.screen = trip ? trip.status : (selected ? "confirm" : (latest?.status === ReservationStatus.EXPIRED ? "expired" : "empty"));
  $("#hold-duration").textContent = t(lang, view.customHoldDuration ? "trip.holdDemo" : "trip.hold", { duration: formatDuration(lang, view.holdDurationMs) });
  renderHistory(state, lang);
}
