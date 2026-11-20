// FR-16..FR-18 / UC-17, UC-18 / AT-16..AT-18
import assert from "node:assert/strict";
import { test } from "node:test";
import { reserveVehicle } from "../../src/services/reservationService.js";
import { runWhatIf, ScenarioType } from "../../src/services/simulationService.js";
import { DORM, freshStore, METRO, T0 } from "./helpers.js";

const occupied = (state, hubId) => state.hubs.find((item) => item.id === hubId).occupiedParking;

test("AT-16..AT-18: every scenario runs on a copy, reports impact and recommendations, and keeps live state", () => {
  const store = freshStore();
  const live = store.getState();
  const before = structuredClone(live);

  for (const type of Object.values(ScenarioType)) {
    const result = runWhatIf(live, { type, hubId: METRO });
    assert.deepEqual(live, before, `${type} must not mutate the live state`);
    assert.equal(result.liveStateUnchanged, true);
    assert.notDeepEqual(result.simulatedState, before, `${type} must change the hypothetical state`);
    assert.ok(result.recommendations.length >= 1);
    for (const item of [...result.recommendations, ...result.notes]) assert.ok(item.code && item.message);
    assert.ok(result.impact.parking && result.impact.vehicles && result.impact.charging);
  }
});

test("scenario effects match their description", () => {
  const live = freshStore().getState();

  const surge = runWhatIf(live, { type: ScenarioType.METRO_ARRIVAL_SURGE, hubId: DORM });
  assert.equal(occupied(surge.simulatedState, METRO), occupied(live, METRO) + 3, "the Metro surge always targets Metro");

  const full = runWhatIf(live, { type: ScenarioType.HUB_FULL, hubId: DORM });
  assert.equal(occupied(full.simulatedState, DORM), 10);
  assert.equal(full.impact.parking.topRiskAfter, "Dormitory Hub");
  assert.ok(full.recommendations.some((item) => item.code === "rec_redirect"));

  // Three extra requests at Metro: the two free chargers are allocated by priority, one waits.
  const demand = runWhatIf(live, { type: ScenarioType.CHARGING_DEMAND_SURGE, hubId: METRO });
  assert.equal(demand.impact.charging.queuedAfter - demand.impact.charging.queuedBefore, 1);
  assert.equal(demand.impact.charging.availablePointsBefore - demand.impact.charging.availablePointsAfter, 2);
  assert.deepEqual(
    demand.simulatedState.chargingRequests.filter((item) => item.status === "scheduled" && item.hubId === METRO).map((item) => item.id).sort(),
    ["SIM-CHARGE-01", "SIM-CHARGE-03"],
    "the two requests marked needed-soon are served first",
  );
  assert.ok(demand.recommendations.some((item) => item.code === "rec_charging"));

  const failures = runWhatIf(live, { type: ScenarioType.CHARGING_POINT_FAILURES, hubId: DORM });
  assert.equal(failures.notes[0].params.pointId, "CP-03", "the focus Hub's charger fails first");
  assert.equal(failures.simulatedState.vehicles.find((item) => item.id === "EV-04").status, "available", "its session is interrupted");

  const concentration = runWhatIf(live, { type: ScenarioType.VEHICLE_CONCENTRATION, hubId: METRO });
  assert.equal(concentration.impact.vehicles.moved, 2);
  assert.equal(concentration.simulatedState.vehicles.filter((item) => item.hubId === METRO).length, 4);
});

test("FR-16: the simulation starts from the current live state, including earlier live actions", () => {
  const store = freshStore();
  reserveVehicle(store, { studentId: "A", vehicleId: "EV-01", now: T0 });
  const result = runWhatIf(store.getState(), { type: ScenarioType.VEHICLE_CONCENTRATION, hubId: DORM });

  assert.equal(result.impact.vehicles.availableBefore, 4, "the reserved EV-01 is not available in the starting state");
  assert.equal(result.simulatedState.vehicles.find((item) => item.id === "EV-01").status, "reserved");
  assert.equal(store.getState().vehicles.find((item) => item.id === "EV-01").hubId, METRO);
});

test("an unknown scenario is reported, not silently treated as a supported one", () => {
  const result = runWhatIf(freshStore().getState(), { type: "unknown", hubId: METRO });
  assert.deepEqual(result.notes.map((item) => item.code), ["note_unknown"]);
  assert.equal(result.liveStateUnchanged, true);
});
