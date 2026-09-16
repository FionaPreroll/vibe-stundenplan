# Requirements: Vibe-Stundenplan

This document summarizes what the app is currently meant to do — as a reference for a future
rewrite, independent of the concrete implementation. It describes the state after the feature
batch "removable/addable day columns, now-highlight, real internationalization (DE/EN), README
with automated screenshots".

For module responsibilities, test philosophy, and conventions (i18n, when a framework would be
worth it, etc.) see [CONTRIBUTING.md](CONTRIBUTING.md) — this document describes the *what*,
CONTRIBUTING.md the *how*.

## Purpose

A single-page app for everyday personal planning: a schedule-like weekly grid you fill in with
entries/tasks. Not a calendar replacement, not a team tool — a single-user tool that runs
locally in the browser, for German- and English-speaking users.

## Technical constraints (deliberate decisions)

- **No build step for the app.** Plain HTML/CSS/JS (ES modules), directly servable as static
  files (locally via `python3 -m http.server` or similar, or GitHub Pages). No bundler, no
  framework, no CSS framework.
- **No runtime dependencies for the app.** The shipped app needs no npm packages. The only
  exception in the whole repo is Playwright as a pure devDependency for the screenshot tooling
  (see item 13) — never in app code, never needed for `npm test`.
- **No backend, no accounts.** All data lives exclusively in the browser's `localStorage`. No
  sync between devices/browsers except manual export/import (see item 8).
- **Tests without a test framework.** Node's built-in test runner (`node --test` / `npm test`).
- **Deployment:** GitHub Actions → GitHub Pages, automatically on every push to `main`.
  Requires a public repo (Pages on private repos needs a paid GitHub plan) and a one-time
  manually set Pages source ("GitHub Actions") in the repo settings — the workflow token can't
  enable that itself.

## Architecture / modules

| File | Responsibility |
|---|---|
| `index.html` | Markup, two modal `<form>`s (entry modal, time-grid modal), `data-i18n*` attributes for static text |
| `style.css` | Styling, rainbow colors (position-based, not tied to fixed weekdays), responsive layout |
| `logic.js` | **Pure** schedule logic — no DOM, no I/O, no language, fully unit-testable |
| `io.js` | Export/import serialization of a plan (JSON), takes language as a parameter |
| `store.js` | Persistence of multiple plans + language choice; wraps `localStorage`, storage is injectable (testability) |
| `i18n.js` | String dictionary (DE/EN) + pure helpers (`translate`, `detectDefaultLanguage`) |
| `app.js` | DOM controller; the only module that touches `document`/`window`/`alert`/`confirm` |

Test files (`logic.test.js`, `io.test.js`, `store.test.js`, `i18n.test.js`) mirror the four
logic modules 1:1. `app.js` deliberately has no automated tests (rationale in
CONTRIBUTING.md); its correctness is checked during development via Playwright end-to-end
runs.

## Functional requirements

### 1. Base grid (table)

- Header row: day columns, each in a rainbow color (assigned cyclically by column position,
  not tied to specific weekdays — see item 1a).
- Left "Time" column: a freely editable text field per row, no enforced format (certain
  features — grid presets, sub-raster display, the now-highlight — only work correctly if the
  text matches the `HH:MM–HH:MM` pattern; anything else is treated as opaque text and degrades
  gracefully).
- Start: 10 empty rows, 7 day columns (default names depend on the current language, see item
  14).
- Rows can be added ("+ Add row") and removed again (a × button per row).
  - If the row to be removed contains entries (its own, or ones a multi-row entry occupies),
    a confirmation is required before removing it.
  - Removing shifts all later entries up by one row and shortens/deletes multi-row entries
    that reached across the removed row.

### 1a. Day columns: add, rename, remove

- Every column header is directly inline-editable (`contenteditable`, same as the plan title,
  item 6) — clicking renames the column.
- A "+" at the right end of the header row adds a new column (auto-named "Tag N" / "Day N"
  depending on language, to avoid collisions) and immediately focuses/selects the name for
  renaming.
- A × button per column header removes that column. If it contains entries, a confirmation is
  required first. The last remaining column can't be removed (button disabled).
- **Important:** entries are internally referenced by column *name* (not position). Renaming
  a column automatically moves all its entries to the new name; attempts to rename to an
  already-taken name are rejected (a message is shown, the old name is kept).
