import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadStore,
  saveStore,
  getActivePlan,
  addPlan,
  removePlan,
  renamePlan,
  switchPlan,
  createEmptyPlan,
  DEFAULT_PLAN_NAME,
  INITIAL_ROW_COUNT,
} from "./store.js";

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _dump: () => Object.fromEntries(data),
  };
}

test("createEmptyPlan produces unique ids and the default shape", () => {
  const a = createEmptyPlan();
  const b = createEmptyPlan("Custom");
  assert.notEqual(a.id, b.id);
  assert.equal(a.name, DEFAULT_PLAN_NAME);
  assert.equal(b.name, "Custom");
  assert.equal(a.rowCount, INITIAL_ROW_COUNT);
  assert.deepEqual(a.times, []);
  assert.deepEqual(a.entries, {});
});

test("loadStore creates a fresh single-plan store when nothing is persisted", () => {
  const storage = createMemoryStorage();
  const store = loadStore(storage);
  assert.equal(store.planOrder.length, 1);
  assert.equal(store.plans[store.activePlanId].name, DEFAULT_PLAN_NAME);
});

test("loadStore returns a previously saved multi-plan store unchanged", () => {
  const storage = createMemoryStorage();
  const store = loadStore(storage);
  addPlan(store, createEmptyPlan("Zweitplan"));
  saveStore(store, storage);

  const reloaded = loadStore(storage);
  assert.equal(reloaded.planOrder.length, 2);
  assert.equal(reloaded.activePlanId, store.activePlanId);
});

test("loadStore migrates the legacy single-plan format into one plan", () => {
  const storage = createMemoryStorage({
    "stundenplan-data-v1": JSON.stringify({
      rowCount: 12,
      times: ["08:00–08:45"],
      entries: { "0_Montag": { title: "Alt", description: "", link: "" } },
    }),
  });

  const store = loadStore(storage);
  assert.equal(store.planOrder.length, 1);
  const plan = getActivePlan(store);
  assert.equal(plan.name, DEFAULT_PLAN_NAME);
  assert.equal(plan.rowCount, 12);
  assert.deepEqual(plan.times, ["08:00–08:45"]);
  assert.deepEqual(plan.entries, { "0_Montag": { title: "Alt", description: "", link: "" } });
});

test("loadStore ignores a corrupt legacy value and falls back to an empty plan", () => {
  const storage = createMemoryStorage({ "stundenplan-data-v1": "{not json" });
  const store = loadStore(storage);
  const plan = getActivePlan(store);
  assert.equal(plan.rowCount, INITIAL_ROW_COUNT);
  assert.deepEqual(plan.entries, {});
});

test("addPlan appends and switches the active plan", () => {
  const store = loadStore(createMemoryStorage());
  const firstId = store.activePlanId;
  const newPlan = createEmptyPlan("Neu");
  addPlan(store, newPlan);
  assert.equal(store.planOrder.length, 2);
  assert.equal(store.activePlanId, newPlan.id);
  assert.equal(store.planOrder[0], firstId);
});

test("removePlan refuses to delete the last remaining plan", () => {
  const store = loadStore(createMemoryStorage());
  assert.throws(() => removePlan(store, store.activePlanId), /letzte/);
});

test("removePlan drops the plan and reassigns active plan if needed", () => {
  const store = loadStore(createMemoryStorage());
  const firstId = store.activePlanId;
  const second = createEmptyPlan("Zweit");
  addPlan(store, second); // active is now `second`

  removePlan(store, second.id);
  assert.equal(store.planOrder.length, 1);
  assert.equal(store.activePlanId, firstId);
  assert.equal(store.plans[second.id], undefined);
});

test("renamePlan updates only the targeted plan", () => {
  const store = loadStore(createMemoryStorage());
  const id = store.activePlanId;
  renamePlan(store, id, "Neuer Name");
  assert.equal(store.plans[id].name, "Neuer Name");
});

test("switchPlan only switches to a plan that exists", () => {
  const store = loadStore(createMemoryStorage());
  const originalActive = store.activePlanId;
  switchPlan(store, "does-not-exist");
  assert.equal(store.activePlanId, originalActive);

  const second = createEmptyPlan("Zweit");
  addPlan(store, second); // active becomes second.id
  switchPlan(store, originalActive);
  assert.equal(store.activePlanId, originalActive);
});

test("saveStore persists JSON that loadStore can read back", () => {
  const storage = createMemoryStorage();
  const store = loadStore(storage);
  saveStore(store, storage);
  const raw = storage._dump()["stundenplan-store-v1"];
  assert.ok(raw);
  assert.deepEqual(JSON.parse(raw).planOrder, store.planOrder);
});
