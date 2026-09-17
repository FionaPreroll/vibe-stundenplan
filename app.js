import {
  generateRasterTimes,
  parseTimeToMinutes,
  TIME_PRESETS,
  computeEntryUpdate,
  computeSubRangeInset,
  mergeTimes,
  requiredRowCount,
  cellKey,
  findOverlappingKeys,
  applyEntryToAllDays,
  rowHasEntries,
  removeRow,
} from "./logic.js";
import { serializePlan, parsePlanImport, serializeAllPlans, parseAllPlansImport } from "./io.js";
import {
  loadStore,
  saveStore,
  getActivePlan,
  getLanguage,
  setLanguage,
  getEditLocked,
  setEditLocked,
  getTheme,
  setTheme,
  addPlan,
  removePlan,
  renamePlan,
  switchPlan,
  createEmptyPlan,
  INITIAL_ROW_COUNT,
} from "./store.js";
import { DAYS_BY_LANGUAGE, DEFAULT_LANGUAGE, detectDefaultLanguage, translate } from "./i18n.js";
import { createRenderer, focusAndSelect } from "./render.js";
import { createSelectionController } from "./selection.js";
import { createColumnsController } from "./columns.js";

(() => {
  const NOW_HIGHLIGHT_INTERVAL_MS = 30000;
  const TOAST_DURATION_MS = 2500;

  let store = loadStore(window.localStorage, detectDefaultLanguage(navigator.language));

  function t(key, params) {
    return translate(getLanguage(store), key, params);
  }

  const planTitleEl = document.getElementById("planTitle");
  const planSwitcher = document.getElementById("planSwitcher");
  const newPlanBtn = document.getElementById("newPlanBtn");
  const deletePlanBtn = document.getElementById("deletePlanBtn");
  const languageSwitcher = document.getElementById("languageSwitcher");
  const editLockBtn = document.getElementById("editLockBtn");
  const themeSwitcher = document.getElementById("themeSwitcher");
  const aboutBtn = document.getElementById("aboutBtn");
  const aboutModalOverlay = document.getElementById("aboutModalOverlay");
  const closeAboutModalBtn = document.getElementById("closeAboutModalBtn");

  const headerRow = document.getElementById("headerRow");
  const timeColEl = document.querySelector(".time-col");
  const timeColResizeHandle = document.getElementById("timeColResizeHandle");
  const planBody = document.getElementById("planBody");
  const addRowBtn = document.getElementById("addRowBtn");
  const resetBtn = document.getElementById("resetBtn");
  const printBtn = document.getElementById("printBtn");
  const jumpToNowBtn = document.getElementById("jumpToNowBtn");
  const exportBtn = document.getElementById("exportBtn");
  const exportAllBtn = document.getElementById("exportAllBtn");
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFileInput");
  const toastEl = document.getElementById("toast");

  const modalOverlay = document.getElementById("modalOverlay");
  const entryForm = document.getElementById("entryForm");
  const modalTitleHeading = document.getElementById("modalTitleHeading");
  const modalRangeInfo = document.getElementById("modalRangeInfo");
  const fieldTitle = document.getElementById("fieldTitle");
  const fieldStartTime = document.getElementById("fieldStartTime");
  const fieldEndTime = document.getElementById("fieldEndTime");
  const timeHint = document.getElementById("timeHint");
  const fieldDescription = document.getElementById("fieldDescription");
  const fieldLink = document.getElementById("fieldLink");
  const applyAllDaysField = document.getElementById("applyAllDaysField");
  const applyAllDaysCheckbox = document.getElementById("applyAllDaysCheckbox");
  const colorSwatchesEl = document.getElementById("colorSwatches");
  const deleteEntryBtn = document.getElementById("deleteEntryBtn");
  const cancelModalBtn = document.getElementById("cancelModalBtn");

  const timePresetBtn = document.getElementById("timePresetBtn");
  const timeModalOverlay = document.getElementById("timeModalOverlay");
  const timeForm = document.getElementById("timeForm");
  const cancelTimeModalBtn = document.getElementById("cancelTimeModalBtn");
  const rasterInterval = document.getElementById("rasterInterval");
  const rasterStart = document.getElementById("rasterStart");
  const rasterEnd = document.getElementById("rasterEnd");

  let activeSelection = null; // { day, rowStart, rowEnd, isNewRange }

  function plan() {
    return getActivePlan(store);
  }

  function persist() {
    saveStore(store, window.localStorage);
  }

  // --- Undo (single level) ------------------------------------------------
  // Every action that mutates the active plan's own content (entries, day
  // columns, times/rowCount, column widths, its name) snapshots the plan
  // first — a deep clone, since which fields change varies per action.
  // Deliberately just one level ("the last action", not a full history) and
  // scoped to plan *content*: store-level preferences (theme, language,
  // edit lock, which plan is active) aren't snapshotted, so Ctrl+Z never
  // surprises someone by reverting a toggle they made on purpose. Creating/
  // deleting/switching a whole plan is out of scope too — deletion already
  // has its own confirm(), and there's no sane single "content" to restore
  // a removed plan into.
  let undoSnapshot = null; // { planId, plan: <deep clone> }

  function snapshotForUndo() {
    undoSnapshot = { planId: store.activePlanId, plan: structuredClone(plan()) };
  }

  function clearUndoSnapshot() {
    undoSnapshot = null;
  }

  function performUndo() {
    if (getEditLocked(store)) return;
    if (!undoSnapshot || undoSnapshot.planId !== store.activePlanId) return;
    store.plans[undoSnapshot.planId] = undoSnapshot.plan;
    undoSnapshot = null;
    persist();
    renderer.renderAll();
    showToast(t("undoToast"));
  }

  // --- Toast (brief, non-blocking feedback) -------------------------------

  let toastHideTimer = null;

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => toastEl.classList.add("hidden"), TOAST_DURATION_MS);
  }

  // --- Module wiring --------------------------------------------------------
  // render.js needs callbacks into selection.js and columns.js to wire the
  // elements it creates, while selection.js and columns.js need to trigger
  // a re-render after they mutate the plan — a genuine circular dependency
  // between the three. Broken here the usual way for plain closures: the
  // `renderer` reference below is only read inside these thunks, and only
  // once a real user interaction calls back into selection/columns — by
  // which point `renderer` has long since been assigned.
  let renderer;

  const selection = createSelectionController({
    planBody,
    plan,
    store,
    t,
    persist,
    snapshotForUndo,
    showToast,
    renderBody: () => renderer.renderBody(),
    openEntryModal,
  });

  const columns = createColumnsController({
    headerRow,
    plan,
    t,
    persist,
    snapshotForUndo,
    renderHeader: () => renderer.renderHeader(),
    renderBody: () => renderer.renderBody(),
    focusAndSelect,
  });

  renderer = createRenderer({
    elements: {
      headerRow,
      timeColEl,
      planBody,
      planSwitcher,
      deletePlanBtn,
      planTitleEl,
      languageSwitcher,
      editLockBtn,
      themeSwitcher,
      colorSwatchesEl,
    },
    plan,
    store,
    t,
    wireCellSelection: selection.wireCellSelection,
    copyEntry: selection.copyEntry,
    wireDayRename: columns.wireDayRename,
    addDayColumn: columns.addDayColumn,
    removeDayColumn: columns.removeDayColumn,
    wireColumnResize: columns.wireColumnResize,
    removeRowAt,
    snapshotForUndo,
    persist,
  });

  setInterval(renderer.applyNowHighlight, NOW_HIGHLIGHT_INTERVAL_MS);
  jumpToNowBtn.addEventListener("click", renderer.jumpToNow);

  // --- Entry modal --------------------------------------------------------

  function describeSelection(day, rowStart, rowEnd) {
    const p = plan();
    if (rowStart === rowEnd) {
      const label = p.times[rowStart];
      return label ? `${day} · ${label}` : `${day} · ${t("rowLabelFallback", { n: rowStart + 1 })}`;
    }
    const startLabel = p.times[rowStart];
    const endLabel = p.times[rowEnd];
    if (!startLabel && !endLabel) {
      return `${day} · ${t("rowRangeLabelFallback", { a: rowStart + 1, b: rowEnd + 1 })}`;
    }
    const startText = startLabel ? startLabel.split("–")[0] : t("rowLabelFallback", { n: rowStart + 1 });
    const endText = endLabel ? endLabel.split("–").pop() : t("rowLabelFallback", { n: rowEnd + 1 });
    return `${day} · ${startText}–${endText}`;
  }

  function updateTimeHint() {
    if (!activeSelection) {
      timeHint.textContent = "";
      return;
    }
    const { rowStart, rowEnd } = activeSelection;
    const p = plan();
    const rowLabels = p.times.slice(rowStart, rowEnd + 1);
    const hasCustomTime = fieldStartTime.value || fieldEndTime.value;
    const inset = hasCustomTime ? computeSubRangeInset(rowLabels, fieldStartTime.value, fieldEndTime.value) : null;
    timeHint.textContent = hasCustomTime && !inset ? t("timeHintUnparseable") : "";
  }

  function openEntryModal({ day, rowStart, rowEnd, isNewRange, entry }) {
    activeSelection = { day, rowStart, rowEnd, isNewRange };
    fieldTitle.value = entry?.title || "";
    fieldStartTime.value = entry?.startTime || "";
    fieldEndTime.value = entry?.endTime || "";
    fieldDescription.value = entry?.description || "";
    fieldLink.value = entry?.link || "";
    // Only meaningful when creating a brand-new entry — editing an existing
    // one already has its own day/range, propagating it to every column
    // isn't what this checkbox is for.
    applyAllDaysField.style.display = isNewRange ? "flex" : "none";
    applyAllDaysCheckbox.checked = false;
    renderer.selectEntryColor(entry?.color || "");
    deleteEntryBtn.style.display = entry ? "inline-block" : "none";
    modalTitleHeading.textContent = entry ? t("entryEditTitle") : t("entryAddTitle");
    modalRangeInfo.textContent = describeSelection(day, rowStart, rowEnd);
    updateTimeHint();
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
    snapshotForUndo();
    const update = computeEntryUpdate(
      fieldTitle.value,
      fieldDescription.value,
      fieldLink.value,
      fieldStartTime.value,
      fieldEndTime.value,
      renderer.getSelectedEntryColor()
    );
    const anchorKey = cellKey(rowStart, day);

    if (update && isNewRange && applyAllDaysCheckbox.checked) {
      p.entries = applyEntryToAllDays(p.entries, p.days, rowStart, rowEnd, update);
      persist();
      renderer.renderBody();
      closeModal();
      return;
    }

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
    renderer.renderBody();
    closeModal();
  }

  function deleteEntry() {
    if (!activeSelection) return;
    const { day, rowStart } = activeSelection;
    snapshotForUndo();
    delete plan().entries[cellKey(rowStart, day)];
    persist();
    renderer.renderBody();
    closeModal();
  }

  // --- Time-grid modal ------------------------------------------------------

  function openTimeModal() {
    timeModalOverlay.classList.remove("hidden");
    setTimeout(() => rasterInterval.focus(), 0);
  }

  function closeTimeModal() {
    timeModalOverlay.classList.add("hidden");
  }

  // --- About modal -----------------------------------------------------------

  function openAboutModal() {
    aboutModalOverlay.classList.remove("hidden");
  }

  function closeAboutModal() {
    aboutModalOverlay.classList.add("hidden");
  }

  function applyTimes(newTimes) {
    if (newTimes.length === 0) return;
    const p = plan();

    const hasConflict = newTimes.some((t2, i) => p.times[i] && p.times[i] !== t2);
    if (hasConflict && !confirm(t("confirmOverwriteTimes"))) {
      return;
    }

    snapshotForUndo();
    p.rowCount = requiredRowCount(p.rowCount, newTimes.length);
    p.times = mergeTimes(p.times, newTimes);
    persist();
    renderer.renderBody();
    closeTimeModal();
  }

  // --- Row / reset actions -------------------------------------------------

  function addRow() {
    snapshotForUndo();
    plan().rowCount += 1;
    persist();
    renderer.renderBody();
  }

  function removeRowAt(rowIndex) {
    const p = plan();
    if (p.rowCount <= 0) return;

    if (rowHasEntries(rowIndex, p.days, p.entries)) {
      if (!confirm(t("confirmRemoveRowWithEntries"))) return;
    }

    snapshotForUndo();
    const result = removeRow(rowIndex, p.rowCount, p.times, p.entries);
    p.rowCount = result.rowCount;
    p.times = result.times;
    p.entries = result.entries;
    persist();
    renderer.renderBody();
  }

  function resetAll() {
    if (!confirm(t("confirmResetPlan"))) return;
    snapshotForUndo();
    const p = plan();
    p.rowCount = INITIAL_ROW_COUNT;
    p.times = [];
    p.entries = {};
    persist();
    renderer.renderBody();
  }

  // --- Plan management -------------------------------------------------

  function nextDefaultPlanName() {
    const base = t("newPlanName");
    const existingNames = new Set(Object.values(store.plans).map((p) => p.name));
    if (!existingNames.has(base)) return base;
    let i = 2;
    while (existingNames.has(`${base} ${i}`)) i += 1;
    return `${base} ${i}`;
  }

  function focusPlanTitleForRename() {
    focusAndSelect(planTitleEl);
  }

  // --- Export / Import -------------------------------------------------

  function slugify(name) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "stundenplan";
  }

  function downloadJson(json, filename) {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPlan() {
    downloadJson(serializePlan(plan()), `${slugify(plan().name)}.json`);
  }

  function exportAllPlans() {
    downloadJson(serializeAllPlans(store), "vibe-stundenplan-all.json");
  }

  function addImportedPlan(imported) {
    const newPlan = createEmptyPlan(imported.name, getLanguage(store));
    newPlan.rowCount = imported.rowCount;
    newPlan.times = imported.times;
    newPlan.entries = imported.entries;
    newPlan.days = imported.days;
    addPlan(store, newPlan);
  }

  // Auto-detects a single-plan (`{ plan: {...} }`) vs. an all-plans
  // (`{ plans: [...] }`) export file from its own shape, rather than
  // needing a separate "import all" button/file picker — whichever a
  // parse attempt actually finds decides how many plans get imported.
  // Both paths only ever add new plans, never overwrite existing ones.
  async function importPlanFromFile(file) {
    const text = await file.text();
    let isAllPlansFile = false;
    try {
      const probe = JSON.parse(text);
      isAllPlansFile = !!(probe && Array.isArray(probe.plans));
    } catch {
      // Not valid JSON at all — fall through so parsePlanImport below
      // raises the same errorInvalidJson it always would.
    }

    const importedPlans = isAllPlansFile
      ? parseAllPlansImport(text, getLanguage(store))
      : [parsePlanImport(text, getLanguage(store))];

    importedPlans.forEach(addImportedPlan);
    persist();
    renderer.renderAll();
  }

  // --- Event wiring -------------------------------------------------

  addRowBtn.addEventListener("click", addRow);
  resetBtn.addEventListener("click", resetAll);
  columns.wireColumnResize(timeColResizeHandle, { kind: "time", th: timeColEl });

  printBtn.addEventListener("click", () => window.print());
  deleteEntryBtn.addEventListener("click", deleteEntry);
  cancelModalBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  entryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveEntry();
  });
  fieldStartTime.addEventListener("input", updateTimeHint);
  fieldEndTime.addEventListener("input", updateTimeHint);

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
  aboutBtn.addEventListener("click", openAboutModal);
  closeAboutModalBtn.addEventListener("click", closeAboutModal);
  aboutModalOverlay.addEventListener("click", (e) => {
    if (e.target === aboutModalOverlay) closeAboutModal();
  });

  themeSwitcher.addEventListener("change", () => {
    setTheme(store, themeSwitcher.value);
    persist();
    renderer.applyTheme();
  });

  editLockBtn.addEventListener("click", () => {
    setEditLocked(store, !getEditLocked(store));
    persist();
    renderer.applyEditLocked();
  });

  timeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const startMin = parseTimeToMinutes(rasterStart.value);
      const endMin = parseTimeToMinutes(rasterEnd.value);
      if (startMin === null || endMin === null) {
        throw new Error(t("alertRasterNeedsTimes"));
      }
      const times = generateRasterTimes(rasterInterval.value, startMin, endMin);
      applyTimes(times);
    } catch (err) {
      alert(err.code ? t(err.code) : err.message);
    }
  });

  // A focused <input>/<textarea>/contenteditable gets the browser's own
  // native text-undo for Ctrl+Z — e.g. mid-edit in the entry modal, or
  // typing a time label or day name directly in the grid. Our plan-level
  // undo only takes over when focus isn't in one of those, so the two
  // never fight over the same keystroke.
  function isEditableFocus(el) {
    if (!el) return false;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
    return el.isContentEditable;
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      selection.disarmPaste();
      if (!modalOverlay.classList.contains("hidden")) closeModal();
      if (!timeModalOverlay.classList.contains("hidden")) closeTimeModal();
      if (!aboutModalOverlay.classList.contains("hidden")) closeAboutModal();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      if (isEditableFocus(document.activeElement)) return;
      e.preventDefault();
      performUndo();
    }
    // Ctrl+C over a filled cell copies that entry; Ctrl+V arms "paste
    // mode" (a cursor change + body class) rather than pasting immediately
    // — the next click on any cell places it there (see selection.js's
    // wireCellSelection), mirroring drag-to-move's own "grab, then drop"
    // gesture instead of needing the mouse to already be over the target
    // cell at the moment of the shortcut.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "c") {
      if (isEditableFocus(document.activeElement)) return;
      if (getEditLocked(store)) return;
      if (selection.copyHoveredEntry()) e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "v") {
      if (isEditableFocus(document.activeElement)) return;
      if (getEditLocked(store)) return;
      if (selection.armPaste()) e.preventDefault();
    }
  });

  planSwitcher.addEventListener("change", () => {
    // Undo is scoped to "the last action on the plan I'm currently looking
    // at" — leaving it (even briefly, then coming back) ends that context,
    // rather than leaving a stale snapshot Ctrl+Z could unexpectedly jump
    // back to later.
    clearUndoSnapshot();
    switchPlan(store, planSwitcher.value);
    persist();
    renderer.renderAll();
  });

  newPlanBtn.addEventListener("click", () => {
    clearUndoSnapshot();
    const newPlan = createEmptyPlan(nextDefaultPlanName(), getLanguage(store));
    addPlan(store, newPlan);
    persist();
    renderer.renderAll();
    focusPlanTitleForRename();
  });

  deletePlanBtn.addEventListener("click", () => {
    if (store.planOrder.length <= 1) return;
    const p = plan();
    if (!confirm(t("confirmDeletePlan", { name: p.name }))) return;
    clearUndoSnapshot();
    removePlan(store, p.id);
    persist();
    renderer.renderAll();
  });

  languageSwitcher.addEventListener("change", () => {
    const oldLanguage = getLanguage(store);
    const newLanguage = languageSwitcher.value;

    if (newLanguage !== oldLanguage) {
      const oldDefaults = DAYS_BY_LANGUAGE[oldLanguage] || DAYS_BY_LANGUAGE[DEFAULT_LANGUAGE];
      const newDefaults = DAYS_BY_LANGUAGE[newLanguage] || DAYS_BY_LANGUAGE[DEFAULT_LANGUAGE];
      Object.values(store.plans).forEach((p) => columns.translatePlanDayNames(p, oldDefaults, newDefaults));
    }

    setLanguage(store, newLanguage);
    persist();
    renderer.renderAll();
  });

  planTitleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      planTitleEl.blur();
    }
  });

  planTitleEl.addEventListener("blur", () => {
    const name = planTitleEl.textContent.trim() || t("defaultPlanName");
    if (name !== plan().name) snapshotForUndo();
    planTitleEl.textContent = name;
    renamePlan(store, store.activePlanId, name);
    persist();
    renderer.renderPlanSwitcher();
    document.title = `${name} · ${t("appTitleSuffix")}`;
  });

  exportBtn.addEventListener("click", exportPlan);
  exportAllBtn.addEventListener("click", exportAllPlans);
  importBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", async () => {
    const file = importFileInput.files[0];
    importFileInput.value = "";
    if (!file) return;
    try {
      await importPlanFromFile(file);
    } catch (err) {
      alert(err.code ? t(err.code) : err.message || t("alertImportFailed"));
    }
  });

  renderer.buildColorSwatches();
  renderer.renderAll();
})();