- A language switch (item 14) renames a column only when it still matches its old language's
  default weekday name exactly at that position — a manually renamed column is never touched.
  See item 12 for the full rule and its collision handling.

### 2. Time-grid helper ("Set time grid")

A modal with two ways to fill in the time column:

a. **Fixed presets**: TU Dresden (double periods), RWTH Aachen (block schedule) — 8 fixed
   time labels each.
b. **Custom grid**: interval in **minutes** (allows sub-hour ticks like 10 or 15 minutes) +
   start/end time via native `<input type="time">` fields, so the grid can start at any
   minute (e.g. 7:50).

Applying a preset/grid:
- Increases the row count if needed (never shrinks it).
- Only overwrites the first N time labels; if they already hold different values, a
  confirmation is required first.
- Never touches entries.

### 3. Entries

- Clicking a cell (or dragging, see item 4) opens a modal to add/edit.
- Fields: title (required), description (optional), link (optional, URL), start/end
  (optional, `HH:MM`, independent of the row's time label — see item 5).
- Saving with an empty title deletes the entry (equivalent to "Delete").
- An explicit "Delete" button removes the entry.

### 4. Multi-row entries (drag-select)

- Clicking and dragging vertically within **one** day column selects a contiguous row range;
  releasing opens the entry modal for exactly that range.
- The resulting entry is stored once, at its first (anchor) row, with a `span` (row count),
  and rendered as one merged cell (`rowspan`).
- Dragging a new selection that fully or partially overlaps an existing entry replaces that
  existing entry on save.
- A plain click (no drag) on an already-filled cell opens the existing entry for editing,
  with its span unchanged.
- **Invariant:** entries never overlap for the same day. That's the entirety of "collision
  handling" — enforced on write (overlapping existing entries are removed before saving a new
  range), no separate runtime check needed.

### 5. Sub-raster times (independent of the row grid)

- An entry can optionally carry its own `startTime`/`endTime` (`HH:MM`), independent of the
  time label of the row(s) it occupies.
- **Purpose:** an entry should be able to start/end in the middle of a row (e.g. a 15-minute
  call at 08:10–08:25 inside an 08:00–09:00 row), without the whole grid needing to be that
  finely resolved.
- **Display:** a small time badge above the title; the entry's visible box (an `.entry-box`
  div, positioned absolutely within the `<td>` rather than coloring/outlining the `<td>`
  itself) is additionally shifted within its cell — pixel-based via `top`/`bottom`,
  proportional to where the time sits within the total time span of the occupied row(s)
  (deliberately pixels instead of CSS percent, see above). Important: it's the **box itself**
  that shifts (its top/bottom edge), not just its content via padding — otherwise it looks
  like only the text slides down while the cell visually already starts earlier, which looks
  odd for a multi-row entry with a late start. This is a **visual approximation**, not a
  pixel-perfect calendar — and falls back to "no shift" when the row time labels aren't
  parseable as `HH:MM–HH:MM` (e.g. the empty rows a fresh plan starts with).
- **UX safeguard:** if a start/end time is set in the entry modal but the affected row(s)
  don't have a parseable time label, a hint text appears explaining that — instead of the
  inset just silently not happening and looking like a bug.
- **Deliberately out of scope:** genuinely free (grid-independent) positioning with its own
  collision logic, like a real calendar UI. The row grid remains the source of truth for what
  may occupy a time slot; sub-raster times are a pure display layer on top. This decision was
  made deliberately, to keep the data model and collision handling simple.

### 6. Editable title

- The heading (`<h1>`, plan name) is directly inline-editable (`contenteditable`). Enter
  confirms (blurs) without inserting a line break; blur commits the trimmed, non-empty name
  (empty → falls back to the language-dependent default name, item 14).
- Renaming updates: the display, `document.title` (`"{name} · {Stundenplan|Schedule}"`), and
  the entry in the plan switcher.

### 7. Multiple schedules

- A plan = `{ id, name, days[], rowCount, times[], entries{} }`.
- A dropdown lists all plans by name; selecting one switches the active plan and re-renders
  everything.
- "+" creates a new empty plan (auto-named, language-dependent, with collision avoidance) and
  immediately focuses/selects the title for renaming.
