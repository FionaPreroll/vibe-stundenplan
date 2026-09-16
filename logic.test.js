import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cellKey,
  parseCellKey,
  formatHM,
  parseTimeToMinutes,
  parseTimeRangeToMinutes,
  generateRasterTimes,
  TIME_PRESETS,
  computeEntryUpdate,
  computeSubRangeInset,
  mergeTimes,
  requiredRowCount,
  getEntrySpan,
  isCellCovered,
  getCellRenderInfo,
  computeSelectionRange,
  findOverlappingKeys,
  rowHasEntries,
  shiftEntryForRemoval,
  removeRow,
  findAnchorRow,
  dayHasEntries,
  removeDayEntries,
  renameDayEntries,
  isDayNameTaken,
  renameDayWidth,
  removeDayWidth,
} from "./logic.js";

test("cellKey builds a stable row/day key", () => {
  assert.equal(cellKey(0, "Montag"), "0_Montag");
  assert.equal(cellKey(3, "Freitag"), "3_Freitag");
});

test("parseCellKey inverts cellKey", () => {
  assert.deepEqual(parseCellKey(cellKey(5, "Sonntag")), { row: 5, day: "Sonntag" });
  assert.deepEqual(parseCellKey("12_Mittwoch"), { row: 12, day: "Mittwoch" });
});

test("formatHM pads hours and minutes", () => {
  assert.equal(formatHM(0), "00:00");
  assert.equal(formatHM(90), "01:30");
  assert.equal(formatHM(600), "10:00");
});

test("parseTimeToMinutes parses H:MM and HH:MM, rejects garbage", () => {
  assert.equal(parseTimeToMinutes("07:50"), 470);
  assert.equal(parseTimeToMinutes("7:50"), 470);
  assert.equal(parseTimeToMinutes("00:00"), 0);
  assert.equal(parseTimeToMinutes("23:59"), 1439);
  assert.equal(parseTimeToMinutes("24:00"), null);
  assert.equal(parseTimeToMinutes("12:60"), null);
  assert.equal(parseTimeToMinutes("not a time"), null);
  assert.equal(parseTimeToMinutes(""), null);
});

test("parseTimeRangeToMinutes parses an en-dash or hyphen separated range", () => {
  assert.deepEqual(parseTimeRangeToMinutes("08:00–08:45"), { start: 480, end: 525 });
  assert.deepEqual(parseTimeRangeToMinutes("08:00-08:45"), { start: 480, end: 525 });
  assert.equal(parseTimeRangeToMinutes("garbage"), null);
  assert.equal(parseTimeRangeToMinutes(""), null);
});

test("generateRasterTimes builds evenly spaced 2h (120 min) slots from 6:00 to 18:00", () => {
  const times = generateRasterTimes(120, parseTimeToMinutes("06:00"), parseTimeToMinutes("18:00"));
  assert.deepEqual(times, [
    "06:00–08:00",
    "08:00–10:00",
    "10:00–12:00",
    "12:00–14:00",
    "14:00–16:00",
    "16:00–18:00",
  ]);
});

test("generateRasterTimes supports sub-hour minute steps", () => {
  const times15 = generateRasterTimes(15, parseTimeToMinutes("09:00"), parseTimeToMinutes("10:00"));
  assert.deepEqual(times15, ["09:00–09:15", "09:15–09:30", "09:30–09:45", "09:45–10:00"]);

  const times10 = generateRasterTimes(10, parseTimeToMinutes("08:00"), parseTimeToMinutes("08:30"));
  assert.deepEqual(times10, ["08:00–08:10", "08:10–08:20", "08:20–08:30"]);
});

test("generateRasterTimes can start at an arbitrary minute like 7:50", () => {
  const times = generateRasterTimes(60, parseTimeToMinutes("07:50"), parseTimeToMinutes("10:50"));
  assert.deepEqual(times, ["07:50–08:50", "08:50–09:50", "09:50–10:50"]);
});

test("generateRasterTimes trims a trailing partial slot to the end time", () => {
  const times = generateRasterTimes(150, parseTimeToMinutes("08:00"), parseTimeToMinutes("12:00"));
  assert.deepEqual(times, ["08:00–10:30", "10:30–12:00"]);
});

