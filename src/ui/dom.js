// Small DOM helpers shared by the views. No framework: plain template strings + delegation.

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
    .map((option) => `<option value="${escapeHtml(option.value)}"${option.disabled ? " disabled" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  if (lastMarkup.get(select) !== html) {
    lastMarkup.set(select, html);
    select.innerHTML = html;
  }
  const usable = options.filter((option) => !option.disabled);
  if (usable.some((option) => option.value === previous)) select.value = previous;
  else if (placeholder !== null) select.value = "";
  else if (usable[0]) select.value = usable[0].value;
}

// Sets an input's value from state without overwriting what the user is typing.
export function setInputValue(selector, value) {
  const input = $(selector);
  if (input && document.activeElement !== input && input.value !== String(value)) input.value = String(value);
}

export function numberValue(selector, fallback = 0) {
  const raw = $(selector)?.value;
  const value = Number(raw);
  return raw === "" || !Number.isFinite(value) ? fallback : value;
}

const TONES = Object.freeze({
  available: "success",
  completed: "success",
  resolved: "success",
  surplus: "success",
  reserved: "warning",
  in_use: "warning",
  active: "warning",
  assigned: "warning",
  warning: "warning",
  charging: "info",
  scheduled: "info",
  occupied: "info",
  in_progress: "info",
  in_transit: "info",
  queued: "neutral",
  cancelled: "neutral",
  normal: "neutral",
  failed: "danger",
  unavailable: "danger",
  expired: "danger",
  new: "danger",
  critical: "danger",
});

export function toneOf(status) {
  return TONES[status] ?? "neutral";
}

export function badge(text, tone = "neutral") {
  return `<span class="badge badge-${tone}">${escapeHtml(text)}</span>`;
}

export function statusBadge(status, label) {
  return `<span class="badge badge-${toneOf(status)}" data-status="${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

export function meter(ratio, tone = "accent") {
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return `<span class="meter" aria-hidden="true"><span class="meter-fill meter-${tone}" style="width:${percent}%"></span></span>`;
}

export function batteryCell(battery) {
  const tone = battery < 20 ? "danger" : battery < 50 ? "warning" : "success";
  return `<span class="battery">${meter(battery / 100, tone)}<span class="num">${escapeHtml(battery)}%</span></span>`;
}

export function emptyState(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

// Labelled values (reservation details, incident details, booking summary).
export function detailList(rows) {
  return `<dl class="details">${rows
    .filter(Boolean)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`)
    .join("")}</dl>`;
}

// A button handled by the delegated [data-action] listener in main.js.
export function actionButton(action, label, data = {}, variant = "", disabled = false) {
  const attributes = Object.entries(data).map(([key, value]) => ` data-${key}="${escapeHtml(value)}"`).join("");
  return `<button type="button" class="btn${variant ? ` ${variant}` : ""}" data-action="${escapeHtml(action)}"${attributes}${disabled ? " disabled" : ""}>${escapeHtml(label)}</button>`;
}

export function table(headers, rows) {
  return `<table class="table"><thead><tr>${headers.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}
