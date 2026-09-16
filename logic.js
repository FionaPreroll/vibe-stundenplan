export function cellKey(row, day) {
  return `${row}_${day}`;
}

export function parseCellKey(key) {
  const idx = key.indexOf("_");
  return { row: Number(key.slice(0, idx)), day: key.slice(idx + 1) };
}

export function formatHM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Parses "H:MM" or "HH:MM" into minutes since midnight, or null if invalid.
export function parseTimeToMinutes(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

// Parses a "HH:MM–HH:MM" (or "HH:MM-HH:MM") range label, as used for row
// time slots, into { start, end } minutes. Returns null if unparseable —
// callers must treat free-form time labels as opaque text in that case.
export function parseTimeRangeToMinutes(label) {
  if (typeof label !== "string") return null;
  const parts = label.split(/[–-]/).map((s) => s.trim());
  if (parts.length !== 2) return null;
  const start = parseTimeToMinutes(parts[0]);
  const end = parseTimeToMinutes(parts[1]);
  if (start === null || end === null) return null;
  return { start, end };
}

// intervalMinutes, startMinutes and endMinutes are all in minutes since
// midnight, so the raster can start at any minute (e.g. 7:50) and step in
// sub-hour ticks (e.g. every 15 minutes) without floating-point hours.
export function generateRasterTimes(intervalMinutes, startMinutes, endMinutes) {
  const interval = Number(intervalMinutes);
  const start = Number(startMinutes);
  const end = Number(endMinutes);

  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("Das Intervall muss größer als 0 sein.");
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Das Ende muss nach dem Start liegen.");
  }

  const stepMin = Math.round(interval);
  const startMin = Math.round(start);
  const endMin = Math.round(end);

  const slots = [];
  for (let t = startMin; t < endMin; t += stepMin) {
    const slotEnd = Math.min(t + stepMin, endMin);
    slots.push(`${formatHM(t)}–${formatHM(slotEnd)}`);
  }
  return slots;
}

export const TIME_PRESETS = {
  "tu-dresden": {
    label: "TU Dresden (Doppelstunden)",
    times: [
      "07:30–09:00",
      "09:20–10:50",
      "11:10–12:40",
      "13:00–14:30",
      "14:50–16:20",
      "16:40–18:10",
      "18:30–20:00",
      "20:10–21:40",
    ],
  },
  "rwth-aachen": {
    label: "RWTH Aachen (Blockraster)",
    times: [
      "08:00–09:30",
      "09:45–11:15",
      "11:30–13:00",
      "13:15–14:45",
      "15:00–16:30",
      "16:45–18:15",
      "18:30–20:00",
      "20:15–21:45",
    ],
  },
};

// startTime/endTime are optional "HH:MM" strings for the entry's actual
// start/end, independent of the raster row(s) it occupies (see
// computeSubRangeInset). Omitted from the result when blank, so plain
// entries stay free of the extra fields.
export function computeEntryUpdate(title, description, link, startTime, endTime) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;
  const update = {
    title: trimmedTitle,
    description: description.trim(),
    link: link.trim(),
  };
  const st = (startTime || "").trim();
  const et = (endTime || "").trim();
  if (st) update.startTime = st;
  if (et) update.endTime = et;
  return update;
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

// Computes how far an entry's real start/end time sits inside the raster
// row(s) it occupies, as fractions of the total covered time span — used to
// visually nudge the entry within its cell without needing a pixel-precise
// calendar layout. rowLabels are the "HH:MM–HH:MM" time labels of the rows
// the entry spans, in order. Returns null when there's nothing to show or
// the row labels aren't parseable (free-form text labels are left alone).
export function computeSubRangeInset(rowLabels, startTime, endTime) {
  if (!startTime && !endTime) return null;
  if (!rowLabels || rowLabels.length === 0) return null;

  const first = parseTimeRangeToMinutes(rowLabels[0]);
  const last = parseTimeRangeToMinutes(rowLabels[rowLabels.length - 1]);
  if (!first || !last) return null;

  const totalStart = first.start;
  const totalEnd = last.end;
  const totalSpan = totalEnd - totalStart;
  if (totalSpan <= 0) return null;

  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  const effectiveStart = startMin === null ? totalStart : startMin;
  const effectiveEnd = endMin === null ? totalEnd : endMin;

  return {
    topFraction: clamp01((effectiveStart - totalStart) / totalSpan),
    bottomFraction: clamp01((totalEnd - effectiveEnd) / totalSpan),
  };
}

