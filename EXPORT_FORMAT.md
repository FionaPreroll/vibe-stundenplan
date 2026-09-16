# Export/Import-JSON-Format

Spezifikation des Dateiformats, das der "Exportieren"/"Importieren"-Button erzeugt bzw. liest
(`io.js`: `serializePlan`/`parsePlanImport`). Das Format ist bewusst **ein flaches, von Hand
lesbares und editierbares JSON** — kein Binärformat, keine Kompression, keine versteckten
Felder. Wer möchte, kann eine Export-Datei in einem Texteditor öffnen, Termine per Hand
ergänzen und die Datei wieder importieren.

Aktuelle Formatversion: **1** (`EXPORT_FORMAT_VERSION` in `io.js`).

## Kompatibilitätsgarantie

- `app` und `version` werden beim Export geschrieben, aber **beim Import nicht geprüft** —
  `parsePlanImport` verlangt nur ein vorhandenes `plan`-Objekt (siehe unten). Eine Datei ganz
  ohne `app`/`version`-Feld wird also genauso importiert wie eine mit falschem Wert. Das ist
  Absicht: Das Format soll auch von Hand zusammengestellte oder aus anderen Werkzeugen
  exportierte JSON-Dateien akzeptieren, solange die `plan`-Struktur passt.
- Import ist **defensiv, nie abstürzend**: Fehlt ein Feld oder hat es den falschen Typ, wird
  ein sicherer Default eingesetzt (siehe Tabelle unten) statt eines Fehlers. Nur zwei Fälle
  brechen den Import wirklich ab (mit einer übersetzbaren Fehlermeldung):
  - Die Datei ist kein gültiges JSON → Fehlercode `errorInvalidJson`.
  - Das JSON hat kein `plan`-Objekt (fehlt, ist `null`, oder ist kein Objekt) → Fehlercode
    `errorMissingPlanField`.
- Import legt immer einen **neuen** Plan an und wechselt danach dorthin — ein bestehender Plan
  wird nie überschrieben.
- Rein internes State, das nicht Teil des Plan-*Inhalts* ist, wird bewusst **nicht**
  exportiert: die interne Plan-`id` (bekäme beim Import ohnehin eine neue), sowie
  `columnWidths`/`timeColWidth` (manuell gesetzte Spaltenbreiten, siehe REQUIREMENTS.md
  Abschnitt 18) — eine importierte Datei rendert also mit der Standard-Spaltenbreite, auch
  wenn die Ursprungsspalte beim Export breiter eingestellt war.

## Top-Level-Struktur

```json
{
  "app": "vibe-stundenplan",
  "version": 1,
  "plan": {
    "name": "Wintersemester",
    "days": ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"],
    "rowCount": 8,
    "times": ["08:00–09:30", "09:45–11:15", "..."],
    "entries": {
      "0_Montag": { "title": "Analysis", "description": "Vorlesung, HS 1", "link": "" }
    }
  }
}
```

| Feld            | Typ                        | Beim Import geprüft? | Fallback bei fehlendem/ungültigem Wert                          |
| --------------- | --------------------------- | --------------------- | ----------------------------------------------------------------- |
| `app`           | `string`                    | nein                   | (wird ignoriert)                                                   |
| `version`       | `number`                    | nein                   | (wird ignoriert)                                                   |
| `plan`          | `object`                    | **ja, Pflichtfeld**    | fehlt/kein Objekt → Import bricht ab (`errorMissingPlanField`)     |
| `plan.name`     | `string`                    | ja                     | leer/fehlt/nur Whitespace → "Importierter Plan"/"Imported Schedule" (abhängig von der aktuellen UI-Sprache) |
| `plan.days`     | `string[]`, nicht-leer, keine Leerstrings | ja | fehlt/leer/enthält Leerstring → Standard-Wochentage der aktuellen UI-Sprache |
| `plan.rowCount` | positive ganze Zahl         | ja                     | fehlt/≤ 0/keine ganze Zahl → `10`                                  |
| `plan.times`    | `string[]`                  | ja (pro Element)       | kein Array → `[]`; nicht-String-Elemente einzeln → `""`            |
| `plan.entries`  | `object` (kein Array)       | ja                     | kein Objekt/ist Array → `{}`                                       |

`plan.name` wird beim Import getrimmt. Tagesnamen (`plan.days`) werden **unverändert**
übernommen, egal in welcher Sprache oder wie sie umbenannt wurden — sie werden nicht
automatisch übersetzt (siehe REQUIREMENTS.md, Abschnitt 12, für die Übersetzungslogik beim
Sprachwechsel, die nur bereits im Store vorhandene Pläne betrifft, nicht den Import).
Eindeutigkeit der Tagesnamen (keine zwei Spalten mit demselben Namen) wird beim Import
**nicht** erzwungen — das ist eine In-App-Regel, keine Format-Regel.

## `plan.entries`: Schlüssel und Wertformat

`entries` ist eine flache Map. Jeder Schlüssel identifiziert eine belegte Zelle:

```
"<row>_<day>"
```

- `row`: 0-basierter Zeilenindex (muss `< rowCount` sein; entspricht dem Index in `times`).
- `day`: exakter String aus `plan.days` (Groß-/Kleinschreibung und Sonderzeichen müssen
  übereinstimmen).
- Beispiel: `"0_Montag"` = Zeile 0, Spalte "Montag".

