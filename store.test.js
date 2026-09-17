import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadStore,
  saveStore,
  getActivePlan,
  getLanguage,
  setLanguage,
  getShowEditIcons,
  setShowEditIcons,
  getEditLocked,
  setEditLocked,
  getTheme,
  setTheme,
  addPlan,
  removePlan,
  renamePlan,
  switchPlan,
  createEmptyPlan,
  INITIAL_ROW_COUNT,
} from "./store.js";
import { DAYS_BY_LANGUAGE } from "./i18n.js";

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _dump: () => Object.fromEntries(data),
  };
}

test("createEmptyPlan produces unique ids and the default (German) shape", () => {
  const a = createEmptyPlan();
  const b = createEmptyPlan("Custom");
  assert.notEqual(a.id, b.id);
  assert.equal(a.name, "Mein Stundenplan");
  assert.equal(b.name, "Custom");
  assert.equal(a.rowCount, INITIAL_ROW_COUNT);
  assert.deepEqual(a.times, []);
  assert.deepEqual(a.entries, {});
  assert.deepEqual(a.days, DAYS_BY_LANGUAGE.de);
  assert.deepEqual(a.columnWidths, {});
  assert.equal(a.timeColWidth, null);
});

test("createEmptyPlan localizes the default name and days to the given language", () => {
  const plan = createEmptyPlan(undefined, "en");
  assert.equal(plan.name, "My Schedule");
  assert.deepEqual(plan.days, DAYS_BY_LANGUAGE.en);
});

test("loadStore creates a fresh single-plan store when nothing is persisted", () => {
  const storage = createMemoryStorage();
  const store = loadStore(storage);
  assert.equal(store.planOrder.length, 1);
  assert.equal(store.plans[store.activePlanId].name, "Mein Stundenplan");
  assert.equal(getLanguage(store), "de");
});

test("loadStore uses the given default language for a fresh store", () => {
  const store = loadStore(createMemoryStorage(), "en");
  assert.equal(getLanguage(store), "en");
  assert.equal(getActivePlan(store).name, "My Schedule");
});

test("loadStore gives a genuinely brand-new visitor a locked demo plan with entries", () => {
  const store = loadStore(createMemoryStorage());
  const plan = getActivePlan(store);
  assert.equal(getEditLocked(store), true);
  assert.ok(Object.keys(plan.entries).length > 0);
  assert.ok(plan.times.length > 0);
  // The first entry (row 0 of the first day column) carries the onboarding
  // hint, and it must actually say something (not silently fall back to
  // its own translation key because a string is missing).
  const firstEntry = plan.entries[`0_${plan.days[0]}`];
  assert.ok(firstEntry);
  assert.ok(firstEntry.title.length > 0);
  assert.ok(firstEntry.description.length > 0);
  assert.notEqual(firstEntry.description, "demoEntry1Description");
});

test("loadStore does not demo/lock a plan migrated from the legacy single-plan format", () => {
  const storage = createMemoryStorage({
    "stundenplan-data-v1": JSON.stringify({ rowCount: 5, times: [], entries: {} }),
  });
  const store = loadStore(storage);
  assert.equal(getEditLocked(store), false);
  assert.deepEqual(getActivePlan(store).entries, {});
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
  assert.equal(plan.name, "Mein Stundenplan");
  assert.equal(plan.rowCount, 12);
  assert.deepEqual(plan.times, ["08:00–08:45"]);
  assert.deepEqual(plan.entries, { "0_Montag": { title: "Alt", description: "", link: "" } });
  assert.deepEqual(plan.days, DAYS_BY_LANGUAGE.de);
});

test("loadStore backfills days on a plan stored before day columns were customizable", () => {
  const oldPlan = createEmptyPlan("Alt");
  delete oldPlan.days;
  const storage = createMemoryStorage({
    "stundenplan-store-v1": JSON.stringify({
      activePlanId: oldPlan.id,
      planOrder: [oldPlan.id],
      plans: { [oldPlan.id]: oldPlan },
    }),
  });

  const store = loadStore(storage);
  assert.deepEqual(getActivePlan(store).days, DAYS_BY_LANGUAGE.de);
});

