import { createInitialState } from "./data/simulatedData.js";
import { DEMO_STUDENT_ID } from "./domain/actors.js";
import { InterfaceMode } from "./domain/status.js";
import { dayStartOf } from "./domain/time.js";
import {
  advanceChargingClock,
  cancelChargingRequest,
  checkAvailability,
  createChargingSession,
  finishCharging,
  optimizeQueue,
  rescheduleChargingRequest,
  scheduleSharedVehicleCharging,
  validateBookingInput,
} from "./services/chargingService.js";
import {
  applyCoordination,
  applyOperationalAction,
  assignMaintenance,
  cancelRedistributionOrder,
  classifyIncident,
  completeMaintenanceTask,
  completeRedistributionTask,
  createRedistributionOrder,
  markResourceUnavailable,
  planRedistribution,
  recordIncident,
  startMaintenanceTask,
  startRedistributionTask,
  updateAlertThresholds,
} from "./services/operatorService.js";
import {
  cancelParkingReservation,
  cancelReservation,
  expireReservations,
  pickUpVehicle,
  RESERVATION_HOLD_DURATION_MS,
  reserveParkingSpace,
  reserveVehicle,
  returnVehicle,
} from "./services/reservationService.js";
import { requestSimulation, saveToLibrary, SCENARIO_DEFAULTS } from "./services/simulationService.js";
import { AUTO_UPDATE_INTERVAL_MS, simulateCompetingReservation, simulateStateReadError, tickSimulator } from "./services/simulatorService.js";
import { createStore } from "./state/store.js";
import { $ } from "./ui/dom.js";
import { normalizeLanguage } from "./ui/i18n.js";
import { renderApp, resolvePage, updateCountdowns } from "./ui/render.js";

// D-012: the hold duration defaults to 15 minutes; a live demo may shorten it explicitly
// through the page URL, e.g. http://127.0.0.1:5173/?holdSeconds=20 (accepted 10..3600 s).
const HOLD_SECONDS_MIN = 10;
const HOLD_SECONDS_MAX = 3600;
const TOAST_MS = 8000;
// UC-02: the demo starts at the Metro station, where students arrive by Metro Line 1.
const DEFAULT_ORIGIN = "HUB-METRO";
// Time-based labels (stale-data warning, slot lists) are refreshed every 30 seconds.
const RERENDER_EVERY_TICKS = 30;

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
  feedback: null,
  autoUpdating: false,
  holdDurationMs: holdOverrideMs ?? RESERVATION_HOLD_DURATION_MS,
  customHoldDuration: holdOverrideMs !== null,
  loadedAt: Date.now(),
  defaultOriginId: DEFAULT_ORIGIN,
  originTouched: false,
  selectedHubId: null,
  selectedVehicleId: null,
  evCheck: null,
  evConfirmedId: null,
  selectedIncidentId: null,
  scenarioFormReady: false,
  simulation: null,
  simulationApplied: false,
};
let autoUpdateTimer = null;
let toastTimer = null;
let ticks = 0;

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
const go = (page) => {
  window.location.hash = `#${page}`;
};

// FR-20 / UC-10, UC-19 (setInterfaceMode in Submission #3): Light/Dark and VI/EN.
function setInterfaceMode({ mode = null, language = null } = {}) {
  store.update((state) => {
    if (mode) state.interfaceMode = mode;
    if (language) state.interfaceLanguage = normalizeLanguage(language);
  });
}

/* ---------- UC-09: check, review, confirm ---------- */

function readBookingForm() {
  return {
    studentId: DEMO_STUDENT_ID,
    hubId: value("#ev-hub"),
    slotStart: Number(value("#ev-slot")),
    vehicleLabel: value("#ev-label"),
    battery: value("#ev-battery"),
    upcomingUsage: $("#ev-upcoming").checked,
  };
}

function checkBooking() {
  const params = readBookingForm();
  const result = validateBookingInput(params) ?? checkAvailability(store.getState(), params.hubId, params.slotStart);
  view.evConfirmedId = null;
  view.evCheck = { params, result };
  if (result.ok) render();
  else showResult(result);
}

