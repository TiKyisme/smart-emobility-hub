// Operator portal — UC-17 Run What-if Simulation, UC-18 recommendations (OperatorDashboardUI:
// renderSetupForm, displayResultsAndRecommendations, displayError). Layout of the Submission #2 mockup.
import { SCENARIO_DEFAULTS, ScenarioType, TIME_HORIZONS } from "../../services/simulationService.js";
import { $, actionButton, badge, emptyState, escapeHtml, setHtml, setOptions, toneOf } from "../dom.js";
import { describe, formatDateTime, t } from "../i18n.js";

const hubName = (state, hubId) => state.hubs.find((hub) => hub.id === hubId)?.name ?? hubId;

// OperatorDashboardUI.renderSetupForm: template, target Hub, demand increase, offline ports, horizon.
// The first time, the form takes the defaults of the selected template.
function renderSetupForm(state, lang, view) {
  setOptions("#scenario", Object.values(ScenarioType).map((value) => ({ value, label: t(lang, `scenario.${value}`) })));
  setOptions("#scenario-hub", state.hubs.map((hub) => ({ value: hub.id, label: hub.name })));
  setOptions("#scenario-horizon", TIME_HORIZONS.map((hours) => ({ value: String(hours), label: t(lang, "whatif.horizonOption", { n: hours }) })));
  if (!view.scenarioFormReady) {
    view.scenarioFormReady = true;
    const defaults = SCENARIO_DEFAULTS[$("#scenario").value];
    $("#scenario-hub").value = defaults.hubId;
    $("#scenario-demand").value = String(defaults.demandIncreasePercent);
    $("#scenario-offline").value = String(defaults.offlinePorts);
    $("#scenario-horizon").value = String(defaults.horizonHours);
  }
  const total = state.chargingPoints.filter((point) => point.hubId === $("#scenario-hub").value).length;
  $("#scenario-offline-label").textContent = t(lang, "whatif.offline", { total });
  $("#scenario-offline").max = String(total);
  const saved = state.savedScenarios ?? [];
  setHtml("#saved-scenarios", saved.length === 0 ? "" : `<h3>${escapeHtml(t(lang, "whatif.saved"))}</h3><ul class="list">${saved.slice().reverse().map((item) => `<li data-scenario-id="${escapeHtml(item.id)}">
      <span><span class="code">${escapeHtml(item.id)}</span> ${escapeHtml(t(lang, `scenario.${item.params.type}`))} · ${escapeHtml(hubName(state, item.params.hubId))}
      <span class="muted">· +${escapeHtml(item.params.demandIncreasePercent)}% · ${escapeHtml(formatDateTime(lang, item.savedAt))}</span></span>
      ${actionButton("load-scenario", t(lang, "action.loadScenario"), { "scenario-id": item.id }, "btn-sm btn-secondary")}</li>`).join("")}</ul>`);
}

function percentText(lang, value) {
  return value === null ? t(lang, "impact.noPorts") : `${value}%`;
}

function impactCard(lang, hub, thresholds) {
  const { before, after } = hub;
  const shortage = after.vehicles < 0 ? ` <span class="text-danger">(${escapeHtml(t(lang, "impact.shortage", { count: -after.vehicles }))})</span>` : "";
  const chargingRow = before.chargingDemand > 0 || after.chargingDemand > 0 || after.chargingPercent === null
    ? `<div><dt>${escapeHtml(t(lang, "impact.charging"))}</dt><dd>${escapeHtml(percentText(lang, before.chargingPercent))} → <strong>${escapeHtml(percentText(lang, after.chargingPercent))}</strong></dd></div>`
    : "";
  return `<article class="impact-card impact-${escapeHtml(hub.status)}" data-hub-id="${escapeHtml(hub.hubId)}" data-impact="${escapeHtml(hub.status)}">
    <header><strong>${escapeHtml(hub.hubName)}</strong>${badge(t(lang, `impact.${hub.status}`), toneOf(hub.status))}</header>
    <dl class="details compact">
      <div><dt>${escapeHtml(t(lang, "impact.parking"))}</dt><dd>${before.parkingPercent}% → <strong${after.parkingPercent >= thresholds.overloadPercent ? ' class="text-danger"' : ""}>${after.parkingPercent}%</strong>${after.parkingPercent >= thresholds.overloadPercent
        ? `<span class="hint">${escapeHtml(t(lang, "impact.threshold", { threshold: thresholds.overloadPercent }))}</span>` : ""}</dd></div>
      <div><dt>${escapeHtml(t(lang, "impact.vehicles"))}</dt><dd>${before.vehicles} → <strong>${Math.max(0, after.vehicles)}</strong>${shortage}</dd></div>
      ${chargingRow}
    </dl>
  </article>`;
}

// OperatorDashboardUI.displayResultsAndRecommendations / displayError.
function displayResultsAndRecommendations(lang, view) {
  const outcome = view.simulation;
  if (!outcome) {
    setHtml("#simulation-output", `<article class="card"><div class="card-body">${emptyState(t(lang, "whatif.empty"))}</div></article>`);
    return;
  }
  if (!outcome.ok) {
    setHtml("#simulation-output", `<article class="card"><div class="card-body"><p class="notice notice-error" data-simulation-error="${escapeHtml(outcome.code)}">${escapeHtml(describe(lang, outcome))}</p></div></article>`);
    return;
  }
  const { result } = outcome;
  const actionable = result.recommendations.some((item) => item.kind === "redistribute" || item.kind === "smart_charging");
  setHtml("#simulation-output", `<article class="card">
      <header class="card-header"><h2>${escapeHtml(t(lang, "whatif.impactTitle"))}</h2>
        ${result.liveStateUnchanged ? badge(t(lang, "whatif.liveUnchanged"), "success") : badge(t(lang, "whatif.liveChanged"), "danger")}</header>
      <div class="card-body">
        <p class="muted" data-simulation-notes>${result.notes.map((item) => escapeHtml(describe(lang, item))).join(" ")}</p>
        <div class="impact-grid">${result.hubs.map((hub) => impactCard(lang, hub, result.thresholds)).join("")}</div>
      </div>
    </article>
    <article class="card">
      <header class="card-header"><h2>${escapeHtml(t(lang, "whatif.recTitle"))}</h2></header>
      <div class="card-body">
        <ol class="recommendations">${result.recommendations.map((item) => `<li data-rec="${escapeHtml(item.kind)}"><span class="rec-tag">${escapeHtml(t(lang, `rec.${item.kind}`))}</span> ${escapeHtml(describe(lang, item))}</li>`).join("")}</ol>
        <div class="button-row">
          ${actionButton("save-scenario", t(lang, "action.saveScenario"), {}, "btn-secondary")}
          ${actionButton("apply-recommendations", t(lang, "action.applyRecs"), {}, "", !actionable || view.simulationApplied)}
        </div>
      </div>
    </article>`);
}

export function renderWhatIfPage(state, lang, view) {
  renderSetupForm(state, lang, view);
  displayResultsAndRecommendations(lang, view);
}
