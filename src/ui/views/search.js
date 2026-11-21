// Student portal — UC-02 Find Suitable Hub / Vehicle (SearchUI in the Submission #3 class design).
import { DEMO_STUDENT_ID } from "../../domain/actors.js";
import { VehicleType } from "../../domain/status.js";
import { estimatedRangeKm } from "../../domain/vehicle.js";
import { fetchAvailableVehicles, listPlaces, requestNearbyHubs } from "../../services/hubService.js";
import { getActiveTrip } from "../../services/reservationService.js";
import { $, actionButton, badge, batteryCell, emptyState, escapeHtml, meter, numberValue, setHtml, setOptions, table } from "../dom.js";
import { describe, formatTime, t } from "../i18n.js";

// UC-02 E3: team decision — warn when the simulated data is older than 5 minutes.
export const STALE_AFTER_MS = 5 * 60 * 1000;

// SearchUI.renderSearchForm: location, destination and radius controls. Until the student picks a
// location, the demo starts at view.defaultOriginId (the Metro station).
function renderSearchForm(state, lang, view) {
  const places = listPlaces(state).map((place) => ({ value: place.id, label: place.name }));
  setOptions("#search-origin", places, t(lang, "find.originPlaceholder"));
  if (!view.originTouched && !$("#search-origin").value && view.defaultOriginId) $("#search-origin").value = view.defaultOriginId;
  setOptions("#search-destination", places, t(lang, "find.noDestination"));
  setOptions("#vehicle-type", [
    { value: "", label: t(lang, "find.allTypes") },
    ...Object.values(VehicleType).map((type) => ({ value: type, label: t(lang, `vtype.${type}`) })),
  ]);
}

function renderFreshness(state, lang, view) {
  const lastAt = state.lastUpdate?.at ? Date.parse(state.lastUpdate.at) : view.loadedAt;
  const stale = Date.now() - lastAt > STALE_AFTER_MS;
  setHtml("#find-freshness", stale ? badge(t(lang, "find.stale", { time: formatTime(lang, lastAt) }), "warning") : "");
}

// SearchUI.displayNearbyHubs: Hubs in the radius, nearest first, with their resources.
function displayNearbyHubs(lang, search, selectedId) {
  if (!search.ok) {
    setHtml("#hub-results", `<p class="empty" data-search-error="${escapeHtml(search.code)}">${escapeHtml(describe(lang, search))}</p>`);
    return;
  }
  const rows = search.hubs.map((hub) => {
    const selected = hub.id === selectedId;
    const action = selected
      ? badge(t(lang, "tag.selected"), "info")
      : actionButton("select-hub", t(lang, "find.select"), { "hub-id": hub.id }, "btn-sm btn-secondary");
    return `<tr data-hub-id="${escapeHtml(hub.id)}"${selected ? ' class="is-selected"' : ""}>
      <td><strong>${escapeHtml(hub.name)}</strong> <span class="code">${escapeHtml(hub.id)}</span>${hub.overloaded ? ` ${badge(t(lang, "tag.overloaded"), "danger")}` : ""}</td>
      <td class="num">${escapeHtml(hub.distanceKm < 0.05 ? t(lang, "dist.here") : t(lang, "dist.value", { km: hub.distanceKm.toFixed(1), min: hub.walkMinutes }))}</td>
      <td><span class="usage">${meter(hub.utilization, hub.overloaded ? "danger" : "accent")}<span class="num">${hub.parkingAvailable}</span></span></td>
      <td class="num">${hub.availableVehicles}</td>
      <td class="num">${hub.availableChargingPoints}/${hub.totalChargingPoints}</td>
      <td class="actions">${action}</td>
    </tr>`;
  }).join("");
  const destination = search.destinationHubs.length === 0 ? "" : `<p class="note-line" data-destination-hubs><strong>${escapeHtml(t(lang, "find.nearDestination"))}:</strong> ${search.destinationHubs
    .map((hub) => escapeHtml(t(lang, "parking.hubOption", { hubName: hub.name, free: hub.parkingAvailable }))).join(" · ")}</p>`;
  setHtml("#hub-results", table(
    [t(lang, "col.hub"), t(lang, "col.distance"), t(lang, "col.parkingFree"), t(lang, "col.vehiclesAvailable"), t(lang, "col.freeChargers"), ""],
    rows,
  ) + destination);
}

// SearchUI.displayVehicleResults: available vehicles of the selected Hub after the type/battery filter.
function displayVehicleResults(state, lang, hub) {
  $("#vehicles-title").textContent = hub ? t(lang, "find.vehiclesAt", { hubName: hub.name }) : t(lang, "find.vehiclesTitle");
  if (!hub) {
    setHtml("#vehicle-results", emptyState(t(lang, "find.selectHub")));
    return;
  }
  const vehicles = fetchAvailableVehicles(state, {
    hubId: hub.id,
    vehicleType: $("#vehicle-type").value,
    minBattery: numberValue("#minimum-battery", 0),
  });
  if (vehicles.length === 0) {
    setHtml("#vehicle-results", emptyState(t(lang, "find.noVehicle")));
    return;
  }
  const hasTrip = Boolean(getActiveTrip(state, DEMO_STUDENT_ID));
  const rows = vehicles.map((vehicle) => `<tr data-vehicle-id="${escapeHtml(vehicle.id)}">
      <td><strong>${escapeHtml(vehicle.id)}</strong></td>
      <td>${escapeHtml(t(lang, `vtype.${vehicle.type}`))}</td>
      <td>${batteryCell(vehicle.battery)}</td>
      <td class="num">${escapeHtml(t(lang, "range.value", { km: estimatedRangeKm(vehicle) }))}</td>
      <td class="actions">${hasTrip
        ? `<button type="button" class="btn btn-sm" disabled title="${escapeHtml(t(lang, "find.oneTrip"))}">${escapeHtml(t(lang, "find.reserveThis"))}</button>`
        : actionButton("select-vehicle", t(lang, "find.reserveThis"), { "vehicle-id": vehicle.id }, "btn-sm")}</td>
    </tr>`).join("");
  setHtml("#vehicle-results", table([t(lang, "col.vehicle"), t(lang, "col.type"), t(lang, "col.battery"), t(lang, "col.range"), ""], rows));
}

export function renderFindPage(state, lang, view) {
  renderSearchForm(state, lang, view);
  renderFreshness(state, lang, view);
  const search = requestNearbyHubs(state, {
    originId: $("#search-origin").value,
    destinationId: $("#search-destination").value || null,
    radiusKm: $("#search-radius").value,
  });
  const hubs = search.ok ? search.hubs : [];
  const selected = hubs.find((hub) => hub.id === view.selectedHubId) ?? hubs[0] ?? null;
  displayNearbyHubs(lang, search, selected?.id);
  displayVehicleResults(state, lang, selected);
}
