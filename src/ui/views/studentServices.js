// Student portal — UC-05 Reserve Parking Space and UC-09 Schedule Private EV Charging
// (ChargingScheduleUI in the Submission #3 class design).
import { DEMO_STUDENT_ID } from "../../domain/actors.js";
import { ChargingRequestStatus, ReservationStatus } from "../../domain/status.js";
import { dayStartOf, slotsOfDay } from "../../domain/time.js";
import { buildChargingSchedule, getAvailableSlots, getChargingPorts, isPriorityRequest } from "../../services/chargingService.js";
import { listHubSummaries } from "../../services/hubService.js";
import { getStudentReservations } from "../../services/reservationService.js";
import { $, actionButton, badge, batteryCell, detailList, emptyState, escapeHtml, setHtml, setOptions, statusBadge, table } from "../dom.js";
import { describe, formatClock, formatDate, formatDateTime, statusLabel, t } from "../i18n.js";

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;

/* ---------- UC-05 Reserve Parking Space ---------- */

export function renderParkingPage(state, lang) {
  setOptions("#parking-hub", listHubSummaries(state).map((hub) => ({
    value: hub.id,
    label: hub.parkingAvailable > 0
      ? t(lang, "parking.hubOption", { hubName: hub.name, free: hub.parkingAvailable })
      : t(lang, "trip.hubFull", { hubName: hub.name }),
  })));
  const holds = getStudentReservations(state, DEMO_STUDENT_ID).parking.filter((item) => item.status === ReservationStatus.ACTIVE);
  setHtml("#my-parking", holds.length === 0
    ? emptyState(t(lang, "parking.none"))
    : table([t(lang, "col.reservation"), t(lang, "col.hub"), t(lang, "col.time"), ""], holds.map((hold) => `<tr data-reservation-id="${escapeHtml(hold.id)}">
        <td class="code">${escapeHtml(hold.id)}</td>
        <td>${escapeHtml(hubName(state, hold.hubId))}</td>
        <td class="num">${escapeHtml(formatDateTime(lang, hold.createdAt))}</td>
        <td class="actions">${actionButton("cancel-parking", t(lang, "action.cancel"), { "reservation-id": hold.id }, "btn-sm btn-secondary")}</td>
      </tr>`).join("")));
}

/* ---------- UC-09 Schedule Private EV Charging ---------- */

const slotText = (lang, start, end) => `${formatClock(lang, start)}–${formatClock(lang, end)}`;

// ChargingScheduleUI.renderScheduleForm + displayAvailableSlots: Hub, date and slots with free ports.
function renderScheduleForm(state, lang, now) {
  setOptions("#ev-hub", state.hubs.map((hub) => ({
    value: hub.id,
    label: t(lang, "ev.hubOption", { hubName: hub.name, ports: getChargingPorts(state, hub.id).length }),
  })));
  setOptions("#ev-date", [0, 1].map((day) => ({
    value: String(day),
    label: t(lang, day === 0 ? "ev.today" : "ev.tomorrow", { date: formatDate(lang, dayStartOf(now, day)) }),
  })));
  const hubId = $("#ev-hub").value;
  const day = Number($("#ev-date").value || 0);
  const dayStarts = new Set(slotsOfDay(day, now));
  const slots = getAvailableSlots(state, hubId, now).filter((slot) => dayStarts.has(slot.slotStart));
  setOptions("#ev-slot", slots.map((slot) => ({
    value: String(slot.slotStart),
    label: slot.free > 0
      ? t(lang, "ev.slotOption", { start: formatClock(lang, slot.slotStart), end: formatClock(lang, slot.slotEnd), free: slot.free, capacity: slot.capacity })
      : t(lang, "ev.slotFull", { start: formatClock(lang, slot.slotStart), end: formatClock(lang, slot.slotEnd) }),
  })));
}

function alternativesHtml(lang, check) {
  const slots = (check.alternatives ?? []).map((slot) => actionButton("ev-use-slot", t(lang, "ev.useSlot", {
    start: formatClock(lang, slot.slotStart), end: formatClock(lang, slot.slotEnd), date: formatDate(lang, slot.slotStart), free: slot.free,
  }), { "hub-id": slot.hubId, "slot-start": Date.parse(slot.slotStart) }, "btn-sm btn-secondary"));
  const hubs = (check.otherHubs ?? []).map((hub) => actionButton("ev-use-slot", t(lang, "ev.useHub", { hubName: hub.hubName, free: hub.free }), {
    "hub-id": hub.hubId, "slot-start": Date.parse(hub.slotStart),
  }, "btn-sm btn-secondary"));
  return `${slots.length ? `<h3>${escapeHtml(t(lang, "ev.alternatives"))}</h3><div class="chips">${slots.join("")}</div>` : ""}
    ${hubs.length ? `<h3>${escapeHtml(t(lang, "ev.otherHubs"))}</h3><div class="chips">${hubs.join("")}</div>` : ""}`;
}

