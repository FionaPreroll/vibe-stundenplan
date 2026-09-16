import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cellKey,
  parseCellKey,
  formatHM,
  generateRasterTimes,
  TIME_PRESETS,
  computeEntryUpdate,
  mergeTimes,
  requiredRowCount,
  getEntrySpan,
  isCellCovered,
  getCellRenderInfo,
  computeSelectionRange,
  findOverlappingKeys,
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

test("generateRasterTimes builds evenly spaced 2h (120 min) slots from 6 to 18 Uhr", () => {
  const times = generateRasterTimes(120, 6, 18);
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
  const times15 = generateRasterTimes(15, 9, 10);
  assert.deepEqual(times15, ["09:00–09:15", "09:15–09:30", "09:30–09:45", "09:45–10:00"]);

  const times10 = generateRasterTimes(10, 8, 8.5);
  assert.deepEqual(times10, ["08:00–08:10", "08:10–08:20", "08:20–08:30"]);
});

test("generateRasterTimes trims a trailing partial slot to the end hour", () => {
  const times = generateRasterTimes(150, 8, 12);
  assert.deepEqual(times, ["08:00–10:30", "10:30–12:00"]);
});

test("generateRasterTimes rejects an interval <= 0", () => {
  assert.throws(() => generateRasterTimes(0, 6, 18));
  assert.throws(() => generateRasterTimes(-1, 6, 18));
});

test("generateRasterTimes rejects an end hour before or equal to start", () => {
  assert.throws(() => generateRasterTimes(60, 10, 10));
  assert.throws(() => generateRasterTimes(60, 12, 6));
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