test("loadStore backfills columnWidths/timeColWidth on a plan stored before columns were resizable", () => {
  const oldPlan = createEmptyPlan("Alt");
  delete oldPlan.columnWidths;
  delete oldPlan.timeColWidth;
  const storage = createMemoryStorage({
    "stundenplan-store-v1": JSON.stringify({
      activePlanId: oldPlan.id,
      planOrder: [oldPlan.id],
      plans: { [oldPlan.id]: oldPlan },
    }),
  });

  const store = loadStore(storage);
  const plan = getActivePlan(store);
  assert.deepEqual(plan.columnWidths, {});
  assert.equal(plan.timeColWidth, null);
});

test("loadStore ignores a corrupt legacy value and falls back to an empty plan", () => {
  const storage = createMemoryStorage({ "stundenplan-data-v1": "{not json" });
  const store = loadStore(storage);
  const plan = getActivePlan(store);
  assert.equal(plan.rowCount, INITIAL_ROW_COUNT);
  assert.deepEqual(plan.entries, {});
});

test("getLanguage/setLanguage validate against the known language list", () => {
  const store = loadStore(createMemoryStorage());
  assert.equal(getLanguage(store), "de");
  setLanguage(store, "en");
  assert.equal(getLanguage(store), "en");
  setLanguage(store, "fr"); // unknown language: ignored
  assert.equal(getLanguage(store), "en");
});

test("getShowEditIcons/setShowEditIcons default to true and coerce to boolean", () => {
  const store = loadStore(createMemoryStorage());
  assert.equal(getShowEditIcons(store), true);
  setShowEditIcons(store, false);
  assert.equal(getShowEditIcons(store), false);
  setShowEditIcons(store, 1); // truthy, coerced
  assert.equal(getShowEditIcons(store), true);
});

test("loadStore defaults showEditIcons to true for an older store without that field", () => {
  const storage = createMemoryStorage();
  const store = loadStore(storage);
  delete store.showEditIcons;
  saveStore(store, storage);

  const reloaded = loadStore(storage);
  assert.equal(getShowEditIcons(reloaded), true);
});

test("getEditLocked/setEditLocked coerce to boolean", () => {
  // A brand-new store starts locked (the first-run demo plan, see below) —
  // this test is about setEditLocked's own coercion, not that default, so
  // it starts from an explicit false rather than assuming loadStore's.
  const store = loadStore(createMemoryStorage());
  setEditLocked(store, false);
  assert.equal(getEditLocked(store), false);
  setEditLocked(store, true);
  assert.equal(getEditLocked(store), true);
  setEditLocked(store, 0); // falsy, coerced
  assert.equal(getEditLocked(store), false);
});

test("loadStore defaults editLocked to false for an older store without that field", () => {
  const storage = createMemoryStorage();
  const store = loadStore(storage);
  delete store.editLocked;
  saveStore(store, storage);

  const reloaded = loadStore(storage);
  assert.equal(getEditLocked(reloaded), false);
});

test("loadStore carries over a legacy toolbarCollapsed value into editLocked", () => {
  const storage = createMemoryStorage();
  const store = loadStore(storage);
  delete store.editLocked;
  store.toolbarCollapsed = true;
  saveStore(store, storage);

  const reloaded = loadStore(storage);
  assert.equal(getEditLocked(reloaded), true);
  assert.equal(reloaded.toolbarCollapsed, undefined);
});

test("getTheme/setTheme default to system and validate against the known theme list", () => {
  const store = loadStore(createMemoryStorage());
  assert.equal(getTheme(store), "system");
  setTheme(store, "dark");
  assert.equal(getTheme(store), "dark");
  setTheme(store, "light");
  assert.equal(getTheme(store), "light");
  setTheme(store, "solarized"); // unknown theme: ignored
  assert.equal(getTheme(store), "light");
});

test("loadStore defaults theme to system for an older store without that field", () => {
  const storage = createMemoryStorage();
  const store = loadStore(storage);
  delete store.theme;
  saveStore(store, storage);

  const reloaded = loadStore(storage);
  assert.equal(getTheme(reloaded), "system");
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

test("removePlan refuses to delete the last remaining plan with a translatable error code", () => {
  const store = loadStore(createMemoryStorage());
  assert.throws(() => removePlan(store, store.activePlanId), { code: "errorLastPlanCannotBeDeleted" });
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
