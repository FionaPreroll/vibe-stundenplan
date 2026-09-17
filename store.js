import { codedError, cellKey, TIME_PRESETS } from "./logic.js";
import { LANGUAGES, DEFAULT_LANGUAGE, DAYS_BY_LANGUAGE, translate } from "./i18n.js";

const STORE_KEY = "stundenplan-store-v1"; // also duplicated in index.html's inline pre-paint theme script — keep in sync
const LEGACY_KEY = "stundenplan-data-v1";

// "system" follows the OS/browser color-scheme preference (prefers-color-scheme in
// style.css); "light"/"dark" force one regardless of it. Not language-dependent, so it
// lives here rather than i18n.js.
const THEMES = ["system", "light", "dark"];

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
    columnWidths: {},
    timeColWidth: null,
  };
}

// Only used for the very first plan a brand-new visitor ever sees (loadStore's
// fresh-store branch below) — everywhere else (the "+" new plan button,
// import) a fresh plan is still genuinely empty. Gives someone something to
// look at and click around before committing to building their own plan;
// the first entry's description carries the "how do I edit this" hint,
// since the demo plan starts locked (view-only) — see loadStore.
function applyDemoContent(plan, language) {
  plan.times = TIME_PRESETS["rwth-aachen"].times.slice(0, 3);
  const days = plan.days;
  plan.entries = {
    [cellKey(0, days[0])]: {
      title: translate(language, "demoEntry1Title"),
      description: translate(language, "demoEntry1Description"),
    },
    [cellKey(1, days[2])]: {
      title: translate(language, "demoEntry2Title"),
    },
    [cellKey(2, days[4])]: {
      title: translate(language, "demoEntry3Title"),
      description: translate(language, "demoEntry3Description"),
    },
  };
  return plan;
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
  if (!plan.columnWidths || typeof plan.columnWidths !== "object") {
    plan.columnWidths = {};
  }
  if (typeof plan.timeColWidth !== "number") {
    plan.timeColWidth = null;
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
        // The former display-only "show edit icons" preference has been
        // replaced by the real edit lock. Drop it during loading so old
        // stores are cleaned up on their next save.
        delete parsed.showEditIcons;
        if (typeof parsed.editLocked !== "boolean") {
          // Carries over the old "collapsed toolbar" preference this
          // replaced, so a store from before it became a real edit lock
          // keeps behaving the same way rather than silently unlocking.
          parsed.editLocked = typeof parsed.toolbarCollapsed === "boolean" ? parsed.toolbarCollapsed : false;
        }
        delete parsed.toolbarCollapsed;
        if (!THEMES.includes(parsed.theme)) {
          parsed.theme = "system";
        }
        Object.values(parsed.plans).forEach((plan) => normalizePlan(plan, parsed.language));
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Konnte Stundenplan-Store nicht laden:", e);
  }

  // A genuinely brand-new visitor (neither key ever written) gets a demo
  // plan to look at instead of a blank one, starting locked so it reads as
  // "here's an example" rather than an already-half-filled-in plan of
  // their own. A pre-existing legacy value being unreadable/corrupt still
  // means a *returning* user, who shouldn't be shown a demo pretending to
  // be new — that path (via migrateLegacyState returning null) keeps
  // falling back to a genuinely empty plan, unlocked, same as before.
  let legacyRaw = null;
  try {
    legacyRaw = storage.getItem(LEGACY_KEY);
  } catch {
    legacyRaw = null;
  }
  const isFreshVisitor = !legacyRaw;
  const legacyPlan = legacyRaw ? migrateLegacyState(storage, defaultLanguage) : null;
  const initialPlan = normalizePlan(legacyPlan || createEmptyPlan(undefined, defaultLanguage), defaultLanguage);
  if (isFreshVisitor) applyDemoContent(initialPlan, defaultLanguage);

  return {
    language: defaultLanguage,
    editLocked: isFreshVisitor,
    theme: "system",
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

export function getEditLocked(store) {
  return typeof store.editLocked === "boolean" ? store.editLocked : false;
}

export function setEditLocked(store, locked) {
  store.editLocked = Boolean(locked);
  return store;
}

export function getTheme(store) {
  return THEMES.includes(store.theme) ? store.theme : "system";
}

export function setTheme(store, theme) {
  if (THEMES.includes(theme)) store.theme = theme;
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
