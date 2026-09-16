export function cellKey(row, day) {
  return `${row}_${day}`;
}

export function formatHM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function generateRasterTimes(intervalHours, startHour, endHour) {
  const interval = Number(intervalHours);
  const start = Number(startHour);
  const end = Number(endHour);

  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("Das Intervall muss größer als 0 sein.");
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Das Ende muss nach dem Start liegen.");
  }

  const stepMin = Math.round(interval * 60);
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
