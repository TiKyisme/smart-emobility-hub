// Small DOM helpers shared by the views. No framework: plain template strings + delegation.

// D-003: fixed demo identities; authentication and accounts are out of scope.
export const DEMO_STUDENT_ID = "STUDENT-DEMO";
export const DEMO_OPERATOR_ID = "OPERATOR-DEMO";

export function $(selector) {
  return document.querySelector(selector);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Re-renders replace markup only when it actually changed, so an open <select>
// or a focused control is not reset by an unrelated update (e.g. a simulator tick).
const lastMarkup = new WeakMap();

export function setHtml(target, html) {
  const element = typeof target === "string" ? $(target) : target;
  if (!element || lastMarkup.get(element) === html) return;
  lastMarkup.set(element, html);
  element.innerHTML = html;
}

export function setOptions(target, options, placeholder = null) {
  const select = typeof target === "string" ? $(target) : target;
  if (!select) return;
  const previous = select.value;
  const html = (placeholder === null ? "" : `<option value="">${escapeHtml(placeholder)}</option>`) + options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  if (lastMarkup.get(select) !== html) {
    lastMarkup.set(select, html);
    select.innerHTML = html;
  }
  if (options.some((option) => option.value === previous)) select.value = previous;
  else if (placeholder !== null) select.value = "";
  else if (options[0]) select.value = options[0].value;
}

export function numberValue(selector, fallback = 0) {
  const value = Number($(selector)?.value);
  return Number.isFinite(value) ? value : fallback;
}

const TONES = Object.freeze({
  available: "success",
  completed: "success",
  resolved: "success",
  reserved: "warning",
  in_use: "warning",
  active: "warning",
  charging: "info",
  scheduled: "info",
  occupied: "info",
  queued: "neutral",
  cancelled: "neutral",
  failed: "danger",
  unavailable: "danger",
  expired: "danger",
  open: "danger",
});

export function badge(text, tone = "neutral") {
  return `<span class="badge badge-${tone}">${escapeHtml(text)}</span>`;
}

export function statusBadge(status, label) {
  return `<span class="badge badge-${TONES[status] ?? "neutral"}" data-status="${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

export function meter(ratio, tone = "accent") {
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return `<span class="meter" aria-hidden="true"><span class="meter-fill meter-${tone}" style="width:${percent}%"></span></span>`;
}

export function batteryCell(battery) {
  const tone = battery < 30 ? "danger" : battery < 60 ? "warning" : "success";
  return `<span class="battery">${meter(battery / 100, tone)}<span class="num">${escapeHtml(battery)}%</span></span>`;
}

export function emptyState(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}
