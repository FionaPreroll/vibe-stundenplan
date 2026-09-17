# 0001: Sub-raster entry positioning via an absolutely-positioned `.entry-box` + pixel math

**Status:** Accepted (current implementation).
**Related:** [REQUIREMENTS.md](../../REQUIREMENTS.md) item 5 (sub-raster times — the outcome
this implements) and item 17 (a related non-goal: no responsive adjustment of the fixed row
height, because it would complicate the pixel calculation described here).

## Context

An entry can optionally carry its own `startTime`/`endTime` (`HH:MM`), independent of the time
label of the row(s) it occupies — so it can visually start/end in the middle of a row (e.g. a
15-minute call at 08:10–08:25 inside an 08:00–09:00 row) without the whole grid needing to be
that finely resolved. Something has to translate "this time falls x% into the occupied
row(s)" into an actual visual shift within the cell.

## Decision

- The entry's visible content lives in its own `.entry-box` `div`, positioned absolutely within
  the `<td>`, rather than coloring/outlining/padding the `<td>` itself.
- The sub-raster inset is applied to that box via `top`/`bottom`, computed in pixels
  (`computeSubRangeInset` in `logic.js` returns fractions; `render.js` multiplies them by the
  cell's total pixel height, `ROW_HEIGHT_PX * span`) rather than as CSS percentages — deliberate,
  to keep the inset tied directly to the same fixed-row-height constant the rest of the grid's
  layout already assumes (see "Consequence" below), instead of relying on the box's own
  percentage-resolution against a rowspan-merged table cell.
- It's the **box itself** that shifts (its top/bottom edge), not just its content via padding —
  otherwise it looks like only the text slides down while the cell visually already starts
  earlier, which looks odd for a multi-row entry with a late start.
- Falls back to "no shift" (renders edge-to-edge as usual) when the row time labels aren't
  parseable as `HH:MM–HH:MM` (e.g. the empty rows a fresh plan starts with) — a visual
  approximation, not a pixel-perfect calendar.
- `ROW_HEIGHT_PX = 70` is a JS constant (in `render.js`, one of the three DOM-controller modules
  `app.js` was split into — see CONTRIBUTING.md's "Modularity" section) that must be kept in sync
  by hand with `tbody td { height }` in `style.css`; nothing enforces that automatically.

## Consequence

Because the inset math depends on `ROW_HEIGHT_PX` as a literal, a responsive/variable row height
(e.g. shrinking rows on narrow screens) isn't implemented — it would need `ROW_HEIGHT_PX` to be
read from the actually rendered row height instead of a constant. Deliberately left unaddressed
for now (REQUIREMENTS.md item 17); revisit this ADR if that trade-off changes.