test("generateRasterTimes rejects an interval <= 0 with a translatable error code", () => {
  assert.throws(() => generateRasterTimes(0, 360, 1080), { code: "errorIntervalPositive" });
  assert.throws(() => generateRasterTimes(-1, 360, 1080), { code: "errorIntervalPositive" });
});

test("generateRasterTimes rejects an end time before or equal to start with a translatable error code", () => {
  assert.throws(() => generateRasterTimes(60, 600, 600), { code: "errorEndAfterStart" });
  assert.throws(() => generateRasterTimes(60, 720, 360), { code: "errorEndAfterStart" });
});

test("TIME_PRESETS ship 8 well-formed slots each for TU Dresden and RWTH Aachen", () => {
  assert.equal(TIME_PRESETS["tu-dresden"].times.length, 8);
  assert.equal(TIME_PRESETS["rwth-aachen"].times.length, 8);
  for (const preset of Object.values(TIME_PRESETS)) {
    for (const slot of preset.times) {
      assert.match(slot, /^\d{2}:\d{2}–\d{2}:\d{2}$/);
    }
  }
});

test("computeEntryUpdate trims fields and returns null for an empty title", () => {
  assert.equal(computeEntryUpdate("   ", "desc", "link"), null);
  assert.deepEqual(
    computeEntryUpdate("  Mathe  ", " Kapitel 3 ", " https://example.com "),
    { title: "Mathe", description: "Kapitel 3", link: "https://example.com" }
  );
});

test("computeEntryUpdate includes startTime/endTime only when given", () => {
  assert.deepEqual(computeEntryUpdate("Meeting", "", "", "09:15", "10:05"), {
    title: "Meeting",
    description: "",
    link: "",
    startTime: "09:15",
    endTime: "10:05",
  });
  assert.deepEqual(computeEntryUpdate("Meeting", "", "", "", ""), {
    title: "Meeting",
    description: "",
    link: "",
  });
  assert.deepEqual(computeEntryUpdate("Meeting", "", ""), {
    title: "Meeting",
    description: "",
    link: "",
  });
});

test("computeSubRangeInset returns null without custom times or unparseable row labels", () => {
  assert.equal(computeSubRangeInset(["08:00–09:00"], "", ""), null);
  assert.equal(computeSubRangeInset([], "08:15", "08:45"), null);
  assert.equal(computeSubRangeInset(["ganztags"], "08:15", "08:45"), null);
});

test("computeSubRangeInset computes fractional insets within the covered rows", () => {
  // Single row 08:00-09:00, event runs 08:15-08:45 (quarter in from each side).
  const inset = computeSubRangeInset(["08:00–09:00"], "08:15", "08:45");
  assert.ok(Math.abs(inset.topFraction - 0.25) < 1e-9);
  assert.ok(Math.abs(inset.bottomFraction - 0.25) < 1e-9);

  // Two rows spanning 08:00-10:00, event runs the full range: no inset.
  const fullRange = computeSubRangeInset(["08:00–09:00", "09:00–10:00"], "08:00", "10:00");
  assert.equal(fullRange.topFraction, 0);
  assert.equal(fullRange.bottomFraction, 0);

  // Only a start time given: bottom stays at the row's end.
  const startOnly = computeSubRangeInset(["08:00–09:00"], "08:30", "");
  assert.ok(Math.abs(startOnly.topFraction - 0.5) < 1e-9);
  assert.equal(startOnly.bottomFraction, 0);
});

test("computeSubRangeInset clamps out-of-range custom times", () => {
  const inset = computeSubRangeInset(["08:00–09:00"], "07:00", "10:00");
  assert.equal(inset.topFraction, 0);
  assert.equal(inset.bottomFraction, 0);
});

test("mergeTimes overwrites only the given slots and keeps the rest without mutating the input", () => {
  const existing = ["A", "B", "C", "D"];
  const merged = mergeTimes(existing, ["X", "Y"]);
  assert.deepEqual(merged, ["X", "Y", "C", "D"]);
  assert.deepEqual(existing, ["A", "B", "C", "D"]);
});

test("requiredRowCount grows to fit new slots but never shrinks", () => {
  assert.equal(requiredRowCount(10, 8), 10);
  assert.equal(requiredRowCount(5, 8), 8);
});

