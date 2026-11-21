// FR-20 / UC-10, UC-19 / AT-20: every visible text and service outcome exists in EN and VI; the
// navigation uses the use-case names of the submitted reports.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import * as Status from "../../src/domain/status.js";
import { INCIDENT_TYPES } from "../../src/services/operatorService.js";
import { ScenarioType } from "../../src/services/simulationService.js";
import { PAGES } from "../../src/ui/render.js";
import {
  describe,
  formatCountdown,
  formatDate,
  formatDuration,
  hasText,
  normalizeLanguage,
  statusLabel,
  t,
  textKeys,
} from "../../src/ui/i18n.js";

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
    for (const match of source.matchAll(/"((?:rec|plan)_[a-z_]+)"/g)) codes.add(match[1]);
  }
  for (const match of read("src/data/simulatedData.js").matchAll(/code:\s*"([a-z_]+)"/g)) codes.add(match[1]);
  // Built from a prefix in chargingService.describeRequest.
  for (const prefix of ["session", "charging"]) for (const suffix of ["started", "waiting", "scheduled"]) codes.add(`${prefix}_${suffix}`);
  return [...codes];
}

test("EN and VI dictionaries define exactly the same keys", () => {
  assert.deepEqual([...textKeys("vi")].sort(), [...textKeys("en")].sort());
});

test("Vietnamese is the default interface language (D-011)", () => {
  assert.equal(normalizeLanguage(undefined), "vi");
  assert.equal(normalizeLanguage("fr"), "vi");
});

test("navigation labels are the use-case names of the Submission #1 diagram (English)", () => {
  const expected = {
    find: "Find Suitable Hub / Vehicle",
    reserve: "Reserve Shared Vehicle",
    parking: "Reserve Parking Space",
    evcharge: "Schedule Private EV Charging",
    network: "Monitor Network Status",
    charging: "Manage Smart Charging",
    redistribution: "Redistribute Vehicles",
    incidents: "Handle Operational Incident",
    whatif: "Run What-if Simulation",
    dispatch: "Execute Redistribution Task",
    maintenance: "Resolve Assigned Incident",
  };
  assert.deepEqual(Object.keys(PAGES).sort(), Object.keys(expected).sort());
  for (const [page, name] of Object.entries(expected)) assert.equal(t("en", `nav.${page}`), name);
});

test("every result code produced by the services has EN and VI text", () => {
  const codes = serviceCodes();
  assert.ok(codes.length >= 130, `found ${codes.length} codes`);
  for (const code of codes) assert.ok(hasText(`result.${code}`), `missing result.${code}`);
});

test("every text key used by index.html, main.js and the views exists", () => {
  const keys = new Set([...read("index.html").matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map((match) => match[1]));
  // Any string literal shaped like "group.name" in the UI code is a dictionary key
  // (this also catches keys chosen in ternaries, e.g. t(lang, high ? "a.b" : "c.d")).
  const groups = "action|alerts?|app|auto|charging|col|common|dispatch|dispatchStaff|dist|ev|feedback|find|fleet|history|impact|incident|kpi|maintenance|mode|nav|network|parking|points|portal|range|redistribution|request|reserve|schedule|status|tag|time|top|trip|whatif";
  const keyPattern = new RegExp(`"((?:${groups})\\.[a-zA-Z]+)"`, "g");
  for (const source of uiSources()) for (const match of source.matchAll(keyPattern)) keys.add(match[1]);
  for (const page of Object.keys(PAGES)) keys.add(`nav.${page}`);
  for (const actor of ["student", "operator", "dispatch", "maintenance"]) keys.add(`user.${actor}`);
  for (const portal of ["student", "operator", "staff"]) keys.add(`portal.${portal}`);
  assert.ok(keys.size >= 200, `found ${keys.size} keys`);
  for (const key of keys) assert.ok(hasText(key), `missing ${key}`);
});

test("labels exist for every status, type, scenario, blocked reason, incident type, severity and impact", () => {
  for (const group of [Status.VehicleStatus, Status.ChargingPointStatus, Status.ReservationStatus, Status.ChargingRequestStatus,
    Status.IncidentStatus, Status.MaintenanceTaskStatus, Status.DispatchOrderStatus]) {
    for (const value of Object.values(group)) assert.ok(hasText(`status.${value}`), `missing status.${value}`);
  }
  for (const value of Object.values(Status.VehicleType)) assert.ok(hasText(`vtype.${value}`));
  for (const value of Object.values(Status.IncidentSeverity)) assert.ok(hasText(`severity.${value}`));
  for (const value of Object.values(ScenarioType)) assert.ok(hasText(`scenario.${value}`), `missing scenario.${value}`);
  for (const status of Object.values(Status.VehicleStatus).filter((value) => value !== "available")) {
    assert.ok(hasText(`blocked.vehicle_${status}`), `missing blocked.vehicle_${status}`);
  }
  for (const reason of ["vehicle_moved", "vehicle_missing", "duplicate_vehicle"]) assert.ok(hasText(`blocked.${reason}`));
  for (const types of Object.values(INCIDENT_TYPES)) for (const type of types) assert.ok(hasText(`incident.type.${type}`), type);
  for (const level of ["critical", "warning", "surplus", "normal"]) assert.ok(hasText(`impact.${level}`));
  for (const kind of ["redistribute", "smart_charging", "user_redirect", "monitor"]) assert.ok(hasText(`rec.${kind}`));
  for (const source of ["private", "shared", "what_if", "operator"]) assert.ok(hasText(`source.${source}`));
});

test("describe() renders a result in the selected language and falls back to the English message", () => {
  const result = { ok: true, code: "vehicle_returned", params: { vehicleId: "EB-101", hubName: "KTX Khu A" }, message: "x" };
  assert.equal(describe("en", result), "EB-101 returned to KTX Khu A.");
  assert.equal(describe("vi", result), "Đã trả EB-101 tại KTX Khu A.");
  assert.equal(describe("vi", { code: "not_a_code", message: "Fallback text" }), "Fallback text");
});

test("times, slots, durations and countdowns are readable", () => {
  const text = describe("en", { code: "vehicle_reserved", params: { vehicleId: "EB-101", expiresAt: "2026-11-20T08:15:00.000Z" } });
  assert.match(text, /^EB-101 reserved until \d{2}:\d{2}:\d{2}\.$/);
  const slot = describe("vi", {
    code: "session_scheduled",
    params: { label: "59A", hubName: "Ga Metro ĐHQG", startTime: "2026-11-20T13:00:00.000Z", endTime: "2026-11-20T14:00:00.000Z", slotDate: "2026-11-20T13:00:00.000Z" },
  });
  assert.match(slot, /^Đã đặt lịch: 59A tại Ga Metro ĐHQG, \d{2}:00–\d{2}:00 \d{2}\/\d{2}\.$/);
  assert.match(formatDate("en", "2026-11-20T13:00:00.000Z"), /^\d{2}\/11$/);
  assert.equal(formatDuration("en", 15 * 60 * 1000), "15 minutes");
  assert.equal(formatDuration("vi", 30 * 1000), "30 giây");
  assert.equal(formatCountdown(15 * 60 * 1000), "15:00");
  assert.equal(formatCountdown(61_000), "01:01");
  assert.equal(formatCountdown(-5), "00:00");
  assert.equal(formatCountdown(3_600_000), "1:00:00");
  assert.equal(statusLabel("vi", "in_progress"), "Đang xử lý");
  assert.equal(t("en", "whatif.horizonOption", { n: 1 }), "Next 1 hour");
});
