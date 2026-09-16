# Export/Import JSON Format

Specification of the file format the "Export"/"Import" button produces and reads
(`io.js`: `serializePlan`/`parsePlanImport`). The format is deliberately **a flat,
hand-readable and hand-editable JSON** — no binary format, no compression, no hidden fields.
Anyone who wants to can open an export file in a text editor, add entries by hand, and import
the file again.

Current format version: **1** (`EXPORT_FORMAT_VERSION` in `io.js`).

## Compatibility guarantee

- `app` and `version` are written on export but **not checked on import** — `parsePlanImport`
  only requires a `plan` object to be present (see below). A file with no `app`/`version`
  field at all imports just the same as one with a wrong value. That's intentional: the
  format should also accept hand-assembled JSON files, or ones exported by other tools, as
  long as the `plan` structure fits.
- Import is **defensive, never crashes**: if a field is missing or has the wrong type, a safe
  default is substituted (see the table below) instead of an error. Only two cases really
  abort the import (with a translatable error message):
  - The file isn't valid JSON → error code `errorInvalidJson`.
  - The JSON has no `plan` object (missing, `null`, or not an object) → error code
    `errorMissingPlanField`.
- Import always creates a **new** plan and switches to it afterwards — an existing plan is
  never overwritten.
- Purely internal state that isn't part of the plan's *content* is deliberately **not**
  exported: the internal plan `id` (would get a new one on import anyway), and
  `columnWidths`/`timeColWidth` (manually set column widths, see REQUIREMENTS.md section 18)
  — an imported file therefore renders at the default column width, even if the original
  column was set wider at export time.

## Top-level structure

```json
{
  "app": "vibe-stundenplan",
  "version": 1,
  "plan": {
    "name": "Winter Semester",
    "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "rowCount": 8,
    "times": ["08:00–09:30", "09:45–11:15", "..."],
    "entries": {
      "0_Monday": { "title": "Analysis", "description": "Lecture, Room 1", "link": "" }
    }
  }
}
```

| Field           | Type                         | Checked on import? | Fallback for a missing/invalid value                              |
| --------------- | ---------------------------- | ------------------- | ------------------------------------------------------------------- |
| `app`           | `string`                     | no                   | (ignored)                                                            |
| `version`       | `number`                     | no                   | (ignored)                                                            |
| `plan`          | `object`                     | **yes, required**    | missing/not an object → import aborts (`errorMissingPlanField`)     |
| `plan.name`     | `string`                     | yes                  | empty/missing/whitespace-only → "Importierter Plan"/"Imported Schedule" (depending on the current UI language) |
| `plan.days`     | `string[]`, non-empty, no blank strings | yes | missing/empty/contains a blank string → the current UI language's default weekday names |
| `plan.rowCount` | positive integer             | yes                  | missing/≤ 0/not an integer → `10`                                    |
| `plan.times`    | `string[]`                   | yes (per element)    | not an array → `[]`; non-string elements individually → `""`         |
| `plan.entries`  | `object` (not an array)      | yes                  | not an object/is an array → `{}`                                     |

`plan.name` is trimmed on import. Day names (`plan.days`) are taken over **unchanged**,
whatever language they're in or however they were renamed — they are not automatically
translated (see REQUIREMENTS.md, section 12, for the translation logic on a language switch,
which only affects plans already in the store, not import). Day-name uniqueness (no two
columns with the same name) is **not** enforced on import — that's an in-app rule, not a
format rule.

## `plan.entries`: key and value format

`entries` is a flat map. Each key identifies an occupied cell:

```
"<row>_<day>"
```

- `row`: 0-based row index (must be `< rowCount`; matches the index into `times`).
- `day`: the exact string from `plan.days` (case and special characters must match).
- Example: `"0_Monday"` = row 0, column "Monday".

**Important — only the anchor row of an entry has an entry:** if an entry occupies several
rows (`span` > 1, see below), there is exactly **one** entry for it, at the *first* row it
occupies. The following `span - 1` rows must **not** have their own key for the same column
in `entries` — the app assumes entries never overlap (`findAnchorRow` in `logic.js`), and a
doubly-occupied range leads to undefined rendering behavior. So hand-editing an export file to
add a multi-row entry only needs one entry with a `span`, not `span`-many.

