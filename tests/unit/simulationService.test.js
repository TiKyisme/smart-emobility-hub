// UC-17 Run What-if Simulation / UC-18 recommendations (FR-16..FR-18, ADR-06, D-013).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ChargingPointStatus, DispatchOrderStatus } from "../../src/domain/status.js";
import {
  applyCoordination,
  requestSimulation,
  saveToLibrary,
  SCENARIO_DEFAULTS,
  ScenarioType,
  validateParams,
} from "../../src/services/simulationService.js";
import { DORM, DORM_B, freshStore, METRO, point, T0 } from "./helpers.js";

const run = (state, type, overrides = {}) => requestSimulation(state, { type, ...SCENARIO_DEFAULTS[type], ...overrides }, { now: T0 });

test("validateParams: demand not negative, whole numbers, offline ports up to the Hub total, known horizon", () => {
  const state = freshStore().getState();
  const base = { type: ScenarioType.HUB_FULL, hubId: METRO, demandIncreasePercent: 20, offlinePorts: 0, horizonHours: 2 };
  assert.equal(validateParams(state, { ...base, type: "unknown" }).code, "scenario_unknown");
  assert.equal(validateParams(state, { ...base, hubId: "NOPE" }).code, "hub_not_found");
  assert.equal(validateParams(state, { ...base, demandIncreasePercent: -1 }).code, "param_demand_invalid");
  assert.equal(validateParams(state, { ...base, demandIncreasePercent: 2.5 }).code, "param_demand_invalid");
  assert.equal(validateParams(state, { ...base, demandIncreasePercent: "" }).code, "param_demand_invalid");
  assert.equal(validateParams(state, { ...base, offlinePorts: 3 }).code, "param_ports_invalid", "the Metro Hub has 2 ports");
  assert.equal(validateParams(state, { ...base, horizonHours: 3 }).code, "param_horizon_invalid");
  assert.deepEqual(validateParams(state, base).params, base);
});

test("every template runs on a copy: the live state is byte-identical afterwards (FR-16, D-013)", () => {
  const store = freshStore();
  const before = JSON.stringify(store.getState());
  for (const type of Object.values(ScenarioType)) {
    const outcome = run(store.getState(), type);
    assert.equal(outcome.code, "simulation_done", type);
    assert.equal(outcome.result.liveStateUnchanged, true, type);
    assert.ok(outcome.result.hubs.some((card) => card.target), `${type} shows the target Hub`);
    assert.ok(outcome.result.hubs.length <= 4);
    assert.ok(outcome.result.recommendations.length > 0);
  }
  assert.equal(JSON.stringify(store.getState()), before);
});

test("peak-hour surge at the Metro station: critical bottleneck, vehicles redistributed from the surplus Hub, riders redirected", () => {
  const { result } = run(freshStore().getState(), ScenarioType.METRO_ARRIVAL_SURGE);
  const metro = result.impact.find((card) => card.hubId === METRO);
  assert.equal(metro.status, "critical");
  assert.equal(metro.before.parkingPercent, 50);
  assert.ok(metro.after.parkingPercent >= 85);
  assert.ok(metro.after.vehicles < 0, "vehicle shortage");
  const redistribute = result.recommendations.find((item) => item.kind === "redistribute");
  assert.equal(redistribute.fromHubId, DORM_B, "KTX Khu B has the most movable vehicles");
  assert.equal(redistribute.toHubId, METRO);
  assert.ok(redistribute.count >= 1);
  assert.ok(result.recommendations.some((item) => item.kind === "user_redirect"));
  assert.equal(result.hubs.find((card) => card.hubId === DORM_B).status, "surplus");
});

test("a Hub reaching full capacity: over the threshold and a redirect to the nearest Hub with space", () => {
  const { result } = run(freshStore().getState(), ScenarioType.HUB_FULL);
  const dorm = result.impact.find((card) => card.hubId === DORM);
  assert.equal(dorm.status, "critical");
  assert.ok(dorm.after.parkingPercent > 100);
  const redirect = result.recommendations.find((item) => item.kind === "user_redirect");
  assert.equal(redirect.code, "rec_redirect");
  assert.notEqual(redirect.hubId, DORM);
});

test("charging demand surge and port failures: charging load and a [Smart Charging] recommendation", () => {
  const state = freshStore().getState();
  const surge = run(state, ScenarioType.CHARGING_DEMAND_SURGE).result;
  const metro = surge.impact.find((card) => card.hubId === METRO);
  assert.ok(metro.after.chargingPercent > 100);
  assert.equal(metro.status, "critical");
  assert.ok(surge.recommendations.some((item) => item.kind === "smart_charging"));
  const failures = run(state, ScenarioType.CHARGING_POINT_FAILURES, { offlinePorts: 2 }).result;
  assert.equal(failures.simulatedState.chargingPoints.filter((item) => item.hubId === METRO && item.status === ChargingPointStatus.UNAVAILABLE).length, 2);
  assert.ok(failures.recommendations.some((item) => item.kind === "smart_charging"));
  assert.equal(state.chargingPoints.find((item) => item.id === "CP-01").status, ChargingPointStatus.AVAILABLE, "live port untouched");
});

test("vehicle concentration: the target Hub overflows and vehicles are sent away", () => {
  const { result } = run(freshStore().getState(), ScenarioType.VEHICLE_CONCENTRATION);
  const target = result.impact.find((card) => card.target);
  assert.ok(target.after.parkingPercent >= 85);
  const recommendation = result.recommendations.find((item) => item.kind === "redistribute");
  assert.equal(recommendation.fromHubId, target.hubId);
});

test("timeout branch and saving a scenario to the library", () => {
  const store = freshStore();
  const params = { type: ScenarioType.HUB_FULL, ...SCENARIO_DEFAULTS[ScenarioType.HUB_FULL] };
  assert.equal(requestSimulation(store.getState(), params, { now: T0, timeoutMs: -1 }).code, "simulation_timeout");
  const saved = saveToLibrary(store, params, { critical: 1, now: T0 });
  assert.equal(saved.code, "scenario_saved");
  assert.deepEqual(store.getState().savedScenarios[0].params, params);
  assert.equal(saveToLibrary(store, { ...params, demandIncreasePercent: -5 }).code, "param_demand_invalid");
});

test("Apply recommendations creates live tasks only when the operator asks (FR-18)", () => {
  const store = freshStore();
  const { result } = run(store.getState(), ScenarioType.METRO_ARRIVAL_SURGE);
  assert.equal(store.getState().dispatchOrders.length, 0, "running the simulation created nothing");
  const applied = applyCoordination(store, result.recommendations, T0);
  assert.equal(applied.code, "coordination_applied");
  const orders = store.getState().dispatchOrders;
  assert.ok(orders.length >= 1);
  assert.ok(orders.every((order) => order.toHubId === METRO && order.status === DispatchOrderStatus.ASSIGNED));
  assert.equal(point(store, "CP-01").status, ChargingPointStatus.AVAILABLE);
});
