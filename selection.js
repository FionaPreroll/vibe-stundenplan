import {
  cellKey,
  computeSelectionRange,
  findOverlappingKeys,
  getEntrySpan,
  moveEntry,
} from "./logic.js";
import { getEditLocked } from "./store.js";

const LONG_PRESS_MS = 350;
const TOUCH_MOVE_CANCEL_PX = 10;

// Drag-to-select (defining a new entry's range) and drag-to-move (relocating
// an existing entry) share one state machine here, for mouse and touch
// alike, plus the copy/paste flow that hangs off the same "grab something,
// drop it on a cell" gesture (the per-entry copy icon, or Ctrl+C/Ctrl+V —
// see copyHoveredEntry/armPaste, called from app.js's global keydown
// listener).
export function createSelectionController({
  planBody,
  plan,
  store,
  t,
  persist,
  snapshotForUndo,
  showToast,
  renderBody,
  openEntryModal,
}) {
  // mode: "select" (dragging from an empty cell to define a new entry's
  // range) or "move" (dragging an existing entry to relocate it) — see
  // wireCellSelection. currentDay only changes for "move" (a selection drag
  // stays within the day column it started in; a move can cross columns).
  let dragState = null; // { mode, day, anchorRow, currentDay, currentRow, span }

  // Entry duplication (copy icon or Ctrl+C, then a click to place).
  // hoveredCell tracks which cell the mouse is currently over, purely so
  // Ctrl+C has something to act on (there's no other notion of "focus" on a
  // cell in this app).
  let clipboardEntry = null;
  let hoveredCell = null; // { day, row } | null
  let pasteArmed = false;

  let touchPressTimer = null;
  let touchPressStart = null; // { x, y }
  let touchDragActive = false;

  function wireCellSelection(td, row, day) {
    td.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (getEditLocked(store)) return;
      e.preventDefault();

      if (pasteArmed) {
        pasteArmed = false;
        document.body.classList.remove("paste-armed");
        pasteEntryAt(day, row);
        return;
      }

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
      hoveredCell = { day, row };
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

    td.addEventListener("mouseleave", () => {
      if (hoveredCell && hoveredCell.day === day && hoveredCell.row === row) hoveredCell = null;
    });

    wireCellSelectionTouch(td, row, day);
  }

  function copyEntry(entry) {
    clipboardEntry = structuredClone(entry);
    showToast(t("copyToast"));
  }

  // Places a copy of clipboardEntry anchored at (row, day) — same
  // overwrite rule as a normal save (any different entry the range now
  // overlaps is replaced), and the same row-clamping a drag-move already
  // does so a multi-row entry pasted near the bottom still fits entirely
  // within the grid instead of hanging off the edge.
  function pasteEntryAt(day, row) {
    if (!clipboardEntry) return;
    const p = plan();
    const span = getEntrySpan(clipboardEntry);
    const clampedRow = Math.max(0, Math.min(row, p.rowCount - span));
    const rowEnd = clampedRow + span - 1;
    snapshotForUndo();
    findOverlappingKeys(p.entries, day, clampedRow, rowEnd).forEach((k) => delete p.entries[k]);
    const { span: _span, ...rest } = clipboardEntry;
    p.entries[cellKey(clampedRow, day)] = span > 1 ? { ...rest, span } : rest;
    persist();
    renderBody();
    showToast(t("pasteToast"));
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
    // it just does it (same overwrite rule as any other save).
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

  // Ctrl+C over a filled cell copies that entry. Returns whether it
  // actually copied something, so the caller (app.js's global keydown
  // listener) only preventDefault()s the native shortcut when there was
  // something to copy.
  function copyHoveredEntry() {
    if (!hoveredCell) return false;
    const entry = plan().entries[cellKey(hoveredCell.row, hoveredCell.day)];
    if (!entry) return false;
    copyEntry(entry);
    return true;
  }

  // Ctrl+V arms "paste mode" (a cursor change + body class) rather than
  // pasting immediately — the next click on any cell places it there (see
  // wireCellSelection's mousedown), mirroring drag-to-move's own "grab,
  // then drop" gesture instead of needing the mouse to already be over the
  // target cell at the moment of the shortcut. Returns whether it actually
  // armed (there's a clipboard entry to place).
  function armPaste() {
    if (!clipboardEntry) return false;
    pasteArmed = true;
    document.body.classList.add("paste-armed");
    return true;
  }

  function disarmPaste() {
    if (!pasteArmed) return;
    pasteArmed = false;
    document.body.classList.remove("paste-armed");
  }

  return {
    wireCellSelection,
    copyEntry,
    copyHoveredEntry,
    armPaste,
    disarmPaste,
  };
}