export function mergeTimes(existingTimes, newTimes) {
  const merged = existingTimes.slice();
  newTimes.forEach((t, i) => {
    merged[i] = t;
  });
  return merged;
}

export function requiredRowCount(currentRowCount, newTimesLength) {
  return Math.max(currentRowCount, newTimesLength);
}

// --- Multi-row entries (drag-to-select ranges) -----------------------

export function getEntrySpan(entry) {
  return entry && Number.isInteger(entry.span) && entry.span > 0 ? entry.span : 1;
}

// Whether (row, day) is covered by an earlier row's multi-row entry.
// Entries never overlap (callers must clear overlaps before writing), so the
// first entry found scanning backwards is decisive: either it reaches this
// row or nothing earlier can.
export function isCellCovered(row, day, entries) {
  for (let r = row - 1; r >= 0; r--) {
    const entry = entries[cellKey(r, day)];
    if (entry) {
      return r + getEntrySpan(entry) > row;
    }
  }
  return false;
}

export function getCellRenderInfo(row, day, entries) {
  const key = cellKey(row, day);
  const entry = entries[key];
  if (entry) {
    return { key, entry, span: getEntrySpan(entry), hidden: false };
  }
  if (isCellCovered(row, day, entries)) {
    return { key, entry: null, span: 1, hidden: true };
  }
  return { key, entry: null, span: 1, hidden: false };
}

export function computeSelectionRange(anchorRow, currentRow) {
  return { rowStart: Math.min(anchorRow, currentRow), rowEnd: Math.max(anchorRow, currentRow) };
}

export function findOverlappingKeys(entries, day, rowStart, rowEnd) {
  const keys = [];
  for (const key of Object.keys(entries)) {
    const { row, day: entryDay } = parseCellKey(key);
    if (entryDay !== day) continue;
    const entryEnd = row + getEntrySpan(entries[key]) - 1;
    if (entryEnd >= rowStart && row <= rowEnd) keys.push(key);
  }
  return keys;
}

// --- Removing rows -----------------------------------------------------

export function rowHasEntries(rowIndex, days, entries) {
  return days.some((day) => {
    const info = getCellRenderInfo(rowIndex, day, entries);
    return info.entry !== null || info.hidden;
  });
}

// How a single entry's anchor row/span change when rowIndex is deleted:
// rows before the anchor shift it up by one; the removed row shrinks the
// span by one if it falls inside the entry's range (including the anchor
// row itself, in which case the entry's new anchor is the row that shifts
// up into its place).
export function shiftEntryForRemoval(rowIndex, row, span) {
  const entryEnd = row + span - 1;
  const overlaps = rowIndex >= row && rowIndex <= entryEnd;
  return {
    row: row - (rowIndex < row ? 1 : 0),
    span: span - (overlaps ? 1 : 0),
  };
}

export function removeRow(rowIndex, rowCount, times, entries) {
  const newRowCount = Math.max(0, rowCount - 1);
  const newTimes = times.slice(0, rowIndex).concat(times.slice(rowIndex + 1));

  const newEntries = {};
  for (const key of Object.keys(entries)) {
    const { row, day } = parseCellKey(key);
    const entry = entries[key];
    const { row: newRow, span: newSpan } = shiftEntryForRemoval(rowIndex, row, getEntrySpan(entry));
    if (newSpan <= 0) continue;

    const newKey = cellKey(newRow, day);
    const { span: _oldSpan, ...rest } = entry;
    newEntries[newKey] = newSpan > 1 ? { ...rest, span: newSpan } : rest;
  }

  return { rowCount: newRowCount, times: newTimes, entries: newEntries };
}
