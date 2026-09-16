# Contributing / Architecture Notes

Short guide for further development — complements [REQUIREMENTS.md](REQUIREMENTS.md) (what the
app does) with the *how* (where code belongs, what gets tested, what's a deliberate decision
rather than an accident).

## Module map

| File | Responsibility | Testable? |
|---|---|---|
| `logic.js` | Pure schedule logic: time grid, multi-row entries, row/column operations. No DOM, no `localStorage`, no `window`. | Yes — `logic.test.js` |
| `io.js` | Export/import serialization of a plan (JSON, specified in [EXPORT_FORMAT.md](EXPORT_FORMAT.md)). Pure functions, takes language as a parameter instead of determining it itself. | Yes — `io.test.js` |
| `store.js` | Persistence of multiple plans + language choice. `localStorage` access is injectable via a `storage` parameter (tests use an in-memory fake). | Yes — `store.test.js` |
| `i18n.js` | String dictionary (DE/EN) + a couple of small pure helpers (`translate`, `detectDefaultLanguage`). No framework. | Yes — `i18n.test.js` |
| `app.js` | DOM controller: rendering, event wiring, connects the modules above to the page. The only module that touches `document`/`window`. | No, see below |

**Rule of thumb when adding code:** if a function doesn't need any browser globals (no
`document`, `window`, `localStorage`, `alert`, `confirm`), it belongs in `logic.js`, `io.js`,
`store.js`, or `i18n.js` — not in `app.js`. `app.js` should stay thin wiring: read values from
the DOM, call a pure function, write the result back to the DOM.

## Test philosophy

- **Tested:** everything in `logic.js` / `io.js` / `store.js` / `i18n.js` — with Node's
  built-in test runner (`npm test`, no external test framework). Runs in CI on every
  push/PR.
- **Not tested (automated):** `app.js`. A DOM controller with click handlers, drag logic, and
  modal state would only be meaningfully unit-testable with considerable effort (jsdom or a
  headless browser as a test dependency), for a payoff that isn't proportionate at this
  project's size. Instead: **manually click through with Playwright before every commit that
  changes `app.js`/`index.html`** (local server + Playwright, as done consistently throughout
  this project's session history — a screenshot and/or targeted `page.$eval` checks of the
  affected interaction). That's a deliberate choice of developer discipline over a CI gate; if
  `app.js` ever gets large/risky enough that this stops holding up, that's a signal that parts
  of it should move into testable modules (see the next section), not that a browser test suite
  needs to be introduced.

## Modularity: vanilla JS isn't dogma

The app is deliberately built without a build step and without a framework — not on
principle, but because the scope hasn't justified one so far: seven modules, a manageable
shape of state (one store object), no complex dependencies between UI components. A framework
(React/Vue/Svelte) or a bundler would introduce more conceptual and tooling overhead here than
it would return in clarity.

**That's not a ban on ever reconsidering, though — it's a trade-off that can shift as the
project grows.** Concrete signals that would justify a change:

- `app.js` grows significantly beyond its current size (as of writing: ~700 lines) and its
  responsibilities can no longer be grasped at a glance.
- State changes need multiple levels of manual DOM diffing (currently: almost everything just
  renders via `innerHTML = ""` + rebuild — works because the table stays small; would get
  inefficient at, say, hundreds of rows).
- Two or more components would need to keep state in sync in a way a simple
  render-after-every-change pattern can no longer cover.

**If `app.js` does get split up, prefer this direction** (the next sensible step, still
without a framework):

- `render.js` — table/modal rendering (DOM creation), takes plan data + callbacks, doesn't
  know about event-wiring details.
- `selection.js` — drag-selection state machine (`dragState`, `highlightSelection`, …).
- `columns.js` — day-column management (add/remove/rename), mirroring the existing separation
  of `logic.js` functions.
- `app.js` stays the thin remainder: registering event listeners, wiring the modules above
  together.

**If a framework/bundler does become necessary:** not a disqualifier, but deliberate and
small then — e.g. Preact instead of React (noticeably smaller), esbuild/Vite only if
TypeScript or real tree-shaking is actually needed, not "because that's just what you do".
Every new runtime dependency should get a sentence of justification in a commit or here in
this document.

## The one existing exception: Playwright

`scripts/screenshots.js` (for the README screenshots, automated via
`.github/workflows/screenshots.yml`) needs Playwright as a **devDependency**. That's the only
runtime dependency in the whole project, and deliberately kept that way:

- It only affects tooling/docs, never the shipped app code (`index.html`/`*.js` stay
  completely dependency-free).
- `npm test` (the actual CI gate) doesn't need it and doesn't install it.

New tooling devDependencies are fine in principle, as long as they hold to the same bar:
never in the shipped app code, never needed by `npm test`.

## Internationalization (i18n)

- Every new user-visible string (button, label, placeholder, confirm/alert text, error
  message) gets a key in `i18n.js`, **in both languages** (`de` and `en`) — no string may
  exist in only one language.
