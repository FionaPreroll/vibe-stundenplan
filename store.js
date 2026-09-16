const STORE_KEY = "stundenplan-store-v1";
const LEGACY_KEY = "stundenplan-data-v1";

export const DEFAULT_PLAN_NAME = "Mein Stundenplan";
export const INITIAL_ROW_COUNT = 10;

let idCounter = 0;
function makePlanId() {
  idCounter += 1;
  return `plan_${Date.now().toString(36)}_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyPlan(name = DEFAULT_PLAN_NAME) {
  return { id: makePlanId(), name, rowCount: INITIAL_ROW_COUNT, times: [], entries: {} };
}

// Reads the single-plan format used before multi-plan support existed, so
// upgrading the app doesn't wipe a plan someone already filled in.
function migrateLegacyState(storage) {
  let raw;
  try {
    raw = storage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const plan = createEmptyPlan(DEFAULT_PLAN_NAME);
    plan.rowCount = Number.isInteger(parsed.rowCount) && parsed.rowCount > 0 ? parsed.rowCount : INITIAL_ROW_COUNT;
    plan.times = Array.isArray(parsed.times) ? parsed.times : [];
    plan.entries = parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {};
    return plan;
  } catch {
    return null;
  }
}

export function loadStore(storage) {
  try {
    const raw = storage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.plans &&
        typeof parsed.plans === "object" &&
        Array.isArray(parsed.planOrder) &&
        parsed.planOrder.length > 0
      ) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Konnte Stundenplan-Store nicht laden:", e);
  }

  const initialPlan = migrateLegacyState(storage) || createEmptyPlan();
  return {
    activePlanId: initialPlan.id,
    planOrder: [initialPlan.id],
    plans: { [initialPlan.id]: initialPlan },
  };
}

export function saveStore(store, storage) {
  try {
    storage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn("Konnte Stundenplan-Store nicht speichern:", e);
  }
}

export function getActivePlan(store) {
  return store.plans[store.activePlanId];
}

export function addPlan(store, plan) {
  store.plans[plan.id] = plan;
  store.planOrder.push(plan.id);
  store.activePlanId = plan.id;
  return store;
}

export function removePlan(store, planId) {
  if (store.planOrder.length <= 1) {
    throw new Error("Der letzte Stundenplan kann nicht gelöscht werden.");
  }
  delete store.plans[planId];
  store.planOrder = store.planOrder.filter((id) => id !== planId);
  if (store.activePlanId === planId) {
    store.activePlanId = store.planOrder[0];
  }
  return store;
}

export function renamePlan(store, planId, name) {
  const plan = store.plans[planId];
  if (plan) plan.name = name;
  return store;
}

export function switchPlan(store, planId) {
  if (store.plans[planId]) store.activePlanId = planId;
  return store;
}
