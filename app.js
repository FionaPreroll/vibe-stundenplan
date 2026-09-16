import {
  cellKey,
  generateRasterTimes,
  TIME_PRESETS,
  computeEntryUpdate,
  mergeTimes,
  requiredRowCount,
  getEntrySpan,
  getCellRenderInfo,
  computeSelectionRange,
  findOverlappingKeys,
} from "./logic.js";
import { serializePlan, parsePlanImport } from "./io.js";
import {
  loadStore,
  saveStore,
  getActivePlan,
  addPlan,
  removePlan,
  renamePlan,
  switchPlan,
  createEmptyPlan,
  DEFAULT_PLAN_NAME,
  INITIAL_ROW_COUNT,
} from "./store.js";

(() => {
  const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

  let store = loadStore(window.localStorage);

  const planTitleEl = document.getElementById("planTitle");
  const planSwitcher = document.getElementById("planSwitcher");
  const newPlanBtn = document.getElementById("newPlanBtn");
  const deletePlanBtn = document.getElementById("deletePlanBtn");

  const headerRow = document.getElementById("headerRow");
  const planBody = document.getElementById("planBody");
  const addRowBtn = document.getElementById("addRowBtn");
  const resetBtn = document.getElementById("resetBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFileInput");

  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitleHeading = document.getElementById("modalTitleHeading");
  const modalRangeInfo = document.getElementById("modalRangeInfo");
  const fieldTitle = document.getElementById("fieldTitle");
  const fieldDescription = document.getElementById("fieldDescription");
  const fieldLink = document.getElementById("fieldLink");
  const saveEntryBtn = document.getElementById("saveEntryBtn");
  const deleteEntryBtn = document.getElementById("deleteEntryBtn");
  const cancelModalBtn = document.getElementById("cancelModalBtn");

  const timePresetBtn = document.getElementById("timePresetBtn");
  const timeModalOverlay = document.getElementById("timeModalOverlay");
  const cancelTimeModalBtn = document.getElementById("cancelTimeModalBtn");
  const applyRasterBtn = document.getElementById("applyRasterBtn");
  const rasterInterval = document.getElementById("rasterInterval");
  const rasterStart = document.getElementById("rasterStart");
  const rasterEnd = document.getElementById("rasterEnd");

  let activeSelection = null; // { day, rowStart, rowEnd, isNewRange }
  let dragState = null; // { day, anchorRow, currentRow }

  function plan() {
    return getActivePlan(store);
  }

  function persist() {
    saveStore(store, window.localStorage);
  }

  // --- Rendering --------------------------------------------------------

  function renderHeader() {
    headerRow.querySelectorAll("th.day-col").forEach((el) => el.remove());
    DAYS.forEach((day) => {
      const th = document.createElement("th");
      th.className = "day-col";
      th.textContent = day;
      headerRow.appendChild(th);
    });
  }

  function renderPlanSwitcher() {
    planSwitcher.innerHTML = "";
    store.planOrder.forEach((id) => {
      const p = store.plans[id];
      if (!p) return;
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = p.name;
      if (id === store.activePlanId) opt.selected = true;
      planSwitcher.appendChild(opt);
    });
    deletePlanBtn.disabled = store.planOrder.length <= 1;
  }

  function renderPlanTitle() {
    const p = plan();
    if (planTitleEl.textContent !== p.name) {
      planTitleEl.textContent = p.name;
    }
    document.title = `${p.name} · Stundenplan`;
  }

  function renderBody() {
    const p = plan();
    planBody.innerHTML = "";

    for (let row = 0; row < p.rowCount; row++) {
      const tr = document.createElement("tr");

      const timeTd = document.createElement("td");
      timeTd.className = "time-cell";
      const timeInput = document.createElement("input");
      timeInput.type = "text";
      timeInput.className = "time-input";
      timeInput.placeholder = "z. B. 08:00–08:45";
      timeInput.value = p.times[row] || "";
      timeInput.addEventListener("input", () => {
        p.times[row] = timeInput.value;
        persist();
      });
      timeTd.appendChild(timeInput);
      tr.appendChild(timeTd);

      DAYS.forEach((day) => {
        const info = getCellRenderInfo(row, day, p.entries);
        if (info.hidden) return;

        const td = document.createElement("td");
        td.className = "data-cell";
        td.dataset.key = info.key;
        td.dataset.row = String(row);
        td.dataset.day = day;
        if (info.span > 1) td.rowSpan = info.span;
        renderCellContent(td, info.entry);
        wireCellSelection(td, row, day);
        tr.appendChild(td);
      });

      planBody.appendChild(tr);
    }
  }

  function renderCellContent(td, entry) {
    td.innerHTML = "";
    if (entry && entry.title) {
      td.classList.add("filled");
      const title = document.createElement("p");
      title.className = "entry-title";
      title.textContent = entry.title;
      td.appendChild(title);

      if (entry.description) {
        const desc = document.createElement("p");
        desc.className = "entry-description";
        desc.textContent = entry.description;
        td.appendChild(desc);
      }

      if (entry.link) {
        const link = document.createElement("a");
        link.className = "entry-link";
        link.href = entry.link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "🔗 Link";
        link.addEventListener("mousedown", (e) => e.stopPropagation());
        link.addEventListener("click", (e) => e.stopPropagation());
        td.appendChild(link);
      }
    } else {
      td.classList.remove("filled");
      const placeholder = document.createElement("span");
      placeholder.className = "cell-placeholder";
      placeholder.textContent = "+";
      td.appendChild(placeholder);
    }
  }

  function renderAll() {
    renderPlanSwitcher();
    renderPlanTitle();
    renderBody();
  }

  // --- Drag-to-select ranges ---------------------------------------------

  function wireCellSelection(td, row, day) {
    td.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragState = { day, anchorRow: row, currentRow: row };
      document.body.classList.add("no-select");
      highlightSelection(day, row, row);
    });

    td.addEventListener("mouseenter", () => {
      if (!dragState || dragState.day !== day) return;
      dragState.currentRow = row;
      highlightSelection(dragState.day, dragState.anchorRow, row);
    });
  }

  function clearHighlight() {
    planBody.querySelectorAll(".data-cell.selecting").forEach((el) => el.classList.remove("selecting"));
  }

  function highlightSelection(day, anchorRow, currentRow) {
    clearHighlight();
    const { rowStart, rowEnd } = computeSelectionRange(anchorRow, currentRow);
    planBody.querySelectorAll(".data-cell").forEach((td) => {
      if (td.dataset.day !== day) return;
      const r = Number(td.dataset.row);
      const span = td.rowSpan || 1;
      if (r + span - 1 >= rowStart && r <= rowEnd) {
        td.classList.add("selecting");
      }
    });
  }

  document.addEventListener("mouseup", () => {
    if (!dragState) return;
    const { day, anchorRow, currentRow } = dragState;
    dragState = null;
    document.body.classList.remove("no-select");
    clearHighlight();
    finalizeSelection(day, anchorRow, currentRow);
  });

  function finalizeSelection(day, anchorRow, currentRow) {
    const { rowStart, rowEnd } = computeSelectionRange(anchorRow, currentRow);
    const p = plan();
    const anchorKey = cellKey(rowStart, day);
    const existing = p.entries[anchorKey];

    if (rowStart === rowEnd && existing) {
      openEntryModal({
        day,
        rowStart,
        rowEnd: rowStart + getEntrySpan(existing) - 1,
        isNewRange: false,
        entry: existing,
      });
      return;
    }

    openEntryModal({ day, rowStart, rowEnd, isNewRange: true, entry: null });
  }

  // --- Entry modal --------------------------------------------------------

  function describeSelection(day, rowStart, rowEnd) {
    const p = plan();
    if (rowStart === rowEnd) {
      const label = p.times[rowStart];
      return label ? `${day} · ${label}` : `${day} · Zeile ${rowStart + 1}`;
    }
    const startLabel = p.times[rowStart];
    const endLabel = p.times[rowEnd];
    if (!startLabel && !endLabel) {
      return `${day} · Zeile ${rowStart + 1}–${rowEnd + 1}`;
    }
    const startText = startLabel ? startLabel.split("–")[0] : `Zeile ${rowStart + 1}`;
    const endText = endLabel ? endLabel.split("–").pop() : `Zeile ${rowEnd + 1}`;
    return `${day} · ${startText}–${endText}`;
  }

  function openEntryModal({ day, rowStart, rowEnd, isNewRange, entry }) {
    activeSelection = { day, rowStart, rowEnd, isNewRange };
    fieldTitle.value = entry?.title || "";
    fieldDescription.value = entry?.description || "";
    fieldLink.value = entry?.link || "";
    deleteEntryBtn.style.display = entry ? "inline-block" : "none";
    modalTitleHeading.textContent = entry ? "Termin bearbeiten" : "Termin hinzufügen";
    modalRangeInfo.textContent = describeSelection(day, rowStart, rowEnd);
    modalOverlay.classList.remove("hidden");
    setTimeout(() => fieldTitle.focus(), 0);
  }

  function closeModal() {
    modalOverlay.classList.add("hidden");
    activeSelection = null;
  }

  function saveEntry() {
    if (!activeSelection) return;
    const { day, rowStart, rowEnd, isNewRange } = activeSelection;
    const p = plan();
    const update = computeEntryUpdate(fieldTitle.value, fieldDescription.value, fieldLink.value);
    const anchorKey = cellKey(rowStart, day);

    if (isNewRange) {
      findOverlappingKeys(p.entries, day, rowStart, rowEnd).forEach((k) => delete p.entries[k]);
    }

    if (!update) {
      delete p.entries[anchorKey];
    } else {
      const span = rowEnd - rowStart + 1;
      p.entries[anchorKey] = span > 1 ? { ...update, span } : update;
    }

    persist();
    renderBody();
    closeModal();
  }

  function deleteEntry() {
    if (!activeSelection) return;
    const { day, rowStart } = activeSelection;
    delete plan().entries[cellKey(rowStart, day)];
    persist();
    renderBody();
    closeModal();
  }

  // --- Time-grid modal ------------------------------------------------------

  function openTimeModal() {
    timeModalOverlay.classList.remove("hidden");
  }

  function closeTimeModal() {
    timeModalOverlay.classList.add("hidden");
  }

  function applyTimes(newTimes) {
    if (newTimes.length === 0) return;
    const p = plan();

    const hasConflict = newTimes.some((t, i) => p.times[i] && p.times[i] !== t);
    if (hasConflict && !confirm("Bestehende Zeit-Labels werden überschrieben. Fortfahren?")) {
      return;
    }

    p.rowCount = requiredRowCount(p.rowCount, newTimes.length);
    p.times = mergeTimes(p.times, newTimes);
    persist();
    renderBody();
    closeTimeModal();
  }

  // --- Row / reset actions -------------------------------------------------

  function addRow() {
    plan().rowCount += 1;
    persist();
    renderBody();
  }

  function resetAll() {
    if (!confirm("Wirklich diesen Stundenplan zurücksetzen? Das kann nicht rückgängig gemacht werden.")) {
      return;
    }
    const p = plan();
    p.rowCount = INITIAL_ROW_COUNT;
    p.times = [];
    p.entries = {};
    persist();
    renderBody();
  }

  // --- Plan management -------------------------------------------------

  function nextDefaultPlanName() {
    const base = "Neuer Plan";
    const existingNames = new Set(Object.values(store.plans).map((p) => p.name));
    if (!existingNames.has(base)) return base;
    let i = 2;
    while (existingNames.has(`${base} ${i}`)) i += 1;
    return `${base} ${i}`;
  }

  function focusPlanTitleForRename() {
    planTitleEl.focus();
    const range = document.createRange();
    range.selectNodeContents(planTitleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // --- Export / Import -------------------------------------------------

  function slugify(name) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "stundenplan";
  }

  function exportPlan() {
    const json = serializePlan(plan());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(plan().name)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importPlanFromFile(file) {
    const text = await file.text();
    const imported = parsePlanImport(text);
    const newPlan = createEmptyPlan(imported.name);
    newPlan.rowCount = imported.rowCount;
    newPlan.times = imported.times;
    newPlan.entries = imported.entries;
    addPlan(store, newPlan);
    persist();
    renderAll();
  }

  // --- Event wiring -------------------------------------------------

  addRowBtn.addEventListener("click", addRow);
  resetBtn.addEventListener("click", resetAll);
  saveEntryBtn.addEventListener("click", saveEntry);
  deleteEntryBtn.addEventListener("click", deleteEntry);
  cancelModalBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  timePresetBtn.addEventListener("click", openTimeModal);
  cancelTimeModalBtn.addEventListener("click", closeTimeModal);
  timeModalOverlay.addEventListener("click", (e) => {
    if (e.target === timeModalOverlay) closeTimeModal();
  });
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = TIME_PRESETS[btn.dataset.preset];
      if (preset) applyTimes(preset.times);
    });
  });
  applyRasterBtn.addEventListener("click", () => {
    try {
      const times = generateRasterTimes(rasterInterval.value, rasterStart.value, rasterEnd.value);
      applyTimes(times);
    } catch (err) {
      alert(err.message);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modalOverlay.classList.contains("hidden")) closeModal();
    if (!timeModalOverlay.classList.contains("hidden")) closeTimeModal();
  });

  planSwitcher.addEventListener("change", () => {
    switchPlan(store, planSwitcher.value);
    persist();
    renderAll();
  });

  newPlanBtn.addEventListener("click", () => {
    const newPlan = createEmptyPlan(nextDefaultPlanName());
    addPlan(store, newPlan);
    persist();
    renderAll();
    focusPlanTitleForRename();
  });

  deletePlanBtn.addEventListener("click", () => {
    if (store.planOrder.length <= 1) return;
    const p = plan();
    if (!confirm(`Stundenplan "${p.name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) {
      return;
    }
    removePlan(store, p.id);
    persist();
    renderAll();
  });

  planTitleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      planTitleEl.blur();
    }
  });

  planTitleEl.addEventListener("blur", () => {
    const name = planTitleEl.textContent.trim() || DEFAULT_PLAN_NAME;
    planTitleEl.textContent = name;
    renamePlan(store, store.activePlanId, name);
    persist();
    renderPlanSwitcher();
    document.title = `${name} · Stundenplan`;
  });

  exportBtn.addEventListener("click", exportPlan);
  importBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", async () => {
    const file = importFileInput.files[0];
    importFileInput.value = "";
    if (!file) return;
    try {
      await importPlanFromFile(file);
    } catch (err) {
      alert(err.message || "Import fehlgeschlagen.");
    }
  });

  renderHeader();
  renderAll();
})();
