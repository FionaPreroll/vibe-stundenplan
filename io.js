import { codedError } from "./logic.js";
import { DEFAULT_LANGUAGE, DAYS_BY_LANGUAGE, translate } from "./i18n.js";

export const EXPORT_FORMAT_VERSION = 1;

// The subset of a plan's fields that's actually exported — deliberately
// excludes internal-only state (id, columnWidths, timeColWidth), see
// EXPORT_FORMAT.md.
function toExportShape(plan) {
  return {
    name: plan.name,
    days: plan.days,
    rowCount: plan.rowCount,
    times: plan.times,
    entries: plan.entries,
  };
}

// Turns a raw (untrusted) plan-like object from an import file into a safe
// plan-fields object, falling back to sensible defaults field-by-field
// instead of rejecting the whole import — shared by the single-plan and
// all-plans import paths.
function normalizePlanFields(planLike, language) {
  const plan = planLike && typeof planLike === "object" ? planLike : {};
  const name =
    typeof plan.name === "string" && plan.name.trim() ? plan.name.trim() : translate(language, "importedPlanName");
  const rowCount = Number.isInteger(plan.rowCount) && plan.rowCount > 0 ? plan.rowCount : 10;
  const times = Array.isArray(plan.times) ? plan.times.map((t) => (typeof t === "string" ? t : "")) : [];
  const entries =
    plan.entries && typeof plan.entries === "object" && !Array.isArray(plan.entries) ? plan.entries : {};
  const days =
    Array.isArray(plan.days) && plan.days.every((d) => typeof d === "string" && d.trim()) && plan.days.length > 0
      ? plan.days
      : [...(DAYS_BY_LANGUAGE[language] || DAYS_BY_LANGUAGE[DEFAULT_LANGUAGE])];

  return { name, rowCount, times, entries, days };
}

// Plain, documented JSON so the exported file stays editable by hand.
export function serializePlan(plan) {
  return JSON.stringify(
    {
      app: "vibe-stundenplan",
      version: EXPORT_FORMAT_VERSION,
      plan: toExportShape(plan),
    },
    null,
    2
  );
}

export function parsePlanImport(jsonText, language = DEFAULT_LANGUAGE) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw codedError("errorInvalidJson");
  }

  const plan = data && data.plan;
  if (!plan || typeof plan !== "object") {
    throw codedError("errorMissingPlanField");
  }

  return normalizePlanFields(plan, language);
}

// Exports every plan in store order as one file — a `plans` array instead
// of a single `plan` object is what distinguishes this from a
// serializePlan() file on import.
export function serializeAllPlans(store) {
  const plans = store.planOrder.map((id) => store.plans[id]).filter(Boolean).map(toExportShape);
  return JSON.stringify(
    {
      app: "vibe-stundenplan",
      version: EXPORT_FORMAT_VERSION,
      plans,
    },
    null,
    2
  );
}

export function parseAllPlansImport(jsonText, language = DEFAULT_LANGUAGE) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw codedError("errorInvalidJson");
  }

  const plans = data && data.plans;
  if (!Array.isArray(plans) || plans.length === 0) {
    throw codedError("errorMissingPlansField");
  }

  return plans.map((planLike) => normalizePlanFields(planLike, language));
}