test("getEntrySpan defaults to 1 for missing/invalid span", () => {
  assert.equal(getEntrySpan(undefined), 1);
  assert.equal(getEntrySpan({}), 1);
  assert.equal(getEntrySpan({ span: 0 }), 1);
  assert.equal(getEntrySpan({ span: -2 }), 1);
  assert.equal(getEntrySpan({ span: 3 }), 3);
});

test("isCellCovered detects rows swallowed by an earlier multi-row entry", () => {
  const entries = { "1_Montag": { title: "Meeting", span: 3 } };
  assert.equal(isCellCovered(1, "Montag", entries), false); // the anchor itself isn't "covered"
  assert.equal(isCellCovered(2, "Montag", entries), true);
  assert.equal(isCellCovered(3, "Montag", entries), true);
  assert.equal(isCellCovered(4, "Montag", entries), false);
  assert.equal(isCellCovered(2, "Dienstag", entries), false);
});

test("findAnchorRow finds the entry actually occupying a cell, own or inherited", () => {
  const entries = { "1_Montag": { title: "Meeting", span: 3 } };
  assert.equal(findAnchorRow(1, "Montag", entries), 1);
  assert.equal(findAnchorRow(2, "Montag", entries), 1);
  assert.equal(findAnchorRow(3, "Montag", entries), 1);
  assert.equal(findAnchorRow(4, "Montag", entries), null);
  assert.equal(findAnchorRow(2, "Dienstag", entries), null);
});

test("getCellRenderInfo reports hidden covered cells and spans for anchors", () => {
  const entries = { "0_Montag": { title: "Block", span: 2 } };
  assert.deepEqual(getCellRenderInfo(0, "Montag", entries), {
    key: "0_Montag",
    entry: entries["0_Montag"],
    span: 2,
    hidden: false,
  });
  assert.deepEqual(getCellRenderInfo(1, "Montag", entries), {
    key: "1_Montag",
    entry: null,
    span: 1,
    hidden: true,
  });
  assert.deepEqual(getCellRenderInfo(2, "Montag", entries), {
    key: "2_Montag",
    entry: null,
    span: 1,
    hidden: false,
  });
});

test("computeSelectionRange normalizes drag direction", () => {
  assert.deepEqual(computeSelectionRange(2, 5), { rowStart: 2, rowEnd: 5 });
  assert.deepEqual(computeSelectionRange(5, 2), { rowStart: 2, rowEnd: 5 });
  assert.deepEqual(computeSelectionRange(3, 3), { rowStart: 3, rowEnd: 3 });
});

test("findOverlappingKeys finds only same-day entries intersecting the range", () => {
  const entries = {
    "0_Montag": { title: "A" },
    "2_Montag": { title: "B", span: 2 }, // covers rows 2-3
    "5_Montag": { title: "C" },
    "2_Dienstag": { title: "D" },
  };
  assert.deepEqual(findOverlappingKeys(entries, "Montag", 1, 3), ["2_Montag"]);
  assert.deepEqual(findOverlappingKeys(entries, "Montag", 0, 0), ["0_Montag"]);
  assert.deepEqual(findOverlappingKeys(entries, "Montag", 4, 6), ["5_Montag"]);
  assert.deepEqual(findOverlappingKeys(entries, "Montag", 10, 12), []);
});

const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

test("rowHasEntries detects an anchor entry or a row covered by a span", () => {
  const entries = { "2_Montag": { title: "Block", span: 2 } };
  assert.equal(rowHasEntries(2, DAYS, entries), true); // anchor
  assert.equal(rowHasEntries(3, DAYS, entries), true); // covered
  assert.equal(rowHasEntries(4, DAYS, entries), false);
  assert.equal(rowHasEntries(0, DAYS, {}), false);
});

test("shiftEntryForRemoval shifts rows after the removed one and shrinks spans crossing it", () => {
  // Entry entirely after the removed row shifts up by one, span unchanged.
  assert.deepEqual(shiftEntryForRemoval(1, 5, 2), { row: 4, span: 2 });
  // Entry entirely before the removed row is untouched.
  assert.deepEqual(shiftEntryForRemoval(5, 1, 2), { row: 1, span: 2 });
  // Removing the anchor row of a multi-row entry: span shrinks, anchor stays at the same index.
  assert.deepEqual(shiftEntryForRemoval(2, 2, 3), { row: 2, span: 2 });
  // Removing an interior row of a multi-row entry: span shrinks, anchor row unchanged.
  assert.deepEqual(shiftEntryForRemoval(3, 2, 3), { row: 2, span: 2 });
  // Removing a single-row entry's own row: span drops to 0 (caller deletes it).
  assert.deepEqual(shiftEntryForRemoval(0, 0, 1), { row: 0, span: 0 });
});