// ChargingScheduleUI.displayBookingDetails / displayError: review before confirming, or the reason
// the slot cannot be booked with the alternatives the system found.
function displayBookingDetails(state, lang, view) {
  if (view.evConfirmedId) {
    const booking = state.chargingRequests.find((item) => item.id === view.evConfirmedId);
    if (booking) {
      setHtml("#ev-booking", `<p class="notice notice-success" data-booking-confirmed="${escapeHtml(booking.id)}"><strong>${escapeHtml(t(lang, "ev.confirmedTitle"))}</strong><br>${escapeHtml(t(lang, "ev.confirmedText"))}</p>
        ${detailList([
          [t(lang, "ev.hub"), escapeHtml(hubName(state, booking.hubId))],
          [t(lang, "field.date"), escapeHtml(formatDate(lang, booking.slotStart))],
          [t(lang, "field.slot"), badge(slotText(lang, booking.slotStart, booking.slotEnd), "info")],
          [t(lang, "field.vehicle"), escapeHtml(booking.vehicleLabel)],
          [t(lang, "field.status"), requestBadge(state, lang, booking)],
        ])}
        <div class="button-row">${actionButton("ev-new", t(lang, "action.bookAnother"), {}, "btn-secondary")}</div>`);
      return;
    }
  }
  const pending = view.evCheck;
  if (!pending) {
    setHtml("#ev-booking", emptyState(t(lang, "ev.bookingEmpty")));
    return;
  }
  const { params, result } = pending;
  if (!result.ok) {
    setHtml("#ev-booking", `<p class="notice notice-error" data-booking-error="${escapeHtml(result.code)}">${escapeHtml(describe(lang, result))}</p>
      ${alternativesHtml(lang, result)}
      <div class="button-row">${actionButton("ev-recheck", t(lang, "ev.check"), {}, "btn-secondary")}${actionButton("ev-cancel", t(lang, "action.cancel"), {}, "btn-secondary")}</div>`);
    return;
  }
  const high = isPriorityRequest({ battery: Number(params.battery), upcomingUsage: params.upcomingUsage });
  setHtml("#ev-booking", `<p class="muted" data-booking-review>${escapeHtml(t(lang, "ev.reviewHint"))}</p>
    ${detailList([
      [t(lang, "ev.hub"), escapeHtml(hubName(state, params.hubId))],
      [t(lang, "field.date"), escapeHtml(formatDate(lang, params.slotStart))],
      [t(lang, "field.slot"), badge(slotText(lang, params.slotStart, params.slotStart + 3600000), "info")],
      [t(lang, "field.vehicle"), escapeHtml(params.vehicleLabel)],
      [t(lang, "field.battery"), batteryCell(Number(params.battery))],
      [t(lang, "field.priority"), high ? badge(t(lang, "ev.priorityHigh"), "warning") : escapeHtml(t(lang, "ev.priorityNormal"))],
    ])}
    <div class="button-row">${actionButton("ev-confirm", t(lang, "action.confirmBooking"))}${actionButton("ev-cancel", t(lang, "action.cancel"), {}, "btn-secondary")}</div>`);
}

function requestBadge(state, lang, request) {
  const { CHARGING, QUEUED } = ChargingRequestStatus;
  if (request.status === CHARGING) return statusBadge("charging", t(lang, "request.charging", { pointId: request.chargingPointId }));
  if (request.status === QUEUED) {
    const schedule = buildChargingSchedule(state, request.hubId);
    const blocked = schedule.blocked.find((item) => item.id === request.id);
    if (blocked) return statusBadge("reserved", t(lang, "request.onHold", { reason: t(lang, `blocked.${blocked.blockedReason}`) }));
    const position = schedule.waiting.findIndex((item) => item.id === request.id) + 1;
    return statusBadge("queued", t(lang, "request.waiting", { position: Math.max(1, position) }));
  }
  return statusBadge(request.status, statusLabel(lang, request.status));
}

function renderMySessions(state, lang) {
  const sessions = state.chargingRequests.filter((item) => item.studentId === DEMO_STUDENT_ID).slice(-8).reverse();
  setHtml("#my-charging", sessions.length === 0
    ? emptyState(t(lang, "ev.none"))
    : table([t(lang, "col.session"), t(lang, "col.label"), t(lang, "col.hub"), t(lang, "col.slot"), t(lang, "col.status"), ""], sessions.map((item) => `<tr data-request-id="${escapeHtml(item.id)}">
        <td class="code">${escapeHtml(item.id)}</td>
        <td><strong>${escapeHtml(item.vehicleLabel)}</strong>${isPriorityRequest(item) ? `<span class="tag">${escapeHtml(t(lang, "tag.priority"))}</span>` : ""}</td>
        <td>${escapeHtml(hubName(state, item.hubId))}</td>
        <td class="num">${escapeHtml(`${slotText(lang, item.slotStart, item.slotEnd)} ${formatDate(lang, item.slotStart)}`)}</td>
        <td>${requestBadge(state, lang, item)}</td>
        <td class="actions">${[ChargingRequestStatus.SCHEDULED, ChargingRequestStatus.QUEUED].includes(item.status)
          ? actionButton("cancel-charging", t(lang, "action.cancel"), { "request-id": item.id }, "btn-sm btn-secondary") : ""}</td>
      </tr>`).join("")));
  const notice = (state.notifications ?? []).filter((item) => item.recipientId === DEMO_STUDENT_ID).at(-1);
  setHtml("#ev-notice", notice ? `${badge(t(lang, "ev.notice"), "success")} <span data-notification>${escapeHtml(describe(lang, notice))}</span>` : "");
}

export function renderEvChargingPage(state, lang, view) {
  const now = Date.now();
  renderScheduleForm(state, lang, now);
  displayBookingDetails(state, lang, view);
  renderMySessions(state, lang);
}
