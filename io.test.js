import { test } from "node:test";
import assert from "node:assert/strict";
import { serializePlan, parsePlanImport, serializeAllPlans, parseAllPlansImport, EXPORT_FORMAT_VERSION } from "./io.js";
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

const secondPlan = {
  id: "plan_ignored_2",
  name: "Zweitplan",
  days: ["Montag", "Dienstag"],
  rowCount: 2,
  times: ["09:00–09:45"],
  entries: {},
};

const sampleStore = {
  activePlanId: "plan_ignored_2",
  planOrder: ["plan_ignored", "plan_ignored_2"],
  plans: { plan_ignored: samplePlan, plan_ignored_2: secondPlan },
};

test("serializeAllPlans emits every plan in store order, without internal ids", () => {
  const json = serializeAllPlans(sampleStore);
  const data = JSON.parse(json);
  assert.equal(data.app, "vibe-stundenplan");
  assert.equal(data.version, EXPORT_FORMAT_VERSION);
  assert.deepEqual(data.plans, [
    { name: "Testplan", days: samplePlan.days, rowCount: 4, times: samplePlan.times, entries: samplePlan.entries },
    { name: "Zweitplan", days: secondPlan.days, rowCount: 2, times: secondPlan.times, entries: secondPlan.entries },
  ]);
  assert.ok(json.includes("\n  "), "expected pretty-printed (indented) JSON");
});

test("serializeAllPlans skips a planOrder id with no matching plan", () => {
  const json = serializeAllPlans({ planOrder: ["a", "missing"], plans: { a: samplePlan } });
  assert.equal(JSON.parse(json).plans.length, 1);
});

test("parseAllPlansImport round-trips a serialized store", () => {
  const json = serializeAllPlans(sampleStore);
  const parsed = parseAllPlansImport(json);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, "Testplan");
  assert.equal(parsed[1].name, "Zweitplan");
});

test('parseAllPlansImport rejects invalid JSON and JSON missing/empty "plans"', () => {
  assert.throws(() => parseAllPlansImport("{ not json"), { code: "errorInvalidJson" });
  assert.throws(() => parseAllPlansImport(JSON.stringify({ app: "x" })), { code: "errorMissingPlansField" });
  assert.throws(() => parseAllPlansImport(JSON.stringify({ plans: [] })), { code: "errorMissingPlansField" });
});

test("parseAllPlansImport applies the same per-plan fallbacks as parsePlanImport to each entry", () => {
  const parsed = parseAllPlansImport(
    JSON.stringify({ plans: [{ name: "Ok", days: ["A", "B"] }, "not-an-object", null] }),
    "en"
  );
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].name, "Ok");
  assert.deepEqual(parsed[0].days, ["A", "B"]);
  assert.equal(parsed[1].name, "Imported Schedule");
  assert.deepEqual(parsed[1].days, DAYS_BY_LANGUAGE.en);
  assert.equal(parsed[2].name, "Imported Schedule");
});