/* ---------- UC-17: setup form ---------- */

function fillScenarioForm(params = {}) {
  if (params.type) $("#scenario").value = params.type;
  if (params.hubId) $("#scenario-hub").value = params.hubId;
  render();
  $("#scenario-demand").value = String(params.demandIncreasePercent ?? 0);
  $("#scenario-offline").value = String(params.offlinePorts ?? 0);
  $("#scenario-horizon").value = String(params.horizonHours ?? 1);
}

function readScenarioForm() {
  const numberOrBlank = (selector) => (value(selector) === "" ? "" : Number(value(selector)));
  return {
    type: value("#scenario"),
    hubId: value("#scenario-hub"),
    demandIncreasePercent: numberOrBlank("#scenario-demand"),
    offlinePorts: numberOrBlank("#scenario-offline"),
    horizonHours: Number(value("#scenario-horizon")),
  };
}

function runScenario() {
  view.simulation = requestSimulation(store.getState(), readScenarioForm());
  view.simulationApplied = false;
  if (view.simulation.ok && !view.simulation.result.liveStateUnchanged) showMessage("feedback.whatIfChanged", {}, false);
  else showResult(view.simulation);
}

function recordAndSelect(request) {
  const result = recordIncident(store, request);
  if (result.ok) view.selectedIncidentId = result.incident.id;
  showResult(result);
}

