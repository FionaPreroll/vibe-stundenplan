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
  getToolbarCollapsed,
  setToolbarCollapsed,
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

  let store = loadStore(window.localStorage, detectDefaultLanguage(navigator.language));

  function t(key, params) {
    return translate(getLanguage(store), key, params);
  }

  const planTitleEl = document.getElementById("planTitle");
  const planSwitcher = document.getElementById("planSwitcher");
  const newPlanBtn = document.getElementById("newPlanBtn");
  const deletePlanBtn = document.getElementById("deletePlanBtn");
  const languageSwitcher = document.getElementById("languageSwitcher");
  const toolbarCollapseBtn = document.getElementById("toolbarCollapseBtn");
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
  const editIconsToggle = document.getElementById("editIconsToggle");
  const exportBtn = document.getElementById("exportBtn");
  const exportAllBtn = document.getElementById("exportAllBtn");
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFileInput");

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
  let dragState = null; // { day, anchorRow, currentRow }

  function plan() {
    return getActivePlan(store);
  }

  function persist() {
    saveStore(store, window.localStorage);
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

  // A "just look at and use the schedule" display mode: hides the toolbar,
  // the plan +/- buttons, the about button, and (like hide-edit-icons) the
  // inline row/column-remove icons — collapsed narrower than 600px, only
  // the title is left. Doesn't touch the underlying showEditIcons
  // preference, so expanding again restores whatever that toggle had.
  function applyToolbarCollapsed() {
    const collapsed = getToolbarCollapsed(store);
    document.body.classList.toggle("toolbar-collapsed", collapsed);
    toolbarCollapseBtn.textContent = collapsed ? "⌄" : "⌃";
    const titleKey = collapsed ? "expandToolbarTitle" : "collapseToolbarTitle";
    toolbarCollapseBtn.title = t(titleKey);
    toolbarCollapseBtn.setAttribute("aria-label", t(titleKey));
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
      nameEl.contentEditable = "true";
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
      shortEl.addEventListener("click", () => focusAndSelect(nameEl));
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
      timeLabel.addEventListener("input", () => {
        p.times[row] = timeLabel.textContent;
        persist();
      });
      timeTd.appendChild(timeLabel);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "row-remove-btn";
      removeBtn.title = t("removeRowTitle");
      removeBtn.setAttribute("aria-label", t("removeRowTitle"));
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => removeRowAt(row));
      timeTd.appendChild(removeBtn);

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
    applyToolbarCollapsed();
    applyTheme();
    renderHeader();
    renderPlanSwitcher();
    renderPlanTitle();
    renderBody();
  }

  // --- "Now" highlight ---------------------------------------------------

  function applyNowHighlight() {
    headerRow.querySelectorAll(".current-day-col").forEach((el) => el.classList.remove("current-day-col"));
    planBody.querySelectorAll(".current-row").forEach((el) => el.classList.remove("current-row"));
    planBody.querySelectorAll(".current-cell").forEach((el) => el.classList.remove("current-cell"));

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
    if (currentRow === -1) return;

    const timeRow = planBody.children[currentRow];
    timeRow?.querySelector(".time-cell")?.classList.add("current-row");

    const dayIndex = p.days.indexOf(todayName);
    if (dayIndex === -1) return;

    const headerCells = headerRow.querySelectorAll("th.day-col");
    headerCells[dayIndex]?.classList.add("current-day-col");

    const anchorRow = findAnchorRow(currentRow, todayName, p.entries);
    if (anchorRow === null) return;
    const anchorKey = cellKey(anchorRow, todayName);
    planBody.querySelectorAll(".data-cell").forEach((td) => {
      if (td.dataset.key === anchorKey) td.classList.add("current-cell");
    });
  }

  setInterval(applyNowHighlight, NOW_HIGHLIGHT_INTERVAL_MS);

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
        const touch = e.touches[0];
        touchPressStart = { x: touch.clientX, y: touch.clientY };
        touchDragActive = false;
        clearTimeout(touchPressTimer);
        touchPressTimer = setTimeout(() => {
          touchDragActive = true;
          dragState = { day, anchorRow: row, currentRow: row };
          document.body.classList.add("no-select");
          highlightSelection(day, row, row);
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
        if (!cell || cell.dataset.day !== dragState.day) return;
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
    const { day, anchorRow, currentRow } = dragState;
    dragState = null;
    document.body.classList.remove("no-select");
    clearHighlight();
    finalizeSelection(day, anchorRow, currentRow);
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
    const update = computeEntryUpdate(
      fieldTitle.value,
      fieldDescription.value,
      fieldLink.value,
      fieldStartTime.value,
      fieldEndTime.value
    );
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

  function removeRowAt(rowIndex) {
    const p = plan();
    if (p.rowCount <= 0) return;

    if (rowHasEntries(rowIndex, p.days, p.entries)) {
      if (!confirm(t("confirmRemoveRowWithEntries"))) return;
    }

    const result = removeRow(rowIndex, p.rowCount, p.times, p.entries);
    p.rowCount = result.rowCount;
    p.times = result.times;
    p.entries = result.entries;
    persist();
    renderBody();
  }

  function resetAll() {
    if (!confirm(t("confirmResetPlan"))) return;
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

  toolbarCollapseBtn.addEventListener("click", () => {
    setToolbarCollapsed(store, !getToolbarCollapsed(store));
    persist();
    applyToolbarCollapsed();
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

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modalOverlay.classList.contains("hidden")) closeModal();
    if (!timeModalOverlay.classList.contains("hidden")) closeTimeModal();
    if (!aboutModalOverlay.classList.contains("hidden")) closeAboutModal();
  });

  planSwitcher.addEventListener("change", () => {
    switchPlan(store, planSwitcher.value);
    persist();
    renderAll();
  });

  newPlanBtn.addEventListener("click", () => {
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

  renderAll();
})();
