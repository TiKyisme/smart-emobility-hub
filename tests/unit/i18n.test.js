// FR-20 / UC-10, UC-19 / AT-20: every visible text and service outcome exists in EN and VI.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import * as Status from "../../src/domain/status.js";
import { ScenarioType } from "../../src/services/simulationService.js";
import { describe, formatDuration, hasText, statusLabel, t, textKeys } from "../../src/ui/i18n.js";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

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

test("every result code produced by the services has EN and VI text", () => {
  const codes = serviceCodes();
  assert.ok(codes.length >= 50, `found ${codes.length} codes`);
  for (const code of codes) assert.ok(hasText(`result.${code}`), `missing result.${code}`);
});

test("every data-i18n key used by index.html exists", () => {
  const html = read("index.html");
  const keys = [...html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(keys.length >= 60, `found ${keys.length} keys`);
  for (const key of keys) assert.ok(hasText(key), `missing ${key}`);
});

test("labels exist for every status, scenario and blocked reason", () => {
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
  assert.equal(describe("en", result), "EV-01 returned to Dormitory Hub; the reservation is completed.");
  assert.equal(describe("vi", result), "Đã trả EV-01 tại Dormitory Hub; lượt đặt xe đã hoàn tất.");
  assert.equal(describe("vi", { code: "not_a_code", message: "Fallback text" }), "Fallback text");
  assert.equal(describe("fr", result), describe("en", result), "unsupported languages fall back to English");
});

test("time parameters are shown as clock time and durations are readable", () => {
  const text = describe("en", { code: "vehicle_reserved", params: { vehicleId: "EV-01", studentId: "S", expiresAt: "2026-11-20T08:15:00.000Z" } });
  assert.match(text, /^EV-01 reserved for S until \d{1,2}:\d{2}:\d{2}/);
  assert.equal(formatDuration("en", 15 * 60 * 1000), "15 minutes");
  assert.equal(formatDuration("vi", 30 * 1000), "30 giây");
  assert.equal(statusLabel("vi", "in_use"), "Đang sử dụng");
  assert.equal(t("en", "schedule.control", { free: 1, queued: 2 }), "1 free point · 2 queued");
});