// Delegated [data-action] buttons rendered by the views.
const ACTIONS = {
  // UC-02 → UC-04
  "select-hub": ({ hubId }) => {
    view.selectedHubId = hubId;
    render();
  },
  "select-vehicle": ({ vehicleId }) => {
    view.selectedVehicleId = vehicleId;
    go("reserve");
  },
  "confirm-reservation": ({ vehicleId }) => {
    const result = reserveVehicle(store, { studentId: DEMO_STUDENT_ID, vehicleId, holdDurationMs: view.holdDurationMs });
    if (result.ok) view.selectedVehicleId = null;
    showResult(result);
  },
  "cancel-before-confirm": ({ vehicleId }) => {
    view.selectedVehicleId = null;
    showMessage("feedback.reservationNotCreated", { vehicleId });
  },
  "choose-another": () => {
    view.selectedVehicleId = null;
    go("find");
  },
  "sim-conflict": ({ vehicleId }) => showResult(simulateCompetingReservation(store, { vehicleId, holdDurationMs: view.holdDurationMs })),
  "sim-read-error": ({ vehicleId }) => showResult(simulateStateReadError(store, { vehicleId })),
  "pickup-vehicle": ({ vehicleId }) => showResult(pickUpVehicle(store, { studentId: DEMO_STUDENT_ID, vehicleId })),
  "cancel-hold": ({ vehicleId }) => showResult(cancelReservation(store, { studentId: DEMO_STUDENT_ID, vehicleId })),
  "return-vehicle": ({ vehicleId }) => showResult(returnVehicle(store, { vehicleId, destinationHubId: value("#return-hub"), studentId: DEMO_STUDENT_ID })),
  // UC-05
  "cancel-parking": ({ reservationId }) => showResult(cancelParkingReservation(store, { studentId: DEMO_STUDENT_ID, reservationId })),
  // UC-09
  "ev-confirm": () => {
    if (!view.evCheck) return;
    const result = createChargingSession(store, { ...view.evCheck.params });
    if (result.ok) {
      view.evConfirmedId = result.request.id;
      view.evCheck = null;
    } else {
      view.evCheck = { ...view.evCheck, result };
    }
    showResult(result);
  },
  "ev-cancel": () => {
    view.evCheck = null;
    showMessage("feedback.bookingCancelled");
  },
  "ev-recheck": () => checkBooking(),
  "ev-use-slot": ({ hubId, slotStart }) => {
    const start = Number(slotStart);
    $("#ev-hub").value = hubId;
    $("#ev-date").value = start >= dayStartOf(Date.now(), 1) ? "1" : "0";
    render();
    $("#ev-slot").value = String(start);
    checkBooking();
  },
  "ev-new": () => {
    view.evConfirmedId = null;
    render();
  },
  "cancel-charging": ({ requestId }) => showResult(cancelChargingRequest(store, { studentId: DEMO_STUDENT_ID, requestId })),
  // Manage Smart Charging
  "operator-cancel-charging": ({ requestId }) => showResult(cancelChargingRequest(store, { requestId })),
  "reschedule-charging": ({ requestId }) => showResult(rescheduleChargingRequest(store, { requestId })),
  "finish-charging": ({ pointId }) => showResult(finishCharging(store, pointId)),
  // Redistribute Vehicles / Execute Redistribution Task
  "apply-plan": () => showResult(applyCoordination(store, [planRedistribution(store.getState())].filter(Boolean))),
  "cancel-dispatch": ({ orderId }) => showResult(cancelRedistributionOrder(store, { orderId })),
  "start-dispatch": ({ orderId }) => showResult(startRedistributionTask(store, { orderId })),
  "complete-dispatch": ({ orderId }) => showResult(completeRedistributionTask(store, { orderId })),
  // Handle Operational Incident / Resolve Assigned Incident
  "select-incident": ({ incidentId }) => {
    view.selectedIncidentId = incidentId;
    render();
  },
  "classify-incident": ({ incidentId }) => showResult(classifyIncident(store, { incidentId, type: value("#incident-type"), severity: value("#incident-severity") })),
  "mark-unavailable": ({ incidentId }) => showResult(markResourceUnavailable(store, { incidentId })),
  "assign-maintenance": ({ incidentId }) => showResult(assignMaintenance(store, { incidentId })),
  "operational-action": ({ incidentId }) => showResult(applyOperationalAction(store, { incidentId, action: "restore_service" })),
  "start-maintenance": ({ taskId }) => showResult(startMaintenanceTask(store, { taskId })),
  "complete-maintenance": ({ taskId }) => showResult(completeMaintenanceTask(store, { taskId })),
  // Run What-if Simulation
  "save-scenario": () => {
    if (!view.simulation?.ok) return;
    const { result } = view.simulation;
    showResult(saveToLibrary(store, result.params, { critical: result.impact.filter((hub) => hub.status === "critical").length }));
  },
  "apply-recommendations": () => {
    if (!view.simulation?.ok || view.simulationApplied) return;
    const result = applyCoordination(store, view.simulation.result.recommendations);
    if (result.ok) view.simulationApplied = true;
    showResult(result);
  },
  "load-scenario": ({ scenarioId }) => {
    const saved = store.getState().savedScenarios.find((item) => item.id === scenarioId);
    if (!saved) return;
    fillScenarioForm(saved.params);
    showMessage("feedback.scenarioLoaded", { scenarioId });
  },
};

function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (button && !button.disabled && ACTIONS[button.dataset.action]) ACTIONS[button.dataset.action](button.dataset);
}

function toggleAutoUpdates() {
  if (autoUpdateTimer) {
    window.clearInterval(autoUpdateTimer);
    autoUpdateTimer = null;
    view.autoUpdating = false;
    showMessage("feedback.autoPaused");
    return;
  }
  autoUpdateTimer = window.setInterval(() => tickSimulator(store), AUTO_UPDATE_INTERVAL_MS);
  view.autoUpdating = true;
  showMessage("feedback.autoStarted", { seconds: AUTO_UPDATE_INTERVAL_MS / 1000 });
}

// D-018: restore the seed data without reloading; interface preferences are kept.
function resetSimulation() {
  const { interfaceMode, interfaceLanguage } = store.getState();
  Object.assign(view, {
    originTouched: false, selectedHubId: null, selectedVehicleId: null, evCheck: null, evConfirmedId: null,
    selectedIncidentId: null, scenarioFormReady: false, simulation: null, simulationApplied: false, loadedAt: Date.now(),
  });
  $("#search-origin").value = "";
  $("#scenario").value = "";
  store.replace({ ...createInitialState(), interfaceMode, interfaceLanguage });
  showMessage("feedback.resetDone");
}