- 🗑 deletes the current plan after confirmation; the last remaining plan can't be deleted
  (button disabled).
- All plans live together under one `localStorage` key; switching plans is instant/local, no
  reload needed.

### 8. Export / Import

- "Export" downloads the active plan as indented, human-readable/editable JSON, with a
  filename derived from the (slugified) plan name. "Export all" downloads every stored plan
  (in store order) as one file instead.
- JSON shapes: `{ app: "vibe-stundenplan", version: 1, plan: { name, days, rowCount, times, entries } }`
  (single plan) or `{ app: "vibe-stundenplan", version: 1, plans: [ {...}, ... ] }` (all
  plans). Full field-by-field specification including fallback rules and a JSON Schema draft:
  see [EXPORT_FORMAT.md](EXPORT_FORMAT.md).
- There is only **one** "Import" button/file picker for both shapes — it inspects the parsed
  JSON itself (a top-level `plans` array vs. anything else) to decide whether to import one
  plan or every plan in the file, rather than needing a separate "import all" control.
  Whichever shape it reads, it only ever creates **new** plans (never overwrites an existing
  one), switching afterwards to the single imported plan, or to the last of the imported ones
  when importing a whole file.
- Import is defensive: missing/broken fields fall back to sensible, language-dependent
  defaults (missing name → "Importierter Plan"/"Imported Schedule", invalid `rowCount` → 10,
  `times` not an array → `[]`, `entries` not an object → `{}`, `days` missing/empty/contains
  blank strings → the current UI language's default weekdays) instead of crashing — applied
  independently per plan for an all-plans file, so one malformed entry in `plans` doesn't
  block the rest.
- `entries` are passed through raw (no field allowlist in `io.js`) — `span`, `startTime`,
  `endTime`, etc. are automatically exported/imported without `io.js` needing to know every
  entry field individually.
- The exported plan(s) carry the day names exactly as they were named at export time (whatever
  language/however renamed) — import takes them over unchanged.

### 9. Persistence & migration

- All data lives in `localStorage`, key `stundenplan-store-v1`, no backend/account.
- On first load with no existing store, the older single-plan format (key
  `stundenplan-data-v1`, from before multi-plan support) is automatically migrated into a
  single plan, so an app update never loses existing data.
- A broken/unreadable legacy value is ignored (falls back to a fresh empty plan) instead of
  crashing the app.
- Plans saved before day columns became customizable (no `days` field) are automatically
  backfilled with the default weekdays on load.

### 10. Keyboard operation

- Both modals (entry, time grid) are real `<form>` elements.
- Enter in a single-line field (title, link, start/end time, grid inputs) submits the form
  (saves / applies the grid).
- Enter in the multi-line "Description" field inserts a line break as usual (no submit) —
  normal HTML form behavior, no special handling needed.
- Escape closes whichever modal is open, discarding unsaved changes.
- Tab order follows the fields' natural DOM order.

### 11. Now-highlight

- The row whose time label encloses the current time (assuming `HH:MM–HH:MM` format) is
  visually highlighted in the time column.
- The column whose name matches today's weekday (compared against the current UI language's
  default weekday names — so this only works as long as that column hasn't been
  renamed/removed) is highlighted in the column header.
- If there's an entry at the intersection of the current row and today's column (including a
  multi-row one whose anchor is further up), that exact cell is additionally highlighted.
- Refreshes automatically every 30 seconds, as well as after every re-render of the table
  (e.g. after saving an entry).

### 12. Internationalization (German/English)

- Full UI translation into English, switchable via a language selector in the header (shows
  "Deutsch"/"English" — language names deliberately stay in their own language, regardless of
  the currently selected UI language).
- **Automatic detection on first load:** the default language is derived from
  `navigator.language` — only an explicitly German value (`de`, `de-DE`, `de-AT`, …) selects
  German, everything else (including no value) selects English. Rationale: German-speaking
  users frequently run an English-language browser/OS UI, so it's safer to default
  conservatively to English than to assume every German-text reader has a German system
  language.
- The selected language is stored per browser (not per plan) in `localStorage` and persists
  across reloads; each plan can still have its own title in any language/wording.
