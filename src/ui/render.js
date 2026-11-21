// Application shell: navigation, header, status line, toast and page dispatch.
// Pages follow the use cases of the Submission #1 diagram, grouped by actor.
import { DEMO_OPERATOR_ID, DEMO_STUDENT_ID, DISPATCH_STAFF_ID, MAINTENANCE_STAFF_ID } from "../domain/actors.js";
import { $ } from "./dom.js";
import { describe, formatCountdown, formatTime, normalizeLanguage, t } from "./i18n.js";
import { renderIncidentsPage } from "./views/incidents.js";
import { renderChargingPage, renderDashboard, renderRedistributionPage } from "./views/operator.js";
import { renderFindPage } from "./views/search.js";
import { renderDispatchPage, renderMaintenancePage } from "./views/staff.js";
import { renderEvChargingPage, renderParkingPage } from "./views/studentServices.js";
import { renderReservePage } from "./views/trip.js";
import { renderWhatIfPage } from "./views/whatif.js";

export const PAGES = Object.freeze({
  find: { portal: "student", actor: "student", render: renderFindPage },
  reserve: { portal: "student", actor: "student", render: renderReservePage },
  parking: { portal: "student", actor: "student", render: renderParkingPage },
  evcharge: { portal: "student", actor: "student", render: renderEvChargingPage },
  network: { portal: "operator", actor: "operator", render: renderDashboard },
  charging: { portal: "operator", actor: "operator", render: renderChargingPage },
  redistribution: { portal: "operator", actor: "operator", render: renderRedistributionPage },
  incidents: { portal: "operator", actor: "operator", render: renderIncidentsPage },
  whatif: { portal: "operator", actor: "operator", render: renderWhatIfPage },
  dispatch: { portal: "staff", actor: "dispatch", render: renderDispatchPage },
  maintenance: { portal: "staff", actor: "maintenance", render: renderMaintenancePage },
});

const ACTOR_IDS = Object.freeze({
  student: DEMO_STUDENT_ID,
  operator: DEMO_OPERATOR_ID,
  dispatch: DISPATCH_STAFF_ID,
  maintenance: MAINTENANCE_STAFF_ID,
});

export function resolvePage(name) {
  return Object.hasOwn(PAGES, name) ? name : "find";
}

function applyStaticText(lang) {
  document.documentElement.lang = lang;
  for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = t(lang, element.dataset.i18n);
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(lang, element.dataset.i18nAriaLabel));
  }
}

function renderShell(state, lang, view, page) {
  const { portal, actor } = PAGES[page];
  for (const link of document.querySelectorAll(".nav-link")) {
    const active = link.dataset.page === page;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  for (const section of document.querySelectorAll(".page")) section.hidden = section.dataset.page !== page;

  $("#page-portal").textContent = t(lang, `portal.${portal}`);
  $("#page-title").textContent = t(lang, `nav.${page}`);
  $("#user-chip").textContent = t(lang, `user.${actor}`, { id: ACTOR_IDS[actor] });
  $("#toggle-mode").textContent = t(lang, state.interfaceMode === "dark" ? "mode.toLight" : "mode.toDark");
  $("#toggle-auto-update").textContent = t(lang, view.autoUpdating ? "auto.on" : "auto.off");
  $("#toggle-auto-update").setAttribute("aria-pressed", String(Boolean(view.autoUpdating)));
  $("#language-select").value = lang;
  const update = state.lastUpdate;
  $("#last-update").textContent = `${describe(lang, update)} · ${formatTime(lang, update?.at)}`;
}

function renderToast(lang, feedback) {
  const toast = $("#toast");
  if (!feedback) {
    toast.hidden = true;
    return;
  }
  const text = feedback.result
    ? describe(lang, feedback.result) || t(lang, feedback.result.ok ? "feedback.ok" : "feedback.fail")
    : t(lang, feedback.key, feedback.params);
  $("#toast-text").textContent = text;
  toast.className = `toast ${feedback.ok ? "toast-success" : "toast-error"}`;
  toast.hidden = false;
}

// Hold countdowns tick every second without re-rendering the page.
export function updateCountdowns() {
  for (const element of document.querySelectorAll("[data-countdown]")) {
    element.textContent = formatCountdown(Date.parse(element.dataset.countdown) - Date.now());
  }
}

// `view` holds presentation-only state owned by main.js (page, selections, feedback, What-if result).
export function renderApp(state, view) {
  const lang = normalizeLanguage(state.interfaceLanguage);
  const page = resolvePage(view.page);
  document.documentElement.dataset.mode = state.interfaceMode;
  applyStaticText(lang);
  renderShell(state, lang, view, page);
  PAGES[page].render(state, lang, view);
  renderToast(lang, view.feedback);
  updateCountdowns();
}
