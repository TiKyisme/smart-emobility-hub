import { applyChargingSchedule, schedulePrivateEvCharging, submitChargingRequest } from "./services/chargingService.js";
import { createInitialState } from "./data/simulatedData.js";
import { coordinateRedistribution, reportChargingPointUnavailable, reportVehicleFailure, suggestRedistribution } from "./services/operatorService.js";
import { pickUpVehicle, reserveParking, reserveVehicle, returnVehicle } from "./services/reservationService.js";
import { runWhatIf } from "./services/simulationService.js";
import { applySimulatedUpdate } from "./services/simulatorService.js";
import { createStore } from "./state/store.js";
import { DEMO_STUDENT_ID, renderApp, renderSimulationResult } from "./ui/render.js";

const store = createStore(createInitialState());
let autoUpdateTimer = null;

function showFeedback(message, ok = true) {
  const feedback = document.querySelector("#feedback");
  feedback.textContent = message;
  feedback.className = `feedback ${ok ? "feedback-success" : "feedback-error"}`;
}

function selectedValue(id) {
  return document.querySelector(`#${id}`)?.value ?? "";
}

function numberValue(id, fallback = 0) {
  const value = Number(selectedValue(id));
  return Number.isFinite(value) ? value : fallback;
}

function handleResult(result) {
  showFeedback(result.message ?? (result.ok ? "Operation completed." : "Operation could not be completed."), result.ok);
}

function handleResourceAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  let result;
  if (action === "reserve-vehicle") {
    result = reserveVehicle(store, { studentId: DEMO_STUDENT_ID, vehicleId: button.dataset.vehicleId });
  } else if (action === "pickup-vehicle") {
    result = pickUpVehicle(store, { studentId: DEMO_STUDENT_ID, vehicleId: button.dataset.vehicleId });
  } else if (action === "return-vehicle") {
    const destinationHubId = button.closest(".inline-action")?.querySelector("select")?.value;
    result = returnVehicle(store, { vehicleId: button.dataset.vehicleId, destinationHubId });
  } else if (action === "coordinate-redistribution") {
    result = coordinateRedistribution(store, suggestRedistribution(store.getState()));
  } else if (action === "schedule-hub") {
    const schedule = applyChargingSchedule(store, button.dataset.hubId);
    result = {
      ok: true,
      message: schedule.scheduled.length > 0
        ? `Charging schedule applied: ${schedule.scheduled.length} request${schedule.scheduled.length === 1 ? "" : "s"} assigned; ${schedule.waiting.length} waiting.`
        : "No queued charging request can be assigned at this Hub.",
    };
  }

  if (result) handleResult(result);
}

function submitStudentCharging() {
  const result = submitChargingRequest(store, {
    studentId: DEMO_STUDENT_ID,
    hubId: selectedValue("charging-hub"),
    vehicleId: selectedValue("charging-vehicle"),
    battery: numberValue("charging-battery", null),
    upcomingUsage: document.querySelector("#upcoming-usage").checked,
  });
  handleResult(result);
}

function submitPrivateCharging() {
  const label = selectedValue("private-vehicle-label").trim() || "Private EV";
  const result = schedulePrivateEvCharging(store, {
    studentId: DEMO_STUDENT_ID,
    hubId: selectedValue("charging-hub"),
    vehicleLabel: label,
    battery: numberValue("charging-battery", null),
    upcomingUsage: document.querySelector("#upcoming-usage").checked,
  });
  handleResult(result);
}

function toggleAutoUpdates() {
  const button = document.querySelector("#toggle-auto-update");
  if (autoUpdateTimer) {
    window.clearInterval(autoUpdateTimer);
    autoUpdateTimer = null;
    button.textContent = "Start auto updates";
    showFeedback("Automatic simulated updates paused.");
    return;
  }

  autoUpdateTimer = window.setInterval(() => applySimulatedUpdate(store), 15000);
  button.textContent = "Stop auto updates";
  showFeedback("Automatic simulated updates started; the next update will arrive in 15 seconds.");
}

function wireEvents() {
  document.querySelector("#toggle-mode").addEventListener("click", () => {
    store.update((state) => {
      state.interfaceMode = state.interfaceMode === "light" ? "dark" : "light";
    });
  });

  document.querySelector("#simulate-update").addEventListener("click", () => {
    const result = applySimulatedUpdate(store);
    showFeedback(result.message);
  });
  document.querySelector("#toggle-auto-update").addEventListener("click", toggleAutoUpdates);
  document.querySelector("#reserve-parking").addEventListener("click", () => {
    handleResult(reserveParking(store, {
      studentId: DEMO_STUDENT_ID,
      hubId: selectedValue("parking-hub"),
      vehicleType: "private",
    }));
  });
  document.querySelector("#submit-charging").addEventListener("click", submitStudentCharging);
  document.querySelector("#schedule-private").addEventListener("click", submitPrivateCharging);
  document.querySelector("#report-vehicle-failure").addEventListener("click", () => {
    handleResult(reportVehicleFailure(store, selectedValue("incident-vehicle")));
  });
  document.querySelector("#report-charging-failure").addEventListener("click", () => {
    handleResult(reportChargingPointUnavailable(store, selectedValue("incident-charging-point")));
  });
  document.querySelector("#run-simulation").addEventListener("click", () => {
    renderSimulationResult(runWhatIf(store.getState(), {
      type: selectedValue("scenario"),
      hubId: selectedValue("scenario-hub"),
    }));
    showFeedback("Hypothetical scenario evaluated. Live network state was not changed.");
  });

  document.querySelector("#charging-type").addEventListener("change", () => renderApp(store.getState()));
  document.querySelector("#charging-hub").addEventListener("change", () => renderApp(store.getState()));
  document.querySelector("#parking-hub").addEventListener("change", () => renderApp(store.getState()));
  document.querySelector("#vehicle-search-hub").addEventListener("change", () => renderApp(store.getState()));
  document.querySelector("#minimum-battery").addEventListener("input", () => renderApp(store.getState()));
  document.querySelector("#minimum-parking").addEventListener("input", () => renderApp(store.getState()));
  document.querySelector("#charging-required").addEventListener("change", () => renderApp(store.getState()));
  document.addEventListener("click", handleResourceAction);
}

store.subscribe(renderApp);
renderApp(store.getState());
wireEvents();
