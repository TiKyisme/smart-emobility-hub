import { createInitialState } from "./data/simulatedData.js";
import { InterfaceMode } from "./domain/status.js";
import { applyChargingSchedule, schedulePrivateEvCharging, submitChargingRequest } from "./services/chargingService.js";
import { coordinateRedistribution, reportChargingPointUnavailable, reportVehicleFailure, suggestRedistribution } from "./services/operatorService.js";
import {
  expireReservations,
  pickUpVehicle,
  RESERVATION_HOLD_DURATION_MS,
  reserveParking,
  reserveVehicle,
  returnVehicle,
} from "./services/reservationService.js";
import { runWhatIf } from "./services/simulationService.js";
import { applySimulatedUpdate, AUTO_UPDATE_INTERVAL_MS } from "./services/simulatorService.js";
import { createStore } from "./state/store.js";
import { normalizeLanguage } from "./ui/i18n.js";
import { DEMO_STUDENT_ID, renderApp } from "./ui/render.js";

// D-007: the hold duration defaults to 15 minutes. For a live demonstration it can be shortened
// explicitly through the page URL, e.g. http://127.0.0.1:5173/?holdSeconds=60 (10..3600 s).
const HOLD_SECONDS_MIN = 10;
const HOLD_SECONDS_MAX = 3600;

function readHoldDurationOverrideMs() {
  const raw = new URLSearchParams(window.location.search).get("holdSeconds");
  if (raw === null) return null;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < HOLD_SECONDS_MIN || seconds > HOLD_SECONDS_MAX) return null;
  return seconds * 1000;
}

const holdOverrideMs = readHoldDurationOverrideMs();
const store = createStore(createInitialState());
// Transient presentation state that is not part of the simulated network state.
const view = {
  feedback: null,
  simulation: null,
  autoUpdating: false,
  holdDurationMs: holdOverrideMs ?? RESERVATION_HOLD_DURATION_MS,
  customHoldDuration: holdOverrideMs !== null,
};
let autoUpdateTimer = null;

function render() {
  renderApp(store.getState(), view);
}

function showResult(result) {
  view.feedback = { ok: Boolean(result?.ok), result };
  render();
}

function showMessage(key, params = {}, ok = true) {
  view.feedback = { ok, key, params };
  render();
}

function selectedValue(id) {
  return document.querySelector(`#${id}`)?.value ?? "";
}

function isChecked(id) {
  return Boolean(document.querySelector(`#${id}`)?.checked);
}

function handleResourceAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action, vehicleId, hubId } = button.dataset;
  let result = null;
  if (action === "reserve-vehicle") {
    result = reserveVehicle(store, { studentId: DEMO_STUDENT_ID, vehicleId, holdDurationMs: view.holdDurationMs });
  } else if (action === "pickup-vehicle") {
    result = pickUpVehicle(store, { studentId: DEMO_STUDENT_ID, vehicleId });
  } else if (action === "return-vehicle") {
    const destinationHubId = button.closest(".inline-action")?.querySelector("select")?.value;
    result = returnVehicle(store, { vehicleId, destinationHubId, studentId: DEMO_STUDENT_ID });
  } else if (action === "coordinate-redistribution") {
    result = coordinateRedistribution(store, suggestRedistribution(store.getState()));
  } else if (action === "schedule-hub") {
    result = applyChargingSchedule(store, hubId);
  }

  if (result) showResult(result);
}

function submitSharedCharging() {
  showResult(submitChargingRequest(store, {
    studentId: DEMO_STUDENT_ID,
    hubId: selectedValue("charging-hub"),
    vehicleId: selectedValue("charging-vehicle"),
    upcomingUsage: isChecked("upcoming-usage"),
  }));
}

function submitPrivateCharging() {
  showResult(schedulePrivateEvCharging(store, {
    studentId: DEMO_STUDENT_ID,
    hubId: selectedValue("charging-hub"),
    vehicleLabel: selectedValue("private-vehicle-label"),
    battery: selectedValue("charging-battery"),
    upcomingUsage: isChecked("upcoming-usage"),
  }));
}

function toggleAutoUpdates() {
  if (autoUpdateTimer) {
    window.clearInterval(autoUpdateTimer);
    autoUpdateTimer = null;
    view.autoUpdating = false;
    showMessage("feedback.autoPaused");
    return;
  }

  autoUpdateTimer = window.setInterval(() => applySimulatedUpdate(store), AUTO_UPDATE_INTERVAL_MS);
  view.autoUpdating = true;
  showMessage("feedback.autoStarted", { seconds: AUTO_UPDATE_INTERVAL_MS / 1000 });
}

function runScenario() {
  view.simulation = runWhatIf(store.getState(), {
    type: selectedValue("scenario"),
    hubId: selectedValue("scenario-hub"),
  });
  if (view.simulation.liveStateUnchanged) showMessage("feedback.whatIfDone");
  else showMessage("feedback.whatIfChanged", {}, false);
}

// FR-04 alternative flow: release holds that expire before pickup, even without user interaction.
function expireHolds() {
  const { expired } = expireReservations(store);
  if (expired.length === 0) return;
  const vehicles = store.getState().reservations
    .filter((reservation) => expired.includes(reservation.id))
    .map((reservation) => reservation.vehicleId)
    .join(", ");
  showMessage("feedback.holdExpired", { vehicles }, false);
}

function wireEvents() {
  const on = (selector, type, handler) => document.querySelector(selector).addEventListener(type, handler);

  on("#toggle-mode", "click", () => {
    store.update((state) => {
      state.interfaceMode = state.interfaceMode === InterfaceMode.LIGHT ? InterfaceMode.DARK : InterfaceMode.LIGHT;
    });
  });
  on("#language-select", "change", (event) => {
    store.update((state) => {
      state.interfaceLanguage = normalizeLanguage(event.target.value);
    });
  });
  on("#simulate-update", "click", () => showResult(applySimulatedUpdate(store)));
  on("#toggle-auto-update", "click", toggleAutoUpdates);
  on("#reserve-parking", "click", () => {
    showResult(reserveParking(store, { studentId: DEMO_STUDENT_ID, hubId: selectedValue("parking-hub"), vehicleType: "private" }));
  });
  on("#submit-charging", "click", submitSharedCharging);
  on("#schedule-private", "click", submitPrivateCharging);
  on("#report-vehicle-failure", "click", () => showResult(reportVehicleFailure(store, selectedValue("incident-vehicle"))));
  on("#report-charging-failure", "click", () => showResult(reportChargingPointUnavailable(store, selectedValue("incident-charging-point"))));
  on("#run-simulation", "click", runScenario);

  for (const id of ["#charging-type", "#charging-hub", "#charging-vehicle", "#parking-hub", "#vehicle-search-hub", "#charging-required"]) {
    on(id, "change", render);
  }
  for (const id of ["#minimum-battery", "#minimum-parking"]) on(id, "input", render);
  document.addEventListener("click", handleResourceAction);
}

store.subscribe(render);
render();
wireEvents();
window.setInterval(expireHolds, 1000);
