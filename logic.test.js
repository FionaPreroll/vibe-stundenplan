import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cellKey,
  formatHM,
  generateRasterTimes,
  TIME_PRESETS,
  computeEntryUpdate,
  mergeTimes,
  requiredRowCount,
} from "./logic.js";

test("cellKey builds a stable row/day key", () => {
  assert.equal(cellKey(0, "Montag"), "0_Montag");
  assert.equal(cellKey(3, "Freitag"), "3_Freitag");
});

test("formatHM pads hours and minutes", () => {
  assert.equal(formatHM(0), "00:00");
  assert.equal(formatHM(90), "01:30");
  assert.equal(formatHM(600), "10:00");
});

test("generateRasterTimes builds evenly spaced 2h slots from 6 to 18 Uhr", () => {
  const times = generateRasterTimes(2, 6, 18);
  assert.deepEqual(times, [
    "06:00–08:00",
    "08:00–10:00",
    "10:00–12:00",
    "12:00–14:00",
    "14:00–16:00",
    "16:00–18:00",
  ]);
});

test("generateRasterTimes trims a trailing partial slot to the end hour", () => {
  const times = generateRasterTimes(2.5, 8, 12);
  assert.deepEqual(times, ["08:00–10:30", "10:30–12:00"]);
});

test("generateRasterTimes rejects an interval <= 0", () => {
  assert.throws(() => generateRasterTimes(0, 6, 18));
  assert.throws(() => generateRasterTimes(-1, 6, 18));
});

test("generateRasterTimes rejects an end hour before or equal to start", () => {
  assert.throws(() => generateRasterTimes(2, 10, 10));
  assert.throws(() => generateRasterTimes(2, 12, 6));
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