test("removeRow drops the time slot, deletes single-row entries at that row, and reindexes the rest", () => {
  const times = ["08:00", "09:00", "10:00", "11:00"];
  const entries = {
    "0_Montag": { title: "A" }, // deleted (row 1 removed)
    "1_Montag": { title: "B" }, // shifts to row 1... wait row 1 is being removed
  };
  const result = removeRow(1, 4, times, entries);
  assert.equal(result.rowCount, 3);
  assert.deepEqual(result.times, ["08:00", "10:00", "11:00"]);
  assert.deepEqual(result.entries, { "0_Montag": { title: "A" } });
});

test("removeRow shrinks a span crossing the removed row and reindexes trailing entries", () => {
  const times = ["r0", "r1", "r2", "r3", "r4"];
  const entries = {
    "1_Montag": { title: "Block", span: 3 }, // covers rows 1-3
    "4_Dienstag": { title: "Later" }, // after the removed row
  };
  const result = removeRow(2, 5, times, entries); // remove interior row of the span
  assert.equal(result.rowCount, 4);
  assert.deepEqual(result.times, ["r0", "r1", "r3", "r4"]);
  assert.deepEqual(result.entries, {
    "1_Montag": { title: "Block", span: 2 },
    "3_Dienstag": { title: "Later" },
  });
});

// --- Day columns ---------------------------------------------------------
// Default day names live in i18n.js (language-dependent); see i18n.test.js.

test("dayHasEntries checks only the given day, ignoring row/span", () => {
  const entries = { "0_Montag": { title: "A" }, "2_Dienstag": { title: "B", span: 3 } };
  assert.equal(dayHasEntries("Montag", entries), true);
  assert.equal(dayHasEntries("Dienstag", entries), true);
  assert.equal(dayHasEntries("Mittwoch", entries), false);
});

test("removeDayEntries drops only entries for the given day", () => {
  const entries = { "0_Montag": { title: "A" }, "0_Dienstag": { title: "B" } };
  assert.deepEqual(removeDayEntries(entries, "Montag"), { "0_Dienstag": { title: "B" } });
});

test("renameDayEntries remaps keys for the renamed day, leaves others untouched", () => {
  const entries = { "0_Montag": { title: "A" }, "0_Dienstag": { title: "B" } };
  assert.deepEqual(renameDayEntries(entries, "Montag", "Mo (Uni)"), {
    "0_Mo (Uni)": { title: "A" },
    "0_Dienstag": { title: "B" },
  });
});

test("isDayNameTaken checks for a duplicate name among the other days", () => {
  const days = ["Montag", "Dienstag", "Mittwoch"];
  assert.equal(isDayNameTaken(days, "Dienstag", 0), true);
  assert.equal(isDayNameTaken(days, "Dienstag", 1), false); // excludes itself
  assert.equal(isDayNameTaken(days, "Neu", 0), false);
});

test("renameDayWidth moves a stored width from the old to the new day name", () => {
  const widths = { Montag: 140, Dienstag: 120 };
  assert.deepEqual(renameDayWidth(widths, "Montag", "Mo"), { Dienstag: 120, Mo: 140 });
});

test("renameDayWidth is a no-op when the old day has no stored width", () => {
  const widths = { Dienstag: 120 };
  assert.deepEqual(renameDayWidth(widths, "Montag", "Mo"), widths);
  assert.deepEqual(renameDayWidth(null, "Montag", "Mo"), {});
});

test("removeDayWidth drops the stored width for a removed day", () => {
  const widths = { Montag: 140, Dienstag: 120 };
  assert.deepEqual(removeDayWidth(widths, "Montag"), { Dienstag: 120 });
  assert.deepEqual(removeDayWidth(widths, "Freitag"), widths); // no-op if absent
  assert.deepEqual(removeDayWidth(null, "Montag"), {});
});
