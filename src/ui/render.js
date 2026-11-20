// Application shell: navigation, header, status line, toast and page dispatch.
import { $, DEMO_OPERATOR_ID, DEMO_STUDENT_ID, setOptions } from "./dom.js";
import { describe, formatCountdown, formatTime, normalizeLanguage, t } from "./i18n.js";
import { renderChargingPage, renderIncidentsPage, renderNetworkPage, renderWhatIfPage } from "./views/operator.js";
import { renderFindPage, renderServicesPage } from "./views/student.js";

export const PAGES = Object.freeze({
  find: { portal: "student", render: renderFindPage },
  services: { portal: "student", render: renderServicesPage },
  network: { portal: "operator", render: renderNetworkPage },
  charging: { portal: "operator", render: renderChargingPage },
  incidents: { portal: "operator", render: renderIncidentsPage },
  whatif: { portal: "operator", render: renderWhatIfPage },
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
  for (const element of document.querySelectorAll("[data-i18n-title]")) {
    element.setAttribute("title", t(lang, element.dataset.i18nTitle));
  }
}

function renderShell(state, lang, view, page) {
  const portal = PAGES[page].portal;
  for (const link of document.querySelectorAll(".nav-link")) {
    const active = link.dataset.page === page;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  for (const section of document.querySelectorAll(".page")) section.hidden = section.dataset.page !== page;

  $("#page-portal").textContent = t(lang, `portal.${portal}`);
  $("#page-title").textContent = t(lang, `nav.${page}`);
  $("#user-chip").textContent = portal === "student"
    ? t(lang, "user.student", { id: DEMO_STUDENT_ID })
    : t(lang, "user.operator", { id: DEMO_OPERATOR_ID });
  $("#toggle-mode").textContent = t(lang, state.interfaceMode === "dark" ? "mode.toLight" : "mode.toDark");
  $("#toggle-auto-update").textContent = t(lang, view.autoUpdating ? "auto.on" : "auto.off");
  $("#toggle-auto-update").setAttribute("aria-pressed", String(Boolean(view.autoUpdating)));
  $("#language-select").value = lang;
  const update = state.lastUpdate;
  $("#last-update").textContent = `${describe(lang, update)} · ${formatTime(lang, update?.at)}`;

  const hubOptions = state.hubs.map((hub) => ({ value: hub.id, label: hub.name }));
  setOptions("#vehicle-search-hub", hubOptions, t(lang, "find.allHubs"));
  setOptions("#scenario-hub", hubOptions);
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

// `view` holds presentation-only state owned by main.js (page, feedback, What-if result, timers).
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
