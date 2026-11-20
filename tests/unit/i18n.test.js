// FR-20 / UC-10, UC-19 / AT-20: every visible text and service outcome exists in EN and VI.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import * as Status from "../../src/domain/status.js";
import { ScenarioType } from "../../src/services/simulationService.js";
import { describe, formatCountdown, formatDuration, hasText, normalizeLanguage, statusLabel, t, textKeys } from "../../src/ui/i18n.js";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const uiSources = () => [
  read("src/main.js"),
  ...readdirSync(new URL("src/ui/", root), { recursive: true })
    .filter((file) => String(file).endsWith(".js"))
    .map((file) => read(`src/ui/${String(file).replaceAll("\\", "/")}`)),
];

function serviceCodes() {
  const codes = new Set();
  for (const file of readdirSync(new URL("src/services/", root))) {
    const source = read(`src/services/${file}`);
    for (const match of source.matchAll(/(?:failure|success|note)\(\s*"([a-z_]+)"/g)) codes.add(match[1]);
    for (const match of source.matchAll(/code:\s*"([a-z_]+)"/g)) codes.add(match[1]);
  }
  for (const match of read("src/data/simulatedData.js").matchAll(/code:\s*"([a-z_]+)"/g)) codes.add(match[1]);
  return [...codes];
}

test("EN and VI dictionaries define exactly the same keys", () => {
  assert.deepEqual([...textKeys("vi")].sort(), [...textKeys("en")].sort());
});

test("Vietnamese is the default interface language (D-011)", () => {
  assert.equal(normalizeLanguage(undefined), "vi");
  assert.equal(normalizeLanguage("fr"), "vi");
});

test("every result code produced by the services has EN and VI text", () => {
  const codes = serviceCodes();
  assert.ok(codes.length >= 70, `found ${codes.length} codes`);
  for (const code of codes) assert.ok(hasText(`result.${code}`), `missing result.${code}`);
});

test("every text key used by index.html, main.js and the views exists", () => {
  const keys = new Set([...read("index.html").matchAll(/data-i18n(?:-aria-label|-title)?="([^"]+)"/g)].map((match) => match[1]));
  // Any string literal shaped like "group.name" in the UI code is a dictionary key
  // (this also catches keys chosen in ternaries, e.g. t(lang, isPrivate ? "a.b" : "c.d")).
  const groups = "action|app|auto|blocked|charging|col|common|feedback|find|fleet|impact|incident|kpi|mode|nav|network|parking|points|portal|queue|redistribution|request|risk|status|tile|time|top|trip|user|vehicle|whatif";
  const keyPattern = new RegExp(`"((?:${groups})\\.[a-zA-Z]+)"`, "g");
  for (const source of uiSources()) {
    for (const match of source.matchAll(keyPattern)) keys.add(match[1]);
  }
  for (const page of ["find", "services", "network", "charging", "incidents", "whatif"]) keys.add(`nav.${page}`);
  for (const portal of ["student", "operator"]) keys.add(`portal.${portal}`);
  assert.ok(keys.size >= 120, `found ${keys.size} keys`);
  for (const key of keys) assert.ok(hasText(key), `missing ${key}`);
});

test("labels exist for every status, scenario, blocked reason and incident type", () => {
  for (const group of [Status.VehicleStatus, Status.ChargingPointStatus, Status.ReservationStatus, Status.ChargingRequestStatus, Status.IncidentStatus]) {
    for (const value of Object.values(group)) assert.ok(hasText(`status.${value}`), `missing status.${value}`);
  }
  for (const value of Object.values(ScenarioType)) assert.ok(hasText(`scenario.${value}`), `missing scenario.${value}`);
  for (const reason of ["vehicle_reserved", "vehicle_in_use", "vehicle_failed", "vehicle_charging", "vehicle_moved", "vehicle_missing", "duplicate_vehicle"]) {
    assert.ok(hasText(`blocked.${reason}`), `missing blocked.${reason}`);
  }
  for (const type of ["vehicle_failure", "charging_point_unavailable"]) assert.ok(hasText(`incident.${type}`));
});

test("describe() renders a result in the selected language and falls back to the English message", () => {
  const result = { ok: true, code: "vehicle_returned", params: { vehicleId: "EV-01", hubName: "Dormitory Hub" }, message: "x" };
  assert.equal(describe("en", result), "EV-01 returned to Dormitory Hub.");
  assert.equal(describe("vi", result), "Đã trả EV-01 tại Dormitory Hub.");
  assert.equal(describe("vi", { code: "not_a_code", message: "Fallback text" }), "Fallback text");
});

test("times, durations and countdowns are readable", () => {
  const text = describe("en", { code: "vehicle_reserved", params: { vehicleId: "EV-01", expiresAt: "2026-11-20T08:15:00.000Z" } });
  assert.match(text, /^EV-01 reserved until \d{2}:\d{2}:\d{2}\.$/);
  assert.equal(formatDuration("en", 15 * 60 * 1000), "15 minutes");
  assert.equal(formatDuration("vi", 30 * 1000), "30 giây");
  assert.equal(formatCountdown(15 * 60 * 1000), "15:00");
  assert.equal(formatCountdown(61_000), "01:01");
  assert.equal(formatCountdown(-5), "00:00");
  assert.equal(formatCountdown(3_600_000), "1:00:00");
  assert.equal(statusLabel("vi", "in_use"), "Đang sử dụng");
  assert.equal(t("en", "redistribution.detail", { count: 1 }), "Suggested: up to 1 vehicle, based on current capacity.");
});
