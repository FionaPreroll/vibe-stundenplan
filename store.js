import { codedError } from "./logic.js";
import { LANGUAGES, DEFAULT_LANGUAGE, DAYS_BY_LANGUAGE, translate } from "./i18n.js";

const STORE_KEY = "stundenplan-store-v1";
const LEGACY_KEY = "stundenplan-data-v1";

export const INITIAL_ROW_COUNT = 10;

let idCounter = 0;
function makePlanId() {
  idCounter += 1;
  return `plan_${Date.now().toString(36)}_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyPlan(name, language = DEFAULT_LANGUAGE) {
  return {
    id: makePlanId(),
    name: name || translate(language, "defaultPlanName"),
    rowCount: INITIAL_ROW_COUNT,
    times: [],
    entries: {},
    days: [...(DAYS_BY_LANGUAGE[language] || DAYS_BY_LANGUAGE[DEFAULT_LANGUAGE])],
  };
}

// Reads the single-plan format used before multi-plan support existed, so
// upgrading the app doesn't wipe a plan someone already filled in.
function migrateLegacyState(storage, language) {
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
    const plan = createEmptyPlan(undefined, language);
    plan.rowCount = Number.isInteger(parsed.rowCount) && parsed.rowCount > 0 ? parsed.rowCount : INITIAL_ROW_COUNT;
    plan.times = Array.isArray(parsed.times) ? parsed.times : [];
    plan.entries = parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {};
    return plan;
  } catch {
    return null;
  }
}

// Backfills fields added after a plan may have been created/persisted (e.g.
// `days`, introduced once columns became removable/renamable), so older
// stored plans keep working without a dedicated migration step per field.
function normalizePlan(plan, language) {
  if (!Array.isArray(plan.days) || plan.days.length === 0) {
    plan.days = [...(DAYS_BY_LANGUAGE[language] || DAYS_BY_LANGUAGE[DEFAULT_LANGUAGE])];
  }
  return plan;
}

export function loadStore(storage, defaultLanguage = DEFAULT_LANGUAGE) {
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
        if (!LANGUAGES.includes(parsed.language)) {
          parsed.language = defaultLanguage;
        }
        Object.values(parsed.plans).forEach((plan) => normalizePlan(plan, parsed.language));
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Konnte Stundenplan-Store nicht laden:", e);
  }

  const initialPlan = normalizePlan(migrateLegacyState(storage, defaultLanguage) || createEmptyPlan(undefined, defaultLanguage), defaultLanguage);
  return {
    language: defaultLanguage,
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

export function getLanguage(store) {
  return LANGUAGES.includes(store.language) ? store.language : DEFAULT_LANGUAGE;
}

export function setLanguage(store, language) {
  if (LANGUAGES.includes(language)) store.language = language;
  return store;
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
    throw codedError("errorLastPlanCannotBeDeleted");
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