### Entry object (the value of an `entries` entry)

`io.js` does **not** validate an individual entry's field contents — the value is passed
through raw, so `io.js` doesn't need to know every app field individually. The de facto
format the app itself writes and expects when rendering (`computeEntryUpdate`/`getEntrySpan`
in `logic.js`):

| Field         | Type         | Required? | Meaning                                                                                          |
| ------------- | ------------ | --------- | -------------------------------------------------------------------------------------------------- |
| `title`       | `string`     | de facto yes | Entry title. If empty/missing, the cell renders like an unoccupied cell (a "+" placeholder), even though the `entries` key exists. |
| `description` | `string`     | no        | Free text, only rendered if non-empty.                                                              |
| `link`        | `string`     | no        | URL, rendered as a link if non-empty (no format/scheme check).                                      |
| `startTime`   | `string`     | no        | `"HH:MM"`, independent of the row's time label — see REQUIREMENTS.md section 5 (sub-raster times). Only set if filled in in the entry modal. |
| `endTime`     | `string`     | no        | same as `startTime`.                                                                                 |
| `span`        | integer ≥ 1  | no        | Number of rows occupied starting at the anchor row. **Omitted when `span === 1`** (the app only writes this field for multi-row entries); if absent, `1` applies (`getEntrySpan`). |

`span` must not exceed `rowCount` at that position (`row + span - 1 < rowCount`), or the cell
renders past the visible grid.

## `plan.times`: row time labels

Free text per row, usually `"HH:MM–HH:MM"` (en dash `–`, U+2013; a plain hyphen `-` is also
accepted when parsing). A label doesn't have to be parseable — unparseable labels are treated
as plain display text, only losing the derived features that need an `HH:MM–HH:MM` format
(the now-highlight, sub-raster inset of an entry in that row). The number of elements in
`times` doesn't have to match `rowCount`; missing rows count as an empty label (`""`).

## Full example

```json
{
  "app": "vibe-stundenplan",
  "version": 1,
  "plan": {
    "name": "Winter Semester",
    "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "rowCount": 3,
    "times": ["08:00–09:30", "09:45–11:15", "11:30–13:00"],
    "entries": {
      "0_Monday": { "title": "Analysis", "description": "Lecture, Room 1", "link": "" },
      "1_Tuesday": {
        "title": "Practical",
        "description": "Lab meeting",
        "link": "https://example.org/lab",
        "startTime": "10:00",
        "endTime": "12:30",
        "span": 2
      }
    }
  }
}
```

The second entry occupies rows 1 and 2 of the "Tuesday" column (`span: 2`), but visually only
shows the 10:00–12:30 range within those two rows (sub-raster inset).

## Machine-readable schema

A [JSON Schema](https://json-schema.org/) (Draft 2020-12) for tools that want to validate the
top-level structure and the known entry fields — deliberately doesn't cover the `entries` key
format (`<row>_<day>`) or the "anchor row only" rule, since JSON Schema's vocabulary isn't
enough for that (see the prose rules above):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "vibe-stundenplan export",
  "type": "object",
  "required": ["plan"],
  "properties": {
    "app": { "type": "string" },
    "version": { "type": "number" },
    "plan": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "days": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 }
        },
        "rowCount": { "type": "integer", "minimum": 1 },
        "times": {
          "type": "array",
          "items": { "type": "string" }
        },
        "entries": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "required": ["title"],
            "properties": {
              "title": { "type": "string" },
              "description": { "type": "string" },
              "link": { "type": "string" },
              "startTime": { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
              "endTime": { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
              "span": { "type": "integer", "minimum": 1 }
            }
          }
        }
      }
    }
  }
}
```

Note: this schema is stricter than the actual import code (which, e.g., doesn't abort even
without a `title` or with a wrong `rowCount` type, but falls back to defaults instead — see
the table above). It describes the format the app itself **writes**, not the full error
tolerance on **reading**.

## Source code reference

- Export: `serializePlan` in `io.js`.
- Import/validation: `parsePlanImport` in `io.js`.
- Entry field semantics: `computeEntryUpdate`, `getEntrySpan`, `cellKey`/`parseCellKey` in
  `logic.js`.
- Tests covering this format, including all fallback cases: `io.test.js`.