- What gets translated: all button/label/placeholder text, modal titles, confirm/alert
  dialogs, error messages, and the *default values* for new plans/columns (plan names, day
  names). **Not** automatically translated: content the user entered themselves (entry
  titles, descriptions, renamed column/plan names) — those are free-form text input, not UI
  strings.
- **Existing day columns on a language switch:** a column name that still matches exactly the
  *previous* language's default weekday name at its position (i.e. the user never renamed it)
  gets updated to the *new* language's default name at the same position when switching — e.g.
  "Montag" automatically becomes "Monday" when switching to English. A manually renamed
  column (e.g. "Study day" instead of "Monday") no longer counts as a "default" and stays
  unchanged, since at that point it's free text, not a UI string. This applies across all
  stored plans (not just the active one), and to columns beyond the first 7 (e.g. an added
  8th column), which never match a weekday default anyway and so stay untouched. Entries and
  manually set column widths (item 18) on a translated column get moved along with it
  (`translateDefaultDayNames` in `logic.js`, internally reuses the same remap logic as a
  manual rename). A translation that would create a name collision with another column is
  skipped (the column keeps its old name), to preserve the column-name uniqueness invariant.
- Architecture: a central dictionary (`i18n.js`, `{ de: {...}, en: {...} }`) plus a
  `translate(language, key, params)` helper with `{param}` interpolation. No i18n framework,
  no extra runtime dependency. Convention details (how to add new strings) are in
  CONTRIBUTING.md.
- Native form controls like `<input type="time">` still follow the respective
  browser's/OS's locale setting (e.g. 12h AM/PM vs. 24h display) — that's browser/OS
  behavior, not controllable from the page, and deliberately not reimplemented (no custom
  time picker, to avoid unnecessary complexity).

### 13. CI / Tests

- Unit tests via Node's built-in test runner (`node --test`, invoked as `npm test`), no
  external test dependency for the app itself.
- One test file per logic module (`logic.test.js`, `io.test.js`, `store.test.js`,
  `i18n.test.js`).
- `store.test.js` uses a small in-memory fake for `localStorage` (dependency-injected via
  `loadStore(storage, defaultLanguage)` / `saveStore(store, storage)`), so it needs no
  browser/DOM.
- The `ci.yml` GitHub Actions workflow runs on every push to `main` and on every pull
  request.

### 14. Deployment & screenshots

- The `deploy-pages.yml` GitHub Actions workflow deploys the static site (repo root
  unchanged, no build) to GitHub Pages on every push to `main`.
- Live URL: https://fionapreroll.github.io/vibe-stundenplan/
- The `screenshots.yml` GitHub Actions workflow generates fresh README screenshots on every
  push to `main` (`paths-ignore: screenshots/**`, to avoid infinite loops) automatically
  (`scripts/screenshots.js`, drives the app via Playwright with example content and
  photographs the main view + both modals) and commits them back with `[skip ci]` if they
  changed.
