import {
  cellKey,
  generateRasterTimes,
  parseTimeToMinutes,
  parseTimeRangeToMinutes,
  TIME_PRESETS,
  computeEntryUpdate,
  computeSubRangeInset,
  mergeTimes,
  requiredRowCount,
  getEntrySpan,
  getCellRenderInfo,
  computeSelectionRange,
  findOverlappingKeys,
  applyEntryToAllDays,
  moveEntry,
  rowHasEntries,
  removeRow,
  findAnchorRow,
  dayHasEntries,
  removeDayEntries,
  renameDayEntries,
  isDayNameTaken,
  renameDayWidth,
  removeDayWidth,
  translateDefaultDayNames,
} from "./logic.js";
import { serializePlan, parsePlanImport, serializeAllPlans, parseAllPlansImport } from "./io.js";
import {
  loadStore,
  saveStore,
  getActivePlan,
  getLanguage,
  setLanguage,
  getShowEditIcons,
  setShowEditIcons,
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
import {
  DAYS_BY_LANGUAGE,
  DAYS_SHORT_BY_LANGUAGE,
  DEFAULT_LANGUAGE,
  WEEKDAYS_BY_LANGUAGE,
  detectDefaultLanguage,
  translate,
} from "./i18n.js";

(() => {
  const ROW_HEIGHT_PX = 70; // keep in sync with `tbody td { height }` in style.css
  const NOW_HIGHLIGHT_INTERVAL_MS = 30000;
  const MIN_COL_WIDTH = 60;
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
  const editIconsToggle = document.getElementById("editIconsToggle");
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
  // mode: "select" (dragging from an empty cell to define a new entry's
  // range) or "move" (dragging an existing entry to relocate it) — see
  // wireCellSelection. currentDay only changes for "move" (a selection drag
  // stays within the day column it started in; a move can cross columns).
  let dragState = null; // { mode, day, anchorRow, currentDay, currentRow, span }

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
    renderAll();
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

  function rainbowPalette() {
    const styles = getComputedStyle(document.documentElement);
    const colors = [];
    for (let i = 1; i <= 7; i++) {
      const v = styles.getPropertyValue(`--day-${i}`).trim();
      if (v) colors.push(v);
    }
    return colors.length ? colors : ["#8fb8ff"];
  }
  const RAINBOW = rainbowPalette();

  // --- Per-entry color ------------------------------------------------------

  // Entries can be tinted with one of the app's own rainbow hues (the same
  // ones already used for day headers) instead of inventing a separate
  // palette — keeps the visual language consistent and needs no color
  // picker UI. Swatches are built once (static content); "selected" state
  // just tracks which one is currently active while the modal is open.
  let selectedEntryColor = ""; // "" = no color (the default, neutral look)

  function buildColorSwatches() {
    colorSwatchesEl.innerHTML = "";

    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "color-swatch color-swatch-none";
    noneBtn.dataset.color = "";
    noneBtn.dataset.i18nTitle = "colorNoneTitle";
    noneBtn.dataset.i18nAriaLabel = "colorNoneTitle";
    noneBtn.addEventListener("click", () => selectEntryColor(""));
    colorSwatchesEl.appendChild(noneBtn);

    RAINBOW.forEach((color) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-swatch";
      btn.style.background = color;
      btn.dataset.color = color;
      btn.addEventListener("click", () => selectEntryColor(color));
      colorSwatchesEl.appendChild(btn);
    });
  }

  function selectEntryColor(color) {
    selectedEntryColor = color;
    colorSwatchesEl.querySelectorAll(".color-swatch").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.color === color);
    });
  }

  // Only a still-default weekday name (exact match against the current
  // language's defaults, same rule translateDefaultDayNames uses) has a
  // language-correct abbreviation; a custom/renamed column just keeps its
  // full text and wraps as usual — there's no good way to guess a short
  // form for arbitrary user text.
  function shortDayLabel(day, language) {
    const idx = DAYS_BY_LANGUAGE[language]?.indexOf(day);
    if (idx === undefined || idx === -1) return day;
    return DAYS_SHORT_BY_LANGUAGE[language][idx];
  }

  // --- i18n ---------------------------------------------------------------

  function applyStaticTranslations() {
    document.documentElement.lang = getLanguage(store);
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
    });
    languageSwitcher.value = getLanguage(store);
  }

  function applyEditIconsVisibility() {
    const show = getShowEditIcons(store);
    document.body.classList.toggle("hide-edit-icons", !show);
    editIconsToggle.checked = show;
  }

  // A "just look at and use the schedule" mode: hides the toolbar, the plan
  // +/- buttons, the about button, and (like hide-edit-icons) the inline
  // row/column-remove icons — collapsed narrower than 600px, only the title
  // is left — and actually locks editing: no new entries, no renaming the
  // plan title or day columns. Doesn't touch the underlying showEditIcons
  // preference, so unlocking again restores whatever that toggle had.
  // Switching plans, theme, language, and printing stay available since
  // they don't mutate the current plan's content.
  function applyEditLocked() {
    const locked = getEditLocked(store);
    document.body.classList.toggle("edit-locked", locked);
    editLockBtn.textContent = locked ? "🔒" : "🔓";
    const titleKey = locked ? "unlockEditingTitle" : "lockEditingTitle";
    editLockBtn.title = t(titleKey);
    editLockBtn.setAttribute("aria-label", t(titleKey));
    planTitleEl.contentEditable = locked ? "false" : "true";
    headerRow.querySelectorAll(".day-name").forEach((el) => {
      el.contentEditable = locked ? "false" : "true";
    });
  }

  // "system" leaves data-theme unset so the @media (prefers-color-scheme)
  // rules in style.css decide; "light"/"dark" force one via the attribute
  // regardless of the OS preference (see style.css for the token overrides).
  function applyTheme() {
    const theme = getTheme(store);
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset.theme = theme;
    }
    themeSwitcher.value = theme;
  }

  // --- Rendering --------------------------------------------------------

  function renderHeader() {
    const p = plan();
    headerRow.querySelectorAll("th.day-col, th.add-day-col").forEach((el) => el.remove());

    timeColEl.style.width = p.timeColWidth ? `${p.timeColWidth}px` : "";

    p.days.forEach((day, index) => {
      const th = document.createElement("th");
      th.className = "day-col";
      th.style.background = RAINBOW[index % RAINBOW.length];
      if (p.columnWidths[day]) th.style.width = `${p.columnWidths[day]}px`;

      const inner = document.createElement("div");
      inner.className = "day-col-inner";

      const nameEl = document.createElement("span");
      nameEl.className = "day-name";
      nameEl.contentEditable = getEditLocked(store) ? "false" : "true";
      nameEl.spellcheck = false;
      nameEl.textContent = day;
      nameEl.title = t("renameHint");
      wireDayRename(nameEl, index);
      inner.appendChild(nameEl);

      // Shown instead of nameEl only below a width breakpoint (style.css),
      // so a default weekday name doesn't wrap into an unreadable stack of
      // single words on a narrow screen. Not editable itself — tapping it
      // reveals and focuses the real (full-name) nameEl above.
      const shortEl = document.createElement("span");
      shortEl.className = "day-name-short";
      shortEl.setAttribute("aria-hidden", "true");
      shortEl.textContent = shortDayLabel(day, getLanguage(store));
      shortEl.addEventListener("click", () => {
        if (getEditLocked(store)) return;
        focusAndSelect(nameEl);
      });
      inner.appendChild(shortEl);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "col-remove-btn";
      removeBtn.title = t("removeDayColTitle");
      removeBtn.setAttribute("aria-label", t("removeDayColTitle"));
      removeBtn.textContent = "×";
      removeBtn.disabled = p.days.length <= 1;
      removeBtn.addEventListener("click", () => removeDayColumn(index));
      inner.appendChild(removeBtn);

      th.appendChild(inner);

      const resizeHandle = document.createElement("div");
      resizeHandle.className = "col-resize-handle";
      resizeHandle.setAttribute("aria-hidden", "true");
      wireColumnResize(resizeHandle, { kind: "day", th, day });
      th.appendChild(resizeHandle);

      headerRow.appendChild(th);
    });

    const addTh = document.createElement("th");
    addTh.className = "add-day-col";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "icon-btn";
    addBtn.title = t("addDayColTitle");
    addBtn.setAttribute("aria-label", t("addDayColTitle"));
    addBtn.textContent = "+";
    addBtn.addEventListener("click", addDayColumn);
    addTh.appendChild(addBtn);
    headerRow.appendChild(addTh);
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
    document.title = `${p.name} · ${t("appTitleSuffix")}`;
  }

  function renderBody() {
    const p = plan();
    planBody.innerHTML = "";

    for (let row = 0; row < p.rowCount; row++) {
      const tr = document.createElement("tr");

      const timeTd = document.createElement("td");
      timeTd.className = "time-cell";
      // Mirrors timeColEl.style.width (renderHeader, below) exactly. Below
      // 600px this cell is position: sticky (style.css) — table-layout:
      // fixed normally keeps every cell in a column the same width without
      // needing this, but Firefox has a bug where a sticky table cell's
      // width collapses to its content on horizontal scroll unless it has
      // its own explicit width, rather than only inheriting the column's.
      // .time-col (the header, which sets its own width directly) never
      // had this problem; only .time-cell, which never set one, did.
      timeTd.style.width = p.timeColWidth ? `${p.timeColWidth}px` : "";

      // The flex layout for the label + remove button lives on this inner
      // wrapper rather than directly on timeTd itself, for unrelated
      // reasons (see .time-cell-inner in style.css).
      const timeInner = document.createElement("div");
      timeInner.className = "time-cell-inner";
      timeTd.appendChild(timeInner);

      const timeLabel = document.createElement("span");
      timeLabel.className = "time-label";
      timeLabel.contentEditable = "true";
      timeLabel.spellcheck = false;
      timeLabel.dataset.placeholder = t("timeInputPlaceholder");
      timeLabel.textContent = p.times[row] || "";
      timeLabel.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          timeLabel.blur();
        }
      });
      // Snapshotted once per edit session (on focus), not per keystroke —
      // "input" fires on every character, and undoing a whole retyped
      // label back to its pre-edit text in one Ctrl+Z is the useful
      // granularity, not one letter at a time.
      timeLabel.addEventListener("focus", () => {
        snapshotForUndo();
      });
      timeLabel.addEventListener("input", () => {
        p.times[row] = timeLabel.textContent;
        persist();
      });
      timeInner.appendChild(timeLabel);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "row-remove-btn";
      removeBtn.title = t("removeRowTitle");
      removeBtn.setAttribute("aria-label", t("removeRowTitle"));
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => removeRowAt(row));
      timeInner.appendChild(removeBtn);

      tr.appendChild(timeTd);

      p.days.forEach((day) => {
        const info = getCellRenderInfo(row, day, p.entries);
        if (info.hidden) return;

        const td = document.createElement("td");
        td.className = "data-cell";
        td.dataset.key = info.key;
        td.dataset.row = String(row);
        td.dataset.day = day;
        if (info.span > 1) td.rowSpan = info.span;

        const rowLabels = p.times.slice(row, row + info.span);
        renderCellContent(td, info.entry, rowLabels, info.span);
        wireCellSelection(td, row, day);
        tr.appendChild(td);
      });

      planBody.appendChild(tr);
    }

    applyNowHighlight();
  }

  function renderCellContent(td, entry, rowLabels, span) {
    td.innerHTML = "";
    const entryBox = document.createElement("div");
    entryBox.className = "entry-box";
    td.appendChild(entryBox);

    if (entry && entry.title) {
      td.classList.add("filled");

      if (entry.color) {
        td.classList.add("has-color");
        td.style.setProperty("--entry-hue", entry.color);
      }

      if (entry.startTime || entry.endTime) {
        const badge = document.createElement("p");
        badge.className = "entry-time-badge";
        badge.textContent = `${entry.startTime || "?"}–${entry.endTime || "?"}`;
        entryBox.appendChild(badge);

        // Insets the box itself (not just its content) within the covered
        // rows, so a partially-filled raster row visually starts/ends where
        // the entry's real time does, instead of a full-height box with
        // padding pushing the text down inside it.
        const inset = computeSubRangeInset(rowLabels, entry.startTime, entry.endTime);
        if (inset) {
          const totalHeight = ROW_HEIGHT_PX * span;
          entryBox.style.top = `${Math.round(totalHeight * inset.topFraction)}px`;
          entryBox.style.bottom = `${Math.round(totalHeight * inset.bottomFraction)}px`;
        }
      }

      const title = document.createElement("p");
      title.className = "entry-title";
      title.textContent = entry.title;
      entryBox.appendChild(title);

      if (entry.description) {
        const desc = document.createElement("p");
        desc.className = "entry-description";
        desc.textContent = entry.description;
        entryBox.appendChild(desc);
      }

      if (entry.link) {
        const link = document.createElement("a");
        link.className = "entry-link";
        link.href = entry.link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = t("linkText");
        link.addEventListener("mousedown", (e) => e.stopPropagation());
        link.addEventListener("click", (e) => e.stopPropagation());
        entryBox.appendChild(link);
      }
    } else {
      td.classList.remove("filled");
      const placeholder = document.createElement("span");
      placeholder.className = "cell-placeholder";
      placeholder.textContent = "+";
      entryBox.appendChild(placeholder);
    }
  }

  function renderAll() {
    applyStaticTranslations();
    applyEditIconsVisibility();
    applyEditLocked();
    applyTheme();
    renderHeader();
    renderPlanSwitcher();
    renderPlanTitle();
    renderBody();
  }

  // --- "Now" highlight ---------------------------------------------------

  // Shared by the highlight below and the "jump to now" button: which row
  // (by the current time-of-day against the plan's own raster) and day
  // column (by today's weekday name) count as "now" right now.
  function computeNowPosition() {
    const p = plan();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const weekdayNames = WEEKDAYS_BY_LANGUAGE[getLanguage(store)];
    const todayName = weekdayNames[now.getDay()];

    let currentRow = -1;
    for (let row = 0; row < p.rowCount; row++) {
      const range = parseTimeRangeToMinutes(p.times[row]);
      if (range && nowMinutes >= range.start && nowMinutes < range.end) {
        currentRow = row;
        break;
      }
    }

    const dayIndex = p.days.indexOf(todayName);
    return { currentRow, todayName, dayIndex };
  }

  function applyNowHighlight() {
    headerRow.querySelectorAll(".current-day-col").forEach((el) => el.classList.remove("current-day-col"));
    planBody.querySelectorAll(".current-row").forEach((el) => el.classList.remove("current-row"));
    planBody.querySelectorAll(".current-cell").forEach((el) => el.classList.remove("current-cell"));

    const { currentRow, todayName, dayIndex } = computeNowPosition();
    if (currentRow === -1) return;

    const timeRow = planBody.children[currentRow];
    timeRow?.querySelector(".time-cell")?.classList.add("current-row");

    if (dayIndex === -1) return;

    const headerCells = headerRow.querySelectorAll("th.day-col");
    headerCells[dayIndex]?.classList.add("current-day-col");

    const anchorRow = findAnchorRow(currentRow, todayName, plan().entries);
    if (anchorRow === null) return;
    const anchorKey = cellKey(anchorRow, todayName);
    planBody.querySelectorAll(".data-cell").forEach((td) => {
      if (td.dataset.key === anchorKey) td.classList.add("current-cell");
    });
  }

  setInterval(applyNowHighlight, NOW_HIGHLIGHT_INTERVAL_MS);

  // --- "Jump to now" --------------------------------------------------------

  // Scrolls the current row/day into view — handy on a long plan, or on
  // mobile after scrolling far away. Falls back gracefully: if only the row
  // or only the day is known (e.g. today isn't a column in this plan, or no
  // raster row covers the current time), it scrolls to whichever is known
  // instead of doing nothing.
  function jumpToNow() {
    const { currentRow, todayName, dayIndex } = computeNowPosition();
    let target = null;
    if (currentRow !== -1 && dayIndex !== -1) {
      target = planBody.querySelector(`td[data-row="${currentRow}"][data-day="${CSS.escape(todayName)}"]`);
    } else if (currentRow !== -1) {
      target = planBody.children[currentRow]?.querySelector(".time-cell");
    } else if (dayIndex !== -1) {
      target = planBody.querySelector(`td[data-day="${CSS.escape(todayName)}"]`);
    }
    target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  jumpToNowBtn.addEventListener("click", jumpToNow);

  // --- Drag-to-select ranges, and drag-to-move an existing entry ---------

  function wireCellSelection(td, row, day) {
    td.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (getEditLocked(store)) return;
      e.preventDefault();
      const existing = plan().entries[cellKey(row, day)];
      if (existing) {
        dragState = { mode: "move", day, anchorRow: row, currentDay: day, currentRow: row, span: getEntrySpan(existing) };
        document.body.classList.add("no-select");
        highlightMoveTarget(day, row, dragState.span);
      } else {
        dragState = { mode: "select", day, anchorRow: row, currentDay: day, currentRow: row };
        document.body.classList.add("no-select");
        highlightSelection(day, row, row);
      }
    });

    td.addEventListener("mouseenter", () => {
      if (!dragState) return;
      if (dragState.mode === "move") {
        dragState.currentDay = day;
        dragState.currentRow = row;
        highlightMoveTarget(day, row, dragState.span);
        return;
      }
      if (dragState.day !== day) return;
      dragState.currentRow = row;
      highlightSelection(dragState.day, dragState.anchorRow, row);
    });

    wireCellSelectionTouch(td, row, day);
  }

  // Touch has no hover, so a plain per-cell "mouseenter" can't track a
  // finger dragging across cells — and a touchmove listener that always
  // preventDefault()s from the first touch would break ordinary page
  // scrolling over the table. Long-press to arm drag-select instead: a
  // quick tap/swipe never triggers the timer below, so it falls through to
  // the browser's own synthetic mouse events (mousedown/mouseup) already
  // wired above, which already do the right thing for a single tap. Only
  // once the press has held still past LONG_PRESS_MS do we take over
  // touchmove (with preventDefault) to track the drag.
  const LONG_PRESS_MS = 350;
  const TOUCH_MOVE_CANCEL_PX = 10;
  let touchPressTimer = null;
  let touchPressStart = null; // { x, y }
  let touchDragActive = false;

  function wireCellSelectionTouch(td, row, day) {
    td.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        if (getEditLocked(store)) return;
        const touch = e.touches[0];
        touchPressStart = { x: touch.clientX, y: touch.clientY };
        touchDragActive = false;
        clearTimeout(touchPressTimer);
        touchPressTimer = setTimeout(() => {
          touchDragActive = true;
          const existing = plan().entries[cellKey(row, day)];
          if (existing) {
            dragState = { mode: "move", day, anchorRow: row, currentDay: day, currentRow: row, span: getEntrySpan(existing) };
            highlightMoveTarget(day, row, dragState.span);
          } else {
            dragState = { mode: "select", day, anchorRow: row, currentDay: day, currentRow: row };
            highlightSelection(day, row, row);
          }
          document.body.classList.add("no-select");
          navigator.vibrate?.(15);
        }, LONG_PRESS_MS);
      },
      { passive: true }
    );
  }

  function cellFromTouchPoint(x, y) {
    return document.elementFromPoint(x, y)?.closest("td.data-cell") || null;
  }

  document.addEventListener(
    "touchmove",
    (e) => {
      if (touchDragActive && dragState) {
        e.preventDefault();
        const touch = e.touches[0];
        const cell = cellFromTouchPoint(touch.clientX, touch.clientY);
        if (!cell) return;
        if (dragState.mode === "move") {
          dragState.currentDay = cell.dataset.day;
          dragState.currentRow = Number(cell.dataset.row);
          highlightMoveTarget(dragState.currentDay, dragState.currentRow, dragState.span);
          return;
        }
        if (cell.dataset.day !== dragState.day) return;
        dragState.currentRow = Number(cell.dataset.row);
        highlightSelection(dragState.day, dragState.anchorRow, dragState.currentRow);
        return;
      }
      if (touchPressTimer && touchPressStart) {
        const touch = e.touches[0];
        const moved = Math.hypot(touch.clientX - touchPressStart.x, touch.clientY - touchPressStart.y);
        if (moved > TOUCH_MOVE_CANCEL_PX) {
          clearTimeout(touchPressTimer);
          touchPressTimer = null;
          touchPressStart = null;
        }
      }
    },
    { passive: false }
  );

  function endTouchDrag() {
    clearTimeout(touchPressTimer);
    touchPressTimer = null;
    touchPressStart = null;
    if (!touchDragActive) return;
    touchDragActive = false;
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    document.body.classList.remove("no-select");
    clearHighlight();
    if (state.mode === "move") {
      finalizeMove(state);
    } else {
      finalizeSelection(state.day, state.anchorRow, state.currentRow);
    }
  }

  document.addEventListener("touchend", endTouchDrag);
  document.addEventListener("touchcancel", () => {
    clearTimeout(touchPressTimer);
    touchPressTimer = null;
    touchPressStart = null;
    if (touchDragActive) {
      touchDragActive = false;
      dragState = null;
      document.body.classList.remove("no-select");
      clearHighlight();
    }
  });

  function clearHighlight() {
    planBody.querySelectorAll(".data-cell.selecting").forEach((el) => el.classList.remove("selecting"));
    planBody.querySelectorAll(".data-cell.drop-target").forEach((el) => el.classList.remove("drop-target"));
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

  // Previews where a dragged entry would land if dropped on (day, row) right
  // now — clamped the same way moveEntry itself clamps on drop, so the
  // preview never lies about a span getting pulled back from the bottom
  // edge of the grid.
  function highlightMoveTarget(day, row, span) {
    clearHighlight();
    const p = plan();
    const clampedRow = Math.max(0, Math.min(row, p.rowCount - span));
    planBody.querySelectorAll(".data-cell").forEach((td) => {
      if (td.dataset.day !== day) return;
      const r = Number(td.dataset.row);
      const cellSpan = td.rowSpan || 1;
      if (r + cellSpan - 1 >= clampedRow && r <= clampedRow + span - 1) {
        td.classList.add("drop-target");
      }
    });
  }

  document.addEventListener("mouseup", () => {
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    document.body.classList.remove("no-select");
    clearHighlight();
    if (state.mode === "move") {
      finalizeMove(state);
    } else {
      finalizeSelection(state.day, state.anchorRow, state.currentRow);
    }
  });

  // A drop back on the entry's own starting cell isn't a move — it's the
  // drag-to-move equivalent of a plain click, so it opens the entry for
  // editing instead, the same as a no-drag click on a filled cell already
  // does via finalizeSelection below.
  function finalizeMove({ day, anchorRow, currentDay, currentRow }) {
    const p = plan();
    if (currentDay === day && currentRow === anchorRow) {
      const existing = p.entries[cellKey(anchorRow, day)];
      if (existing) {
        openEntryModal({
          day,
          rowStart: anchorRow,
          rowEnd: anchorRow + getEntrySpan(existing) - 1,
          isNewRange: false,
          entry: existing,
        });
      }
      return;
    }
    // Mirrors moveEntry's own clamping/overlap logic (logic.js) just to
    // find out, before the move happens, whether it's about to silently
    // replace a different entry — moveEntry itself doesn't report that,
    // it just does it (same overwrite rule as any other save, item 4).
    const fromKey = cellKey(anchorRow, day);
    const movingEntry = p.entries[fromKey];
    const span = getEntrySpan(movingEntry);
    const clampedRow = Math.max(0, Math.min(currentRow, p.rowCount - span));
    const entriesWithoutSource = { ...p.entries };
    delete entriesWithoutSource[fromKey];
    const overwrittenTitles = findOverlappingKeys(entriesWithoutSource, currentDay, clampedRow, clampedRow + span - 1)
      .map((k) => entriesWithoutSource[k].title)
      .filter(Boolean);

    snapshotForUndo();
    p.entries = moveEntry(p.entries, day, anchorRow, currentDay, currentRow, p.rowCount);
    persist();
    renderBody();

    if (overwrittenTitles.length === 1) {
      showToast(t("dragOverwriteToastOne", { title: overwrittenTitles[0] }));
    } else if (overwrittenTitles.length > 1) {
      showToast(t("dragOverwriteToastMany", { count: overwrittenTitles.length }));
    }
  }

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

  // --- Manual column resize ------------------------------------------------
  // Lets the time column (and day columns) be widened past their default so
  // raster labels like "16:40–18:10" aren't clipped; see the .time-label
  // wrap-at-hyphen fallback in style.css for when resizing alone isn't done.

  let colResizeState = null; // { target, th, startX, startWidth }

  function wireColumnResize(handle, target) {
    if (!handle) return;
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      colResizeState = {
        target,
        th: target.th,
        startX: e.clientX,
        startWidth: target.th.getBoundingClientRect().width,
      };
      document.body.classList.add("no-select");
    });
  }

  document.addEventListener("mousemove", (e) => {
    if (!colResizeState) return;
    const delta = e.clientX - colResizeState.startX;
    const newWidth = Math.max(MIN_COL_WIDTH, Math.round(colResizeState.startWidth + delta));
    colResizeState.th.style.width = `${newWidth}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!colResizeState) return;
    const { target, th } = colResizeState;
    const width = Math.max(MIN_COL_WIDTH, Math.round(th.getBoundingClientRect().width));
    colResizeState = null;
    document.body.classList.remove("no-select");

    const p = plan();
    snapshotForUndo();
    if (target.kind === "time") {
      p.timeColWidth = width;
    } else {
      p.columnWidths[target.day] = width;
    }
    persist();
  });

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
    selectEntryColor(entry?.color || "");
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
      selectedEntryColor
    );
    const anchorKey = cellKey(rowStart, day);

    if (update && isNewRange && applyAllDaysCheckbox.checked) {
      p.entries = applyEntryToAllDays(p.entries, p.days, rowStart, rowEnd, update);
      persist();
      renderBody();
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
    renderBody();
    closeModal();
  }

  function deleteEntry() {
    if (!activeSelection) return;
    const { day, rowStart } = activeSelection;
    snapshotForUndo();
    delete plan().entries[cellKey(rowStart, day)];
    persist();
    renderBody();
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
    renderBody();
    closeTimeModal();
  }

  // --- Row / reset actions -------------------------------------------------

  function addRow() {
    snapshotForUndo();
    plan().rowCount += 1;
    persist();
    renderBody();
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
    renderBody();
  }

  function resetAll() {
    if (!confirm(t("confirmResetPlan"))) return;
    snapshotForUndo();
    const p = plan();
    p.rowCount = INITIAL_ROW_COUNT;
    p.times = [];
    p.entries = {};
    persist();
    renderBody();
  }

  // --- Day column management ---------------------------------------------

  // Swaps a plan's still-default weekday column names to the new language,
  // leaving any manually-renamed columns untouched (see
  // translateDefaultDayNames in logic.js). Mutates the plan's days/entries/
  // columnWidths in place, like the other day-column operations here.
  function translatePlanDayNames(p, oldDefaults, newDefaults) {
    const newDays = translateDefaultDayNames(p.days, oldDefaults, newDefaults);
    newDays.forEach((newName, i) => {
      const oldName = p.days[i];
      if (newName === oldName) return;
      p.entries = renameDayEntries(p.entries, oldName, newName);
      p.columnWidths = renameDayWidth(p.columnWidths, oldName, newName);
    });
    p.days = newDays;
  }

  function nextDefaultDayName(days) {
    const base = t("newDayName");
    let i = days.length + 1;
    while (days.includes(`${base} ${i}`)) i += 1;
    return `${base} ${i}`;
  }

  function addDayColumn() {
    const p = plan();
    snapshotForUndo();
    p.days.push(nextDefaultDayName(p.days));
    persist();
    renderHeader();
    renderBody();
    const nameEls = headerRow.querySelectorAll(".day-name");
    const newNameEl = nameEls[nameEls.length - 1];
    focusAndSelect(newNameEl);
  }

  function removeDayColumn(index) {
    const p = plan();
    if (p.days.length <= 1) return;
    const day = p.days[index];

    if (dayHasEntries(day, p.entries)) {
      if (!confirm(t("confirmRemoveDayWithEntries", { day }))) return;
    }

    snapshotForUndo();
    p.days.splice(index, 1);
    p.entries = removeDayEntries(p.entries, day);
    p.columnWidths = removeDayWidth(p.columnWidths, day);
    persist();
    renderHeader();
    renderBody();
  }

  function wireDayRename(nameEl, index) {
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameEl.blur();
      }
    });

    // Below the day-name-short breakpoint, nameEl itself is hidden until
    // this "editing" class is set (style.css) — so tapping the short label
    // above can reveal + focus it, and it hides again once done.
    nameEl.addEventListener("focus", () => {
      nameEl.closest(".day-col-inner")?.classList.add("editing");
    });

    nameEl.addEventListener("blur", () => {
      nameEl.closest(".day-col-inner")?.classList.remove("editing");
      const p = plan();
      const oldName = p.days[index];
      const newName = nameEl.textContent.trim();

      if (!newName || newName === oldName) {
        nameEl.textContent = oldName;
        return;
      }
      if (isDayNameTaken(p.days, newName, index)) {
        alert(t("alertDayNameTaken", { name: newName }));
        nameEl.textContent = oldName;
        return;
      }

      snapshotForUndo();
      p.days[index] = newName;
      p.entries = renameDayEntries(p.entries, oldName, newName);
      p.columnWidths = renameDayWidth(p.columnWidths, oldName, newName);
      persist();
      renderHeader();
      renderBody();
    });
  }

  function focusAndSelect(el) {
    // A day name can be display:none below the day-name-short breakpoint
    // until "editing" is set (style.css) — .focus() on a hidden element is
    // a no-op, so reveal it first. No-op for anything that isn't inside a
    // .day-col-inner (e.g. the plan title).
    el.closest(".day-col-inner")?.classList.add("editing");
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
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
    renderAll();
  }

  // --- Event wiring -------------------------------------------------

  addRowBtn.addEventListener("click", addRow);
  resetBtn.addEventListener("click", resetAll);
  wireColumnResize(timeColResizeHandle, { kind: "time", th: timeColEl });

  printBtn.addEventListener("click", () => window.print());
  editIconsToggle.addEventListener("change", () => {
    setShowEditIcons(store, editIconsToggle.checked);
    persist();
    applyEditIconsVisibility();
  });
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
    applyTheme();
  });

  editLockBtn.addEventListener("click", () => {
    setEditLocked(store, !getEditLocked(store));
    persist();
    applyEditLocked();
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
  });

  planSwitcher.addEventListener("change", () => {
    // Undo is scoped to "the last action on the plan I'm currently looking
    // at" — leaving it (even briefly, then coming back) ends that context,
    // rather than leaving a stale snapshot Ctrl+Z could unexpectedly jump
    // back to later.
    clearUndoSnapshot();
    switchPlan(store, planSwitcher.value);
    persist();
    renderAll();
  });

  newPlanBtn.addEventListener("click", () => {
    clearUndoSnapshot();
    const newPlan = createEmptyPlan(nextDefaultPlanName(), getLanguage(store));
    addPlan(store, newPlan);
    persist();
    renderAll();
    focusPlanTitleForRename();
  });

  deletePlanBtn.addEventListener("click", () => {
    if (store.planOrder.length <= 1) return;
    const p = plan();
    if (!confirm(t("confirmDeletePlan", { name: p.name }))) return;
    clearUndoSnapshot();
    removePlan(store, p.id);
    persist();
    renderAll();
  });

  languageSwitcher.addEventListener("change", () => {
    const oldLanguage = getLanguage(store);
    const newLanguage = languageSwitcher.value;

    if (newLanguage !== oldLanguage) {
      const oldDefaults = DAYS_BY_LANGUAGE[oldLanguage] || DAYS_BY_LANGUAGE[DEFAULT_LANGUAGE];
      const newDefaults = DAYS_BY_LANGUAGE[newLanguage] || DAYS_BY_LANGUAGE[DEFAULT_LANGUAGE];
      Object.values(store.plans).forEach((p) => translatePlanDayNames(p, oldDefaults, newDefaults));
    }

    setLanguage(store, newLanguage);
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
    const name = planTitleEl.textContent.trim() || t("defaultPlanName");
    if (name !== plan().name) snapshotForUndo();
    planTitleEl.textContent = name;
    renamePlan(store, store.activePlanId, name);
    persist();
    renderPlanSwitcher();
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

  buildColorSwatches();
  renderAll();
})();
