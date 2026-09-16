import { codedError } from "./logic.js";
import { DEFAULT_LANGUAGE, DAYS_BY_LANGUAGE, translate } from "./i18n.js";

export const EXPORT_FORMAT_VERSION = 1;

// Plain, documented JSON so the exported file stays editable by hand.
export function serializePlan(plan) {
  return JSON.stringify(
    {
      app: "vibe-stundenplan",
      version: EXPORT_FORMAT_VERSION,
      plan: {
        name: plan.name,
        days: plan.days,
        rowCount: plan.rowCount,
        times: plan.times,
        entries: plan.entries,
      },
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