**Wichtig — nur die Ankerzeile eines Termins hat einen Eintrag:** Belegt ein Termin mehrere
Zeilen (`span` > 1, siehe unten), gibt es dafür genau **einen** Eintrag bei der *ersten*
Zeile, die er belegt. Die folgenden `span - 1` Zeilen dürfen in `entries` **keinen eigenen
Schlüssel** für dieselbe Spalte haben — die App geht davon aus, dass sich Termine nie
überlappen (`findAnchorRow` in `logic.js`), und ein doppelt belegter Bereich führt zu
undefiniertem Rendering-Verhalten. Wer eine Export-Datei von Hand um einen mehrzeiligen
Termin ergänzt, muss also nur einen Eintrag mit `span` schreiben, nicht `span`-viele.

### Termin-Objekt (Wert eines `entries`-Eintrags)

`io.js` validiert die Feldinhalte eines einzelnen Termins **nicht** — der Wert wird roh
durchgereicht, damit `io.js` nicht jedes App-Feld einzeln kennen muss. Das faktische Format,
das die App selbst schreibt und beim Rendern erwartet (`computeEntryUpdate`/`getEntrySpan` in
`logic.js`):

| Feld          | Typ      | Pflicht? | Bedeutung                                                                                     |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------------- |
| `title`       | `string` | de facto ja | Termin-Titel. Ist er leer/fehlt, rendert die Zelle wie eine unbelegte Zelle (Platzhalter "+"), obwohl der `entries`-Schlüssel existiert. |
| `description` | `string` | nein     | Freitext, wird nur gerendert wenn nicht-leer.                                                    |
| `link`        | `string` | nein     | URL, wird als Link gerendert wenn nicht-leer (kein Format-/Schema-Check).                        |
| `startTime`   | `string` | nein     | `"HH:MM"`, unabhängig vom Zeilen-Zeitlabel — siehe REQUIREMENTS.md Abschnitt 5 (Sub-Raster-Zeiten). Nur gesetzt, wenn im Termin-Modal ausgefüllt. |
| `endTime`     | `string` | nein     | wie `startTime`.                                                                                  |
| `span`        | Ganzzahl ≥ 1 | nein | Anzahl der ab der Ankerzeile belegten Zeilen. **Wird bei `span === 1` weggelassen** (App schreibt das Feld nur bei mehrzeiligen Terminen); fehlt es, gilt `1` (`getEntrySpan`). |

`span` darf `rowCount` an der jeweiligen Position nicht überschreiten (`row + span - 1 <
rowCount`), sonst rendert die Zelle über das sichtbare Raster hinaus.

## `plan.times`: Zeilen-Zeitlabels

Freitext pro Zeile, üblicherweise `"HH:MM–HH:MM"` (Halbgeviertstrich `–`, U+2013; ein
gewöhnlicher Bindestrich `-` wird beim Parsen ebenfalls akzeptiert). Ein Label muss nicht
parsebar sein — nicht-parsebare Labels werden als reiner Anzeigetext behandelt, verlieren
dabei nur die abgeleiteten Features, die ein `HH:MM–HH:MM`-Format brauchen (Jetzt-
Hervorhebung, Sub-Raster-Einrückung eines Termins in dieser Zeile). Die Anzahl der Elemente in
`times` muss nicht `rowCount` entsprechen; fehlende Zeilen gelten als leeres Label (`""`).

## Vollständiges Beispiel

```json
{
  "app": "vibe-stundenplan",
  "version": 1,
  "plan": {
    "name": "Wintersemester",
    "days": ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"],
    "rowCount": 3,
    "times": ["08:00–09:30", "09:45–11:15", "11:30–13:00"],
    "entries": {
      "0_Montag": { "title": "Analysis", "description": "Vorlesung, HS 1", "link": "" },
      "1_Dienstag": {
        "title": "Praktikum",
        "description": "Treffen im Labor",
        "link": "https://example.org/labor",
        "startTime": "10:00",
        "endTime": "12:30",
        "span": 2
      }
    }
  }
}
```

Der zweite Termin belegt Zeile 1 und 2 der Spalte "Dienstag" (`span: 2`), zeigt aber optisch
nur den Bereich 10:00–12:30 innerhalb dieser beiden Zeilen an (Sub-Raster-Einrückung).

## Maschinenlesbares Schema

Ein [JSON Schema](https://json-schema.org/) (Draft 2020-12) für Werkzeuge, die die
Top-Level-Struktur und die bekannten Termin-Felder validieren wollen — deckt bewusst nicht
`entries`-Schlüsselformat (`<row>_<day>`) oder die "nur Ankerzeile"-Regel ab, da das
JSON-Schema-Vokabular dafür nicht ausreicht (siehe Prosa-Regeln oben):

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

Hinweis: Dieses Schema ist strenger als der tatsächliche Import-Code (der z. B. auch ohne
`title` oder mit falschem `rowCount`-Typ nicht abbricht, sondern auf Defaults zurückfällt —
siehe Tabelle oben). Es beschreibt das Format, das die App selbst **schreibt**, nicht die
volle Fehlertoleranz beim **Lesen**.

## Quellcode-Referenz

- Export: `serializePlan` in `io.js`.
- Import/Validierung: `parsePlanImport` in `io.js`.
- Termin-Feldsemantik: `computeEntryUpdate`, `getEntrySpan`, `cellKey`/`parseCellKey` in
  `logic.js`.
- Tests, die dieses Format inklusive aller Fallback-Fälle absichern: `io.test.js`.