- That's the only place in the project with a real npm runtime dependency (Playwright,
  devDependency) — affects only this tooling, never the app code itself (see "Technical
  constraints" above).

### 15. Print view

- The "🖨 Print" button calls `window.print()`; a `@media print` stylesheet reduces the view
  to the plan title + table.
- Hidden: the plan switcher, language selector, all action buttons, edit icons (remove
  row/column, add column, the empty-cell "+"), modals. The title loses its
  editable-looking outline (no `contenteditable` styling in print, even though the attribute
  technically stays active).
- The header row's and filled cells' rainbow colors are forced via `print-color-adjust:
  exact`, since they're a content feature (weekday color-coding), not mere decoration that a
  frugal browser print would otherwise drop.
- The time column renders wider in print than on screen (kept narrow on screen to save space
  at tablet widths), so full time labels aren't clipped; placeholder text ("e.g. …") in
  not-yet-filled time fields becomes invisible in print (`::placeholder { color: transparent
  }`), so empty rows don't look like form fields.
- `@page { size: landscape }` as a hint to the browser — weekly tables are wider than they are
  tall, even though not every browser/OS picks that up automatically (in which case the user
  picks landscape manually in the print dialog).
- The now-highlight (item 11 — current row, current day column, current cell) is also reset
  to its unhighlighted look in print: it's live UI state tied to the exact moment of printing,
  not part of the plan's actual content, so a printout shouldn't freeze in whatever minute it
  happened to be made.
- Deliberately **not** implemented: automatically hiding fully empty rows in print (to save
  paper) — the print view shows exactly what's visible on screen, minus controls, with no
  extra content filtering.

### 16. Toggleable edit icons

- A checkbox in the header ("Show edit icons") hides the row/column-remove ×, the
  add-column "+", and the "+" in empty cells.
- A pure display setting: the underlying interaction (clicking a cell, drag-select, renaming
  by click) stays fully functional even with the icons hidden — not an "edit lock", just a
  visual cleanup (e.g. for a calmer view/presentation).
- Persisted per browser (like the language), not per plan — `store.showEditIcons`
  (`getShowEditIcons`/`setShowEditIcons` in `store.js`), default `true`.
- Independently of that, the print view (item 15) *always* hides these same icons regardless
  of the current toggle state — print should never show interactive UI.

### 17. Responsive layout & mobile

- The table uses `table-layout: fixed` instead of `auto`: under automatic layout, form
  controls (the time `<input>`) determine their natural/intrinsic width and largely ignore
  small `min-width` hints — that drove the time column to over 220px wide, even though only
  ~90px was intended. With `table-layout: fixed`, the time column's declared width directly
  determines the column width; day columns without their own `width` share the remaining
  space automatically and evenly — for any column count, not just the original 7.
- Result: the initial 7-day view no longer needs horizontal scrolling at tablet width (≥
  768px) and above (previously: a hard `min-width: 920px` on the table forced scrolling
  starting at just under 950px window width). This also covers every common smartphone
  landscape width (tested 667–926px) — covering a practically relevant part of the "mobile
  landscape" case.
- A `min-width: 600px` on the table remains as a floor: below that (e.g. smartphone portrait,
  ~375–430px), `.table-wrap` scrolls horizontally instead of squeezing columns further — 7+
  columns can't be displayed losslessly without scrolling at portrait phone width ("where
  possible" here means possible from tablet width up, not at every screen size).
- Day column names are allowed to wrap (`white-space: normal; overflow-wrap: anywhere`)
  instead of being forced onto one line — important because column names are now freely
  renamable (item 1a) and can be arbitrarily long.
- Modals have `max-height: 90vh` with `overflow-y: auto`: on short viewports (e.g. a
  smartphone in landscape, ~375–400px tall), an unbounded modal would extend past the visible
  area and make buttons (Save, Cancel) unreachable. With the cap, the modal becomes internally
  scrollable instead; all fields and buttons stay reachable.
- Deliberately **not** implemented: a responsive adjustment of the fixed 70px row height (see
  item 5 — `ROW_HEIGHT_PX` in `app.js`). A smaller mobile row height would collide with the
  pixel calculation for the sub-raster inset unless `ROW_HEIGHT_PX` were also read dynamically
  from the actually rendered value — a deliberately simple trade-off left unaddressed for now.

### 18. Manually resizable column widths

- **Trigger:** `table-layout: fixed` (item 17) does produce a layout without scrolling, but
  the fixed ~92px time column isn't enough for every grid — long time labels like
  "16:40–18:10" were getting hard-clipped in the time `<input>` (inputs never wrap their
  text, regardless of CSS).
- **Solution:** every column (time and day columns) gets a narrow drag handle on the right
  edge of its `<th>` (`.col-resize-handle`, `position: absolute` at the column edge).
  Dragging sets an explicit `width` on the `<th>` via a mouse drag — under `table-layout:
  fixed`, that determines the width of the whole column (header and data cells). A minimum
  width (`MIN_COL_WIDTH = 60px` in `app.js`) prevents a column from collapsing to 0. Day
  columns that haven't been manually resized keep sharing the remaining space automatically
  and evenly (unchanged behavior from item 17).
- **Persistence:** the time column's width lives as `plan.timeColWidth` (a number, or `null`
  for the default), day column widths as `plan.columnWidths[dayName]` (an object, only for
  explicitly resized columns). Renaming a day column moves its width entry along
  (`renameDayWidth` in `logic.js`, mirroring `renameDayEntries`); removing one deletes it
  (`removeDayWidth`) — otherwise orphaned entries would be left behind under the old name.
