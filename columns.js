import {
  dayHasEntries,
  removeDayEntries,
  renameDayEntries,
  isDayNameTaken,
  renameDayWidth,
  removeDayWidth,
  translateDefaultDayNames,
} from "./logic.js";

const MIN_COL_WIDTH = 60;

// Day-column management (add/remove/rename/translate) and manual
// column-width resizing (the time column and day columns share the same
// drag handle mechanics), mirroring the existing separation of logic.js
// functions. Owns no DOM creation of its own — renderHeader (render.js)
// builds the <th>/<span> elements and wires them to the functions returned
// here.
export function createColumnsController({
  headerRow,
  plan,
  t,
  persist,
  snapshotForUndo,
  renderHeader,
  renderBody,
  focusAndSelect,
}) {
  let colResizeState = null; // { target, th, startX, startWidth }

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

  return {
    addDayColumn,
    removeDayColumn,
    wireDayRename,
    wireColumnResize,
    translatePlanDayNames,
  };
}