- Static text in `index.html`: `data-i18n="key"` (sets `textContent`),
  `data-i18n-placeholder="key"`, `data-i18n-title="key"`, `data-i18n-aria-label="key"`.
  `app.js`'s `applyStaticTranslations()` applies these on every language switch/render.
- Dynamic text in `app.js`: via the local `t(key, params)` helper (binds `translate()` to the
  currently selected language), `{param}` placeholders in the dictionary strings for
  interpolation (e.g. `t("confirmDeletePlan", { name: p.name })`).
- Errors from `logic.js`/`io.js`/`store.js` that get shown to the user throw an Error with a
  `.code` (via `codedError()` in `logic.js`) instead of a finished sentence — translation only
  happens in `app.js` when displaying it (`alert(err.code ? t(err.code) : err.message)`). That
  keeps the logic modules language-neutral and testable, without tests needing to
  pattern-match German or English error text.
- Day-name defaults (`DAYS_BY_LANGUAGE`) and the weekday mapping for the now-highlight
  (`WEEKDAYS_BY_LANGUAGE`) are language-dependent — they determine both the default day names
  of new plans/columns and which existing columns a language switch renames: a column that
  still matches its old default weekday name exactly at its position gets updated to the new
  default name at the same position (`translateDefaultDayNames` in `logic.js`); a manually
  renamed column is free text from that point on and stays untouched. Details and the
  collision guard: REQUIREMENTS.md, section 12.

## Colors & dark mode

- **Never write a hex/rgb color value directly in a component rule.** Every color comes from a
  custom-property token in `:root` (`style.css`, top of the file) — either a primitive token
  (`--bg`, `--surface`, `--text`, `--accent`, `--danger`, `--warn`, ...) or a token derived
  from those via `color-mix(in srgb, var(--x) N%, var(--y))`. A dark-mode override only
  touches the primitive tokens (in the `@media (prefers-color-scheme: dark)` block and under
  `:root[data-theme="dark"]`); any component that writes its own hex color instead breaks
  silently in dark mode (stays light, often unreadable).
- If a new component needs a new shade that can be expressed as a mix of existing tokens
  (e.g. "a light accent shimmer over the surface"), add a new `color-mix()` token in `:root`
  instead of maintaining separate light/dark values — the token then follows every theme
  change automatically. Only when a color genuinely can't be derived that way (a standalone
  signal color, see `--now-accent`/`--warn`) does it need a real, hand-picked second value in
  the dark block.
- Two exceptions are deliberately **not** tokenized: the day columns' rainbow colors
  (`--day-1..7`) and their header text color (`#1c1c26`) — the color-coding is content, not
  decoration, and so stays constant across themes (see REQUIREMENTS.md, section 20).
- `@media print` resets all primitive tokens back to their light values with `!important`, so
  a printout never bakes in the active dark theme. Forgetting a new primitive token there
  means print output can look wrong in dark mode — so when adding a primitive token, also
  extend that reset block in `style.css`.

## Deploying: bump style.css's cache-buster

`index.html` links the stylesheet as `style.css?v=N`. GitHub Pages doesn't support
per-request cache headers, so without a version query string, a visitor whose browser has
the previous `style.css` cached can end up with the new HTML paired with the old CSS at the
same time — new markup with no matching rule falls back to browser-default layout, which
breaks things in a way that's easy to misdiagnose as a real bug rather than a caching
mismatch (this happened once in practice: a wrapper `<div>` added to `index.html` had no
flex rule in a visitor's still-cached `style.css`, silently falling back to block layout and
stacking two elements that were supposed to sit side by side).

**Bump the `?v=N` number by one whenever `style.css` changes and is pushed** — nothing
enforces this automatically, it's a manual step. `app.js` and the other JS modules are
deliberately *not* versioned the same way: doing that safely would mean versioning every
relative `import` in every module consistently (they import each other), which isn't worth
the added complexity for this project's size — this is scoped to just the one file that
actually broke.

## Checklist for a new feature

1. Pure logic (data-model operations, validation) in `logic.js`/`io.js`/`store.js`, with
   unit tests.
2. New strings in `i18n.js`, both languages.
3. DOM wiring in `app.js` + markup/`data-i18n` attributes in `index.html` as needed.
4. If the feature changes the `plan` structure (a new field, a changed `entries` format, or
   similar): update [EXPORT_FORMAT.md](EXPORT_FORMAT.md) to match — it's the one place that
   fully specifies the export/import JSON format.
5. Manual Playwright run-through of the affected interaction (see the test philosophy above).
6. Touched `style.css`? Bump the `?v=N` cache-buster on its `<link>` in `index.html` (see
   "Deploying" above).
7. `npm test` green, then commit. CI (`ci.yml`) and deploy (`deploy-pages.yml`) run
   automatically on push to `main`.