- **Visibility:** the drag handles are edit UI like the remove/add icons and follow their
  visibility toggle (item 16) as well as the print view (item 15) — in print, the time
  column is forced to a fixed, guaranteed-sufficient width anyway (`!important`,
  deliberately overriding a manual on-screen width).
- **"Wrap as a last resort" fallback:** the time label itself was switched from an
  `<input type="text">` to a `contenteditable` span (like the day names, item 1a) — inputs
  fundamentally can't wrap, a `<span>` can. That gives a second safeguard independent of
  manual resizing: if a column is still too narrow, the label wraps normally (preferring a
  break at the en dash "–" between the times, since Unicode line-breaking rules already treat
  that as a break opportunity; `overflow-wrap: anywhere` as an additional safety net in case
  even that isn't enough) instead of being clipped.

### 19. Grouped header toolbar

- **Trigger:** the header's action row had grown linearly with every feature added this
  session (most recently print, the edit-icons toggle) — six buttons plus a toggle sat at
  equal visual weight in one row, with nothing showing what belonged together or what was
  dangerous (see the UI review that preceded this change).
- **Grouping instead of a flat row:** the buttons are split into three labeled groups
  (`.action-group` with `.action-group-label`): "Data" (Export, Import), "Grid" (Set time
  grid, + Add row), "View" (Print, Show edit icons). The group labels are translated UI
  strings (`toolbarGroupData`/`toolbarGroupGrid`/`toolbarGroupView`), not entry/user data. The
  divider between groups sits as a `border-right` on the group itself rather than as a
  standalone divider element — otherwise a line wrap (narrow screen) could strand a single
  divider line with no group attached to it.
- **"Reset" is deliberately no longer a `.btn-secondary`.** As the toolbar's one destructive,
  unrecoverable action (guarded only by a `confirm()` dialog), it gets its own, group-less
  position on the far right (`margin-left: auto`) and a new outline style class
  (`.btn-danger-outline`, the danger color as a border/text instead of a solid red fill) —
  distinct enough not to be mistaken for a normal secondary button, but more restrained than
  an alarming red block.
- **"+ Add row" is no longer the toolbar's sole primary button** (previously the only `.btn`
  instance with the accent color, now `.btn-secondary` like the other grid/data actions):
  none of these toolbar actions is actually used very often in everyday use — the usual way
  to add an entry is clicking a cell, not a toolbar button. Visually highlighting this one
  particular action was arbitrary.
- **Deliberately not implemented:** an overflow/"more" menu for the actions. With six actions
  in three groups, that isn't worth it (yet) — it would only cost discoverability. Becomes
  relevant once meaningfully more, less-frequently-used actions are added. Also deliberately
  not implemented: a real icon toolbar (replacing buttons with icons+tooltips) — that needs a
  consistent, dedicated icon set instead of the existing emoji icons (`+`/`🗑`/`🖨`) and is
  its own, later decision, not a byproduct of this rework.

### 20. Dark mode

- **Three states** like the language/edit-icons toggle, not a plain yes/no switch:
  `<select id="themeSwitcher">` with "System" (follows `prefers-color-scheme`), "Light",
  "Dark". Persisted per browser in `store.theme` (`getTheme`/`setTheme` in `store.js`,
  mirroring `getLanguage`), not per plan — like language and edit-icons visibility, this is a
  display setting, not an entry/plan property.
- **Implemented via CSS custom properties, not two complete stylesheets:** all primitive
  tokens (`--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`, `--danger`,
  `--warn`, `--shadow`) are redefined for dark — once under
  `@media (prefers-color-scheme: dark)` (only when `data-theme="light"` isn't explicitly
  set), and once under `:root[data-theme="dark"]` (forces dark regardless of the OS). `app.js`
  only sets/removes the `data-theme` attribute on `<html>` (`applyTheme()`), no class
  toggling or similar.
- **Derived shades instead of duplicated light/dark values:** colors that are really just a
  tint of a primitive token (e.g. the light background of filled cells, the secondary-button
  surface, the time-column background) are defined once, in the base `:root`, as
  `color-mix(in srgb, var(--something) X%, var(--surface))` — they automatically recompute on
  every theme change from the (then-overridden) primitive tokens, without needing to be
  repeated in the dark block. Only genuinely standalone, non-derivable colors (e.g. `--warn`,
  the amber hint-text color) have a real, hand-picked second value in the dark block.
