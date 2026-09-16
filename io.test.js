import { test } from "node:test";
import assert from "node:assert/strict";
import { serializePlan, parsePlanImport, EXPORT_FORMAT_VERSION } from "./io.js";
import { DAYS_BY_LANGUAGE } from "./i18n.js";

const samplePlan = {
  id: "plan_ignored", // not part of the export
  name: "Testplan",
  days: ["Montag", "Dienstag"],
  rowCount: 4,
  times: ["08:00–08:45", "08:45–09:30"],
  entries: { "0_Montag": { title: "Mathe", description: "", link: "" } },
};

test("serializePlan emits documented, pretty-printed JSON without the internal id", () => {
  const json = serializePlan(samplePlan);
  const data = JSON.parse(json);
  assert.equal(data.app, "vibe-stundenplan");
  assert.equal(data.version, EXPORT_FORMAT_VERSION);
  assert.deepEqual(data.plan, {
    name: "Testplan",
    days: samplePlan.days,
    rowCount: 4,
    times: samplePlan.times,
    entries: samplePlan.entries,
  });
  assert.ok(json.includes("\n  "), "expected pretty-printed (indented) JSON");
});

test("parsePlanImport round-trips a serialized plan", () => {
  const json = serializePlan(samplePlan);
  const parsed = parsePlanImport(json);
  assert.deepEqual(parsed, {
    name: "Testplan",
    days: samplePlan.days,
    rowCount: 4,
    times: samplePlan.times,
    entries: samplePlan.entries,
  });
});

test("parsePlanImport rejects invalid JSON with a translatable error code", () => {
  assert.throws(() => parsePlanImport("{ not json"), { code: "errorInvalidJson" });
});

test('parsePlanImport rejects JSON missing the "plan" field with a translatable error code', () => {
  assert.throws(() => parsePlanImport(JSON.stringify({ app: "x" })), { code: "errorMissingPlanField" });
});

test("parsePlanImport falls back to safe (German-default) values for malformed plan fields", () => {
  const parsed = parsePlanImport(
    JSON.stringify({
      plan: { name: "  ", rowCount: -5, times: "not-an-array", entries: [1, 2, 3], days: "not-an-array" },
    })
  );
  assert.equal(parsed.name, "Importierter Plan");
  assert.equal(parsed.rowCount, 10);
  assert.deepEqual(parsed.times, []);
  assert.deepEqual(parsed.entries, {});
  assert.deepEqual(parsed.days, DAYS_BY_LANGUAGE.de);
});

test("parsePlanImport localizes fallback name/days to the given language", () => {
  const parsed = parsePlanImport(JSON.stringify({ plan: {} }), "en");
  assert.equal(parsed.name, "Imported Schedule");
  assert.deepEqual(parsed.days, DAYS_BY_LANGUAGE.en);
});

test("parsePlanImport falls back to default days when days is missing, empty, or has blank entries", () => {
  assert.deepEqual(parsePlanImport(JSON.stringify({ plan: { name: "x" } })).days, DAYS_BY_LANGUAGE.de);
  assert.deepEqual(parsePlanImport(JSON.stringify({ plan: { name: "x", days: [] } })).days, DAYS_BY_LANGUAGE.de);
  assert.deepEqual(
    parsePlanImport(JSON.stringify({ plan: { name: "x", days: ["Mo", "  "] } })).days,
    DAYS_BY_LANGUAGE.de
  );
});

test("parsePlanImport keeps custom day names as given", () => {
  const parsed = parsePlanImport(JSON.stringify({ plan: { name: "x", days: ["Werktag A", "Werktag B"] } }));
  assert.deepEqual(parsed.days, ["Werktag A", "Werktag B"]);
});

test("parsePlanImport trims the plan name and coerces non-string time slots", () => {
  const parsed = parsePlanImport(
    JSON.stringify({
      plan: { name: "  Mein Plan  ", rowCount: 3, times: ["08:00", 42, null], entries: {} },
    })
  );
  assert.equal(parsed.name, "Mein Plan");
  assert.deepEqual(parsed.times, ["08:00", "", ""]);
});
