import { cellKey, getCellRenderInfo, computeSubRangeInset, parseTimeRangeToMinutes, findAnchorRow } from "./logic.js";
import { getLanguage, getEditLocked, getTheme } from "./store.js";
import { DAYS_BY_LANGUAGE, DAYS_SHORT_BY_LANGUAGE, WEEKDAYS_BY_LANGUAGE } from "./i18n.js";

const ROW_HEIGHT_PX = 70; // keep in sync with `tbody td { height }` in style.css

// Reveals a possibly display:none element (see the day-name-short
// breakpoint in style.css) and focuses + selects its whole text — used both
// for a freshly-added day column and for the plan title.
export function focusAndSelect(el) {
  el.closest(".day-col-inner")?.classList.add("editing");
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Table/modal rendering (DOM creation). Takes the plan data (via `plan()`/
// `store`) plus a handful of callbacks into selection.js and columns.js for
// wiring the interactive elements it creates — it doesn't know about the
// wiring details itself, only which function to attach to which element.
export function createRenderer({
  elements,
  plan,
  store,
  t,
  wireCellSelection,
  copyEntry,
  wireDayRename,
  addDayColumn,
  removeDayColumn,
  wireColumnResize,
  removeRowAt,
  snapshotForUndo,
  persist,
}) {
  const {
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
  } = elements;

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

  // --- i18n -----------------------------------------------------------------

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

  // A "just look at and use the schedule" mode: hides the toolbar, the plan
  // +/- buttons, the about button, and the inline row/column-remove icons —
  // collapsed narrower than 600px, only the title is left — and actually
  // locks editing: no new entries, no renaming the plan title or day columns.
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
      // Mirrors timeColEl.style.width (renderHeader, above) exactly. Below
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

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "entry-copy-btn";
      copyBtn.textContent = "⧉";
      copyBtn.title = t("copyEntryTitle");
      copyBtn.setAttribute("aria-label", t("copyEntryTitle"));
      copyBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyEntry(entry);
      });
      entryBox.appendChild(copyBtn);

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
    applyEditLocked();
    applyTheme();
    renderHeader();
    renderPlanSwitcher();
    renderPlanTitle();
    renderBody();
  }

  // --- "Now" highlight ---------------------------------------------------

  // Shared by the highlight below and "jump to now": which row (by the
  // current time-of-day against the plan's own raster) and day column (by
  // today's weekday name) count as "now" right now.
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

  return {
    renderAll,
    renderHeader,
    renderBody,
    renderPlanSwitcher,
    applyStaticTranslations,
    applyEditLocked,
    applyTheme,
    applyNowHighlight,
    jumpToNow,
    buildColorSwatches,
    selectEntryColor,
    getSelectedEntryColor: () => selectedEntryColor,
  };
}
