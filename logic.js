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

// intervalMinutes is the raster step in minutes (e.g. 10, 15, 30, 120),
// which lets the raster express sub-hour ticks without floating-point hours.
export function generateRasterTimes(intervalMinutes, startHour, endHour) {
  const interval = Number(intervalMinutes);
  const start = Number(startHour);
  const end = Number(endHour);

  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("Das Intervall muss größer als 0 sein.");
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Das Ende muss nach dem Start liegen.");
  }

  const stepMin = Math.round(interval);
  const startMin = Math.round(start * 60);
  const endMin = Math.round(end * 60);

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

export function computeEntryUpdate(title, description, link) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;
  return {
    title: trimmedTitle,
    description: description.trim(),
    link: link.trim(),
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