- **The day columns' rainbow colors (`--day-1..7`) and their header text color (`#1c1c26`)
  deliberately don't change with the theme** — the color-coding is content (item 5), not
  decoration, and the header text always sits on a light pastel surface, regardless of the
  page theme.
- **Printed output always stays light**, regardless of the active on-screen theme:
  `@media print` resets all primitive tokens back to their light values with `!important`
  (necessary because a plain `:root` rule there would otherwise be outranked by
  `:root[data-theme="dark"]`'s higher selector specificity — a `@media` rule alone doesn't add
  specificity). That way every `color-mix()`-derived token also gets its light value back when
  printing, not just `body { background }`.
- **No flash on load:** since `app.js` runs as `type="module"` only after HTML parsing, a
  saved dark choice would otherwise briefly flash light before `app.js` applies it. A small,
  synchronous inline `<script>` in `index.html`'s `<head>` reads the store directly from
  `localStorage` and sets `data-theme` before the first render — deliberately duplicating
  only the storage key (see the comment there, must stay in sync with `STORE_KEY` in
  `store.js`) instead of importing the whole module.

### 21. About modal with a source-code link

- An "ⓘ" icon button (`#aboutBtn`, at the far right of the header, next to the two selects)
  opens a modal following the same pattern as the entry/time-grid modals (`.modal-overlay`/
  `.modal`, Escape closes it, clicking the backdrop closes it).
- Content: a short description of the app (including a note that all data stays exclusively
  local in the browser — no server transfer, see item 9) plus a "View on GitHub" link to the
  source repository. Deliberately no version/build-info text — there's no build step and no
  version number that could meaningfully be shown there (see "Deliberate non-goals").
- Belongs to none of the three toolbar groups from item 19 (not Data, not Grid, not View) —
  so deliberately not part of `.app-actions`, but its own button in `header-top` next to the
  global selects.

### 22. Collapsible header toolbar

- **Trigger:** a "just look at and use the schedule" mode — collapse away everything that's
  about editing/managing plans, keeping only what's needed to read the current one and switch
  to another.
- A chevron button (`#toolbarCollapseBtn`, right next to the title — the one element that's
  never hidden by this) toggles `body.toolbar-collapsed`. Persisted per browser in
  `store.toolbarCollapsed` (`getToolbarCollapsed`/`setToolbarCollapsed` in `store.js`, same
  pattern as `showEditIcons`), not per plan, default off (collapsed is opt-in, not the
  default for new/existing users).
- **Collapsed hides:** the whole grouped toolbar from item 19 (Data/Grid/Print/Reset), the
  hint text, the plan +/🗑 buttons, and the About button (item 21) — leaving the plan title,
  the plan switcher dropdown, and the theme/language selects from items 20/12. It also hides
  the same inline table edit icons that `showEditIcons` (item 16) does (row/column-remove,
  add-column, the resize handles, the empty-cell "+") — reusing that rule's selector list
  rather than duplicating it, and without touching `showEditIcons`'s own saved value, so
  expanding the toolbar again shows those icons exactly as that toggle had them.
- **Collapsed + narrow (≤ 600px):** the plan switcher and the theme/language selects also
  hide, leaving only the title and the chevron to expand again — there just isn't room for a
  row of selects next to the title at phone width once the rest of the chrome is already
  gone.
- Like `showEditIcons` and dark mode, this is a display preference, not an edit lock: every
  interaction (click-to-add, drag-select, inline rename of the title/columns, switching
  plans) keeps working exactly the same while collapsed, including on the plan-switcher
  dropdown that stays visible on wider screens.
- Always hidden in print (item 15) regardless of collapsed state, like every other
  interactive header control.

### 23. Short day names on narrow screens

- Below the same width where the table already needs to scroll (its own `min-width: 600px`
  floor, item 17), day columns are squeezed to their `min-width: 88px` floor — too narrow for
  a full weekday name, which used to wrap into a stack of single words ("Wedn/esday").