// Every second: holds that expire are released (UC-04 A3) and charging slots start or end (UC-09).
function tick() {
  const now = Date.now();
  const { vehicles } = expireReservations(store, now);
  if (vehicles.length > 0) showMessage("feedback.holdExpired", { vehicles: vehicles.join(", ") }, false);
  const { completed } = advanceChargingClock(store, now);
  if (completed.length > 0) showMessage("feedback.chargingComplete", { labels: completed.map((item) => item.vehicleLabel).join(", ") });
  ticks += 1;
  if (ticks % RERENDER_EVERY_TICKS === 0) render();
  updateCountdowns();
}

function wireEvents() {
  const on = (selector, type, handler) => $(selector).addEventListener(type, handler);
  on("#toggle-mode", "click", () => setInterfaceMode({
    mode: store.getState().interfaceMode === InterfaceMode.LIGHT ? InterfaceMode.DARK : InterfaceMode.LIGHT,
  }));
  on("#language-select", "change", (event) => setInterfaceMode({ language: event.target.value }));
  on("#simulate-update", "click", () => showResult(tickSimulator(store)));
  on("#toggle-auto-update", "click", toggleAutoUpdates);
  on("#reset-data", "click", resetSimulation);
  on("#reserve-parking", "click", () => showResult(reserveParkingSpace(store, { studentId: DEMO_STUDENT_ID, hubId: value("#parking-hub") })));
  on("#ev-check", "click", checkBooking);
  on("#ev-sim-port-error", "click", () => showResult(simulateStateReadError(store, { hubId: value("#ev-hub") })));
  on("#submit-charging", "click", () => showResult(scheduleSharedVehicleCharging(store, {
    hubId: value("#charging-hub"), vehicleId: value("#charging-vehicle"), upcomingUsage: $("#charging-upcoming").checked,
  })));
  on("#optimize-queue", "click", () => showResult(optimizeQueue(store, value("#charging-hub"))));
  on("#create-dispatch", "click", () => showResult(createRedistributionOrder(store, { vehicleId: value("#dispatch-vehicle"), toHubId: value("#dispatch-to") })));
  on("#save-thresholds", "click", () => showResult(updateAlertThresholds(store, {
    overloadPercent: value("#threshold-overload"), shortageVehicles: value("#threshold-shortage"),
  })));
  on("#report-vehicle-failure", "click", () => recordAndSelect({ resourceType: "vehicle", resourceId: value("#incident-vehicle") }));
  on("#report-charging-failure", "click", () => recordAndSelect({ resourceType: "charging_point", resourceId: value("#incident-charging-point") }));
  on("#run-simulation", "click", runScenario);
  on("#scenario", "change", () => fillScenarioForm({ type: value("#scenario"), ...SCENARIO_DEFAULTS[value("#scenario")] }));
  on("#reset-scenario", "click", () => fillScenarioForm({ type: value("#scenario"), ...SCENARIO_DEFAULTS[value("#scenario")] }));
  on("#toast-close", "click", () => {
    view.feedback = null;
    render();
  });
  for (const selector of ["#search-origin", "#search-destination"]) {
    on(selector, "change", () => {
      if (selector === "#search-origin") view.originTouched = true;
      view.selectedHubId = null;
      render();
    });
  }
  on("#search-radius", "input", () => {
    view.selectedHubId = null;
    render();
  });
  for (const selector of ["#ev-hub", "#ev-date", "#ev-slot"]) {
    on(selector, "change", () => {
      view.evCheck = null;
      view.evConfirmedId = null;
      render();
    });
  }
  for (const selector of ["#vehicle-type", "#parking-hub", "#charging-hub", "#dispatch-from", "#scenario-hub"]) on(selector, "change", render);
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
