import { createInitialState } from "./data/simulatedData.js";
import { InterfaceMode } from "./domain/status.js";
import { cancelChargingRequest, finishCharging, schedulePrivateEvCharging, submitChargingRequest } from "./services/chargingService.js";
import {
  coordinateRedistribution,
  reportChargingPointUnavailable,
  reportVehicleFailure,
  resolveIncident,
  suggestRedistribution,
} from "./services/operatorService.js";
import {
  cancelParkingReservation,
  cancelReservation,
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
import { $, DEMO_STUDENT_ID } from "./ui/dom.js";
import { normalizeLanguage } from "./ui/i18n.js";
import { renderApp, resolvePage, updateCountdowns } from "./ui/render.js";

// D-012: the hold duration defaults to 15 minutes; a live demo may shorten it explicitly
// through the page URL, e.g. http://127.0.0.1:5173/?holdSeconds=20 (accepted 10..3600 s).
const HOLD_SECONDS_MIN = 10;
const HOLD_SECONDS_MAX = 3600;
const TOAST_MS = 8000;

function readHoldDurationOverrideMs() {
  const raw = new URLSearchParams(window.location.search).get("holdSeconds");
  if (raw === null) return null;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < HOLD_SECONDS_MIN || seconds > HOLD_SECONDS_MAX) return null;
  return seconds * 1000;
}

const pageFromHash = () => resolvePage(window.location.hash.replace("#", ""));

const holdOverrideMs = readHoldDurationOverrideMs();
const store = createStore(createInitialState());
// Presentation-only state; never part of the simulated network state.
const view = {
  page: pageFromHash(),
  chargingType: "shared",
  feedback: null,
  simulation: null,
  autoUpdating: false,
  holdDurationMs: holdOverrideMs ?? RESERVATION_HOLD_DURATION_MS,
  customHoldDuration: holdOverrideMs !== null,
};
let autoUpdateTimer = null;
let toastTimer = null;

function render() {
  renderApp(store.getState(), view);
}

function setFeedback(feedback) {
  view.feedback = feedback;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    view.feedback = null;
    render();
  }, TOAST_MS);
  render();
}

const showResult = (result) => setFeedback({ ok: Boolean(result?.ok), result });
const showMessage = (key, params = {}, ok = true) => setFeedback({ ok, key, params });
const value = (selector) => $(selector)?.value ?? "";

const ACTIONS = {
  "reserve-vehicle": ({ vehicleId }) => reserveVehicle(store, { studentId: DEMO_STUDENT_ID, vehicleId, holdDurationMs: view.holdDurationMs }),
  "pickup-vehicle": ({ vehicleId }) => pickUpVehicle(store, { studentId: DEMO_STUDENT_ID, vehicleId }),
  "cancel-hold": ({ vehicleId }) => cancelReservation(store, { studentId: DEMO_STUDENT_ID, vehicleId }),
  "return-vehicle": ({ vehicleId }) => returnVehicle(store, { vehicleId, destinationHubId: value("#return-hub"), studentId: DEMO_STUDENT_ID }),
  "cancel-parking": ({ reservationId }) => cancelParkingReservation(store, { studentId: DEMO_STUDENT_ID, reservationId }),
  "cancel-charging": ({ requestId }) => cancelChargingRequest(store, { studentId: DEMO_STUDENT_ID, requestId }),
  "coordinate-redistribution": () => coordinateRedistribution(store, suggestRedistribution(store.getState())),
  "finish-charging": ({ pointId }) => finishCharging(store, pointId),
  "resolve-incident": ({ incidentId }) => resolveIncident(store, incidentId),
};

function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (button && !button.disabled && ACTIONS[button.dataset.action]) showResult(ACTIONS[button.dataset.action](button.dataset));
}

function submitCharging() {
  const request = { studentId: DEMO_STUDENT_ID, hubId: value("#charging-hub"), upcomingUsage: $("#upcoming-usage").checked };
  showResult(view.chargingType === "private"
    ? schedulePrivateEvCharging(store, { ...request, vehicleLabel: value("#private-vehicle-label"), battery: value("#charging-battery") })
    : submitChargingRequest(store, { ...request, vehicleId: value("#charging-vehicle") }));
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
  view.simulation = runWhatIf(store.getState(), { type: value("#scenario"), hubId: value("#scenario-hub") });
  if (view.simulation.liveStateUnchanged) showMessage("feedback.whatIfDone");
  else showMessage("feedback.whatIfChanged", {}, false);
}

// D-018: restore the seed data without reloading; interface preferences are kept.
function resetSimulation() {
  const { interfaceMode, interfaceLanguage } = store.getState();
  view.simulation = null;
  store.replace({ ...createInitialState(), interfaceMode, interfaceLanguage });
  showMessage("feedback.resetDone");
}

// FR-04 alternative flow: release holds that expire before pickup, without user interaction.
function tick() {
  const { vehicles } = expireReservations(store);
  if (vehicles.length > 0) showMessage("feedback.holdExpired", { vehicles: vehicles.join(", ") }, false);
  updateCountdowns();
}

function wireEvents() {
  const on = (selector, type, handler) => $(selector).addEventListener(type, handler);
  on("#toggle-mode", "click", () => store.update((state) => {
    state.interfaceMode = state.interfaceMode === InterfaceMode.LIGHT ? InterfaceMode.DARK : InterfaceMode.LIGHT;
  }));
  on("#language-select", "change", (event) => store.update((state) => {
    state.interfaceLanguage = normalizeLanguage(event.target.value);
  }));
  on("#simulate-update", "click", () => showResult(applySimulatedUpdate(store)));
  on("#toggle-auto-update", "click", toggleAutoUpdates);
  on("#reset-data", "click", resetSimulation);
  on("#reserve-parking", "click", () => showResult(reserveParking(store, { studentId: DEMO_STUDENT_ID, hubId: value("#parking-hub") })));
  on("#submit-charging", "click", submitCharging);
  on("#report-vehicle-failure", "click", () => showResult(reportVehicleFailure(store, value("#incident-vehicle"))));
  on("#report-charging-failure", "click", () => showResult(reportChargingPointUnavailable(store, value("#incident-charging-point"))));
  on("#run-simulation", "click", runScenario);
  on("#toast-close", "click", () => {
    view.feedback = null;
    render();
  });
  for (const button of document.querySelectorAll("[data-charging-type]")) {
    button.addEventListener("click", () => {
      view.chargingType = button.dataset.chargingType;
      render();
    });
  }
  for (const selector of ["#vehicle-search-hub", "#only-available", "#charging-required", "#parking-required", "#charging-hub", "#parking-hub"]) {
    on(selector, "change", render);
  }
  on("#minimum-battery", "input", render);
  window.addEventListener("hashchange", () => {
    view.page = pageFromHash();
    render();
    $("#main").focus({ preventScroll: true });
  });
  document.addEventListener("click", handleAction);
}

store.subscribe(render);
render();
wireEvents();
window.setInterval(tick, 1000);