- A column whose name still matches the *current* UI language's default weekday name exactly
  (same "is this still a default" check `translateDefaultDayNames`, item 12, uses) shows a
  proper language-specific abbreviation instead — German two-letter (Mo/Di/Mi/...), English
  three-letter (Mon/Tue/Wed/...), from `DAYS_SHORT_BY_LANGUAGE` in `i18n.js`. A manually
  renamed/custom column has no language-correct abbreviation to fall back to, so it keeps
  showing (and wrapping) its full text exactly as before — unchanged behavior for that case.
- Implementation keeps a single source of truth for the name: the existing `contenteditable`
  `.day-name` span is still the only place the real value lives and is edited. A second,
  non-editable `.day-name-short` span sits next to it; `style.css` shows only one of the two
  depending on viewport width. Below the breakpoint, `.day-name` is `display: none` — and
  since a hidden element can't receive focus, tapping the visible short label calls the same
  `focusAndSelect()` helper used elsewhere (e.g. a newly added column) to reveal and focus the
  real span for renaming, toggling an `editing` class on `.day-col-inner` that both `style.css`
  and `wireDayRename`'s focus/blur handlers coordinate on.

### 24. Touch support for multi-timeslot entries

- **Trigger:** drag-to-select a multi-row entry (item 4) was mouse-only —
  `mousedown`/`mouseenter`/`mouseup` don't fire the way this code needs them to for a finger
  drag (touch has no hover, so per-cell `mouseenter` never fires while dragging a touch
  point across cells).
- **Why not just handle `touchmove` from the first touch:** a vertical swipe over the table is
  also how a touch user scrolls the page past it. Intercepting `touchmove` (with
  `preventDefault()`) from the very first touch would make that impossible — every attempt to
  scroll past the table would instead start a selection.
- **Long-press to arm, then drag:** touching a cell starts a 350ms timer
  (`LONG_PRESS_MS` in `app.js`) instead of immediately reacting. If the finger moves more than
  `TOUCH_MOVE_CANCEL_PX` (10px) before the timer fires, that's a scroll swipe, not a
  long-press — the timer is cancelled and nothing else happens, so native scrolling is never
  interfered with. If the timer fires undisturbed, drag-select mode arms (the anchor cell
  highlights immediately, plus a short `navigator.vibrate()` pulse where supported) and *from
  that point on* `touchmove` is tracked (with `preventDefault()`) the same way mouse-drag
  already was — via `document.elementFromPoint(touch.clientX, touch.clientY)` at each move,
  since touch delivers all its events to wherever the touch started rather than firing
  hover-style events on whatever's currently underneath the finger.
- **A quick tap needs no special handling at all:** since a short tap never arms drag-select
  (the long-press timer gets torn down by `touchend` before it fires) and touch-start is a
  passive listener that never calls `preventDefault()` for that case, the browser's own
  synthetic mouse events (a real, standard behavior for untouched taps) reach the exact same
  `mousedown`/`mouseup` handlers a desktop click already uses — so a plain tap opens the entry
  modal for one cell exactly as it always has, no touch-specific code path needed for it.
- The hint text now mentions this ("press and hold first on touch") — a long-press has no
  visual affordance hinting it's possible, unlike a mouse drag.

## Deliberate non-goals (so they don't get accidentally re-litigated in a rewrite)

- No build tooling (Webpack/Vite/bundler) for the app — deliberately kept to plain, directly
  servable ES modules; see CONTRIBUTING.md for the conditions under which that should change.
- No CSS framework — a small hand-written stylesheet.
- No pixel-perfect calendar layout (free positioning like Google Calendar) — deliberately
  dropped in favor of a row grid + sub-raster time badge (item 5), to keep the data model and
  collision handling simple.
- No backend/sync — only single-browser `localStorage`; export/import JSON is the only way to
  move a plan between browsers/devices.
- No authentication/accounts.
- No languages beyond German/English (currently) — the `i18n.js` structure would be
  extensible for that, but there's no third target language yet.
- No custom time picker for `<input type="time">` — the browser's native 12h/24h display is
  accepted rather than reimplemented (see item 12).
- No responsive adjustment of the fixed 70px row height — would complicate the pixel
  calculation for the sub-raster inset (see item 17).
- No automatic hiding of empty rows in the print view — print shows exactly the on-screen
  content minus controls, no extra content filtering (see item 15).
- No version/build number anywhere in the UI (e.g. in the About modal, item 21) — without a
  build step there's no natural point to generate one that wouldn't have to be maintained by
  hand.
