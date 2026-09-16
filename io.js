export const EXPORT_FORMAT_VERSION = 1;

// Plain, documented JSON so the exported file stays editable by hand.
export function serializePlan(plan) {
  return JSON.stringify(
    {
      app: "vibe-stundenplan",
      version: EXPORT_FORMAT_VERSION,
      plan: {
        name: plan.name,
        rowCount: plan.rowCount,
        times: plan.times,
        entries: plan.entries,
      },
    },
    null,
    2
  );
}

export function parsePlanImport(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("Ungültiges JSON: Die Datei konnte nicht gelesen werden.");
  }

  const plan = data && data.plan;
  if (!plan || typeof plan !== "object") {
    throw new Error('Ungültiges Format: Feld "plan" fehlt.');
  }

  const name = typeof plan.name === "string" && plan.name.trim() ? plan.name.trim() : "Importierter Plan";
  const rowCount = Number.isInteger(plan.rowCount) && plan.rowCount > 0 ? plan.rowCount : 10;
  const times = Array.isArray(plan.times) ? plan.times.map((t) => (typeof t === "string" ? t : "")) : [];
  const entries =
    plan.entries && typeof plan.entries === "object" && !Array.isArray(plan.entries) ? plan.entries : {};

  return { name, rowCount, times, entries };
}
