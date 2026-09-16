# Anforderungen: Vibe-Stundenplan

Dieses Dokument fasst zusammen, was die App aktuell leisten soll — als Referenz für ein
späteres Rewrite, unabhängig von der konkreten Implementierung. Es beschreibt den Stand
nach dem Feature-Batch "Sub-Raster-Zeiten / Zeilen entfernen / Tastatur-Bedienung".

## Zweck

Single-Page-App für die persönliche Alltagsplanung: ein Stundenplan-artiges Wochenraster,
in das man Termine/Aufgaben einträgt. Kein Kalender-Ersatz, kein Team-Tool — ein
Einzelnutzer-Werkzeug, das lokal im Browser läuft.

## Technische Rahmenbedingungen (bewusste Entscheidungen)

- **Kein Build-Schritt.** Reines HTML/CSS/JS (ES-Module), direkt als statische Dateien
  servierbar (lokal per `python3 -m http.server` o.ä., oder GitHub Pages). Kein Bundler,
  kein Framework, kein CSS-Framework.
- **Keine Laufzeit-Abhängigkeiten.** Die App selbst braucht keine npm-Pakete.
- **Kein Backend, keine Accounts.** Alle Daten liegen ausschließlich im `localStorage`
  des Browsers. Es gibt keine Synchronisation zwischen Geräten/Browsern außer über
  manuellen Export/Import (siehe unten).
- **Tests ohne Test-Framework.** Node's eingebauter Test-Runner (`node --test` /
  `npm test`), keine externe Test-Library.
- **Deployment:** GitHub Actions → GitHub Pages, automatisch bei jedem Push auf `main`.
  Erfordert ein öffentliches Repo (Pages auf privaten Repos braucht einen bezahlten
  GitHub-Plan) und einmalig manuell gesetzten Pages-Source ("GitHub Actions") in den
  Repo-Einstellungen — das kann der Workflow-Token nicht selbst freischalten.

## Architektur / Module

| Datei | Verantwortung |
|---|---|
| `index.html` | Markup, zwei Modal-`<form>`s (Termin-Modal, Zeitraster-Modal) |
| `style.css` | Styling, Regenbogenfarben pro Wochentag, responsives Layout |
| `logic.js` | **Reine** Funktionen — kein DOM, kein I/O, vollständig unit-testbar |
| `io.js` | Export/Import-Serialisierung eines Plans (JSON) |
| `store.js` | Persistenz mehrerer Pläne; kapselt `localStorage`, Storage ist injizierbar (Testbarkeit) |
| `app.js` | DOM-Controller; einziges Modul, das `document`/`window` anfasst |

Testdateien (`logic.test.js`, `io.test.js`, `store.test.js`) spiegeln die drei Logik-Module 1:1.
`app.js` selbst hat bewusst keine automatisierten Tests — seine Korrektheit wird während
der Entwicklung per Playwright-End-to-End-Durchläufen geprüft, nicht in der CI-Suite.

## Funktionale Anforderungen

### 1. Grundraster (Tabelle)

- Kopfzeile: 7 Wochentags-Spalten (Montag–Sonntag), jede in einer eigenen
  Regenbogenfarbe, feste Reihenfolge.
- Linke Spalte "Zeit": ein frei editierbares Textfeld pro Zeile, kein erzwungenes Format
  (bestimmte Features — Raster-Presets, Sub-Raster-Anzeige — funktionieren nur korrekt,
  wenn der Text dem Muster `HH:MM–HH:MM` entspricht; alles andere wird als
  undurchsichtiger Text behandelt und degradiert graceful).
- Start: 10 leere Zeilen.
- Zeilen können hinzugefügt ("+ Zeile hinzufügen") und wieder entfernt werden
  (×-Button pro Zeile).
  - Enthält die zu entfernende Zeile Termine (eigene oder durch einen mehrzeiligen
    Termin belegte), wird vor dem Entfernen eine Bestätigung verlangt.
  - Entfernen verschiebt alle späteren Termine um eine Zeile nach oben und
    verkürzt/löscht mehrzeilige Termine, die über die entfernte Zeile hinwegreichten.

### 2. Zeitraster-Hilfe ("Zeiten festlegen")

Modal mit zwei Wegen, die Zeitspalte zu befüllen:

a. **Feste Presets**: TU Dresden (Doppelstunden), RWTH Aachen (Blockraster) — je 8 fixe
   Zeit-Labels.
b. **Eigenes Raster**: Intervall in **Minuten** (erlaubt Sub-Stunden-Takte wie 10 oder 15
   Minuten) + Start-/Endzeit über native `<input type="time">`-Felder, sodass das Raster
   an jeder beliebigen Minute starten kann (z. B. 7:50).

Anwenden eines Presets/Rasters:
- Erhöht die Zeilenzahl bei Bedarf (verkleinert sie nie).
- Überschreibt nur die ersten N Zeit-Labels; falls dort schon abweichende Werte stehen,
  wird vorher eine Bestätigung verlangt.
- Rührt Termine (Entries) nie an.

### 3. Termine (Entries)

- Klick auf eine Zelle (oder Drag, siehe Punkt 4) öffnet ein Modal zum
  Hinzufügen/Bearbeiten.
- Felder: Titel (Pflicht), Beschreibung (optional), Link (optional, URL),
  Start/Ende (optional, `HH:MM`, unabhängig vom Zeilen-Zeitlabel — siehe Punkt 5).
- Speichern mit leerem Titel löscht den Termin (entspricht "Löschen").
- Expliziter "Löschen"-Button entfernt den Termin.

### 4. Mehrzeilige Termine (Drag-Auswahl)

- Klick-und-Ziehen vertikal innerhalb **einer** Tages-Spalte wählt einen
  zusammenhängenden Zeilenbereich aus; Loslassen öffnet das Termin-Modal für genau
  diesen Bereich.
- Der resultierende Termin wird einmalig an seiner ersten (Anker-)Zeile gespeichert, mit
  einem `span` (Zeilenanzahl), und als eine verschmolzene Zelle (`rowspan`) dargestellt.
- Zieht man eine neue Auswahl, die einen bestehenden Termin ganz oder teilweise
  überschneidet, ersetzt das Speichern diesen bestehenden Termin.
- Ein einfacher Klick (kein Drag) auf eine bereits befüllte Zelle öffnet den bestehenden
  Termin zur Bearbeitung, mit unverändertem Span.
- **Invariante:** Termine überlappen sich für denselben Tag nie. Das ist die gesamte
  "Kollisionsbehandlung" — durchgesetzt beim Schreiben (überlappende bestehende Einträge
  werden vor dem Speichern eines neuen Bereichs entfernt), keine separate Laufzeit-Prüfung
  nötig.

### 5. Sub-Raster-Zeiten (unabhängig vom Zeilenraster)

- Ein Termin kann optional eigene `startTime`/`endTime` (`HH:MM`) tragen, unabhängig vom
  Zeilen-Zeitlabel der Zeile(n), die er belegt.
- **Zweck:** Ein Termin soll mitten in einer Zeile beginnen/enden können (z. B. ein
  15-minütiger Call um 08:10–08:25 innerhalb einer 08:00–09:00-Zeile), ohne dass das
  gesamte Raster so fein aufgelöst sein muss.
- **Darstellung:** kleines Zeit-Badge über dem Titel; der Zelleninhalt wird zusätzlich
  optisch innerhalb seiner Zelle verschoben (Pixel-basiertes Padding oben/unten,
  proportional dazu, wo die Zeit innerhalb der Gesamtzeitspanne der belegten Zeile(n)
  liegt). Das ist eine **Näherung fürs Auge**, kein pixelgenauer Kalender — und fällt
  stillschweigend auf "keine Verschiebung" zurück, wenn die Zeilen-Zeitlabels nicht als
  `HH:MM–HH:MM` parsebar sind.
- **Bewusst außerhalb des Scopes:** echte freie (rasterunabhängige) Positionierung mit
  eigener Kollisionslogik wie in einem echten Kalender-UI. Das Zeilenraster bleibt die
  Quelle der Wahrheit dafür, was einen Zeitslot belegen darf; Sub-Raster-Zeiten sind eine
  reine Anzeige-Ebene obendrauf. Diese Entscheidung wurde bewusst getroffen, um Datenmodell
  und Kollisionsbehandlung einfach zu halten (Alternative wäre ein kompletter Rewrite von
  Rendering/Datenmodell auf eine pixelgenaue Zeitachse gewesen).

### 6. Editierbarer Titel

- Die Überschrift (`<h1>`, Planname) ist direkt inline editierbar (`contenteditable`).
  Enter bestätigt (blur), ohne einen Zeilenumbruch einzufügen; blur übernimmt den
  getrimmten, nicht-leeren Namen (leer → Fallback auf Standardnamen).
- Umbenennen aktualisiert: die Anzeige, `document.title`
  (`"{Name} · Stundenplan"`), und den Eintrag im Plan-Switcher.

### 7. Mehrere Stundenpläne

- Ein Plan = `{ id, name, rowCount, times[], entries{} }`.
- Dropdown listet alle Pläne nach Name; Auswahl wechselt den aktiven Plan und
  rendert alles neu.
- "+" legt einen neuen leeren Plan an (automatisch benannt "Neuer Plan", "Neuer Plan 2",
  … um Kollisionen zu vermeiden) und fokussiert/selektiert sofort den Titel zum Umbenennen.
- 🗑 löscht den aktuellen Plan nach Bestätigung; der letzte verbleibende Plan kann nicht
  gelöscht werden (Button deaktiviert).
- Alle Pläne liegen gemeinsam unter einem `localStorage`-Schlüssel; Planwechsel ist
  sofort/lokal, kein Reload nötig.

### 8. Export / Import

- Export lädt den aktiven Plan als eingerücktes, für Menschen lesbares/editierbares
  JSON herunter, Dateiname aus dem (slugifizierten) Plannamen.
- JSON-Form: `{ app: "vibe-stundenplan", version: 1, plan: { name, rowCount, times, entries } }`.
- Import liest so eine Datei und legt sie als **neuen** Plan an (überschreibt nie einen
  bestehenden Plan), wechselt danach automatisch dorthin.
- Import ist defensiv: fehlende/kaputte Felder fallen auf sinnvolle Defaults zurück
  (fehlender Name → "Importierter Plan", ungültiges `rowCount` → 10, `times` kein Array
  → `[]`, `entries` kein Objekt → `{}`) statt abzustürzen.
- `entries` werden roh durchgereicht (kein Feld-Allowlist in `io.js`) — `span`,
  `startTime`, `endTime` etc. werden automatisch mit exportiert/importiert, ohne dass
  `io.js` jedes Entry-Feld einzeln kennen muss.

### 9. Persistenz & Migration

- Alle Daten liegen in `localStorage`, Schlüssel `stundenplan-store-v1`, kein
  Backend/Account.
- Beim ersten Laden ohne vorhandenen Store wird das ältere Einzelplan-Format
  (Schlüssel `stundenplan-data-v1`, aus der Zeit vor Multi-Plan-Unterstützung) automatisch
  in einen einzelnen Plan migriert, damit ein App-Update keine bestehenden Daten verliert.
- Ein kaputter/unlesbarer Legacy-Wert wird ignoriert (Fallback auf einen frischen leeren
  Plan) statt die App abstürzen zu lassen.

### 10. Tastatur-Bedienung

- Beide Modals (Termin, Zeitraster) sind echte `<form>`-Elemente.
- Enter in einem einzeiligen Feld (Titel, Link, Start-/Endzeit, Raster-Eingaben) sendet
  das Formular ab (speichert / wendet das Raster an).
- Enter im mehrzeiligen "Beschreibung"-Feld fügt wie gewohnt einen Zeilenumbruch ein
  (kein Submit) — normales HTML-Formularverhalten, keine Sonderbehandlung nötig.
- Escape schließt das jeweils offene Modal, verwirft ungespeicherte Änderungen.
- Tab-Reihenfolge folgt der natürlichen DOM-Reihenfolge der Felder.

### 11. CI / Tests

- Unit-Tests über Node's eingebauten Test-Runner (`node --test`, aufgerufen als
  `npm test`), keine externe Test-Abhängigkeit.
- Ein Testfile pro Logik-Modul (`logic.test.js`, `io.test.js`, `store.test.js`).
- `store.test.js` verwendet ein kleines In-Memory-Fake für `localStorage`
  (dependency-injected über `loadStore(storage)` / `saveStore(store, storage)`), braucht
  also keinen Browser/DOM.
- GitHub-Actions-Workflow `ci.yml` läuft bei jedem Push auf `main` und bei jedem Pull
  Request.

### 12. Deployment

- GitHub-Actions-Workflow `deploy-pages.yml` deployt die statische Seite (Repo-Root
  unverändert, kein Build) auf GitHub Pages bei jedem Push auf `main`.
- Live-URL: https://fionapreroll.github.io/vibe-stundenplan/

## Bewusste Nicht-Ziele (damit sie in einem Rewrite nicht versehentlich neu diskutiert werden)

- Kein Build-Tooling (Webpack/Vite/Bundler) — bewusst bei reinen, direkt servierbaren
  ES-Modulen belassen.
- Kein CSS-Framework — kleines handgeschriebenes Stylesheet.
- Kein pixelgenaues Kalender-Layout (freie Positionierung wie Google Calendar) — bewusst
  zugunsten von Zeilenraster + Sub-Raster-Zeit-Badge (Punkt 5) verworfen, um Datenmodell
  und Kollisionsbehandlung einfach zu halten.
- Kein Backend/Sync — nur Single-Browser-`localStorage`; Export/Import-JSON ist der
  einzige Weg, einen Plan zwischen Browsern/Geräten zu bewegen.
- Keine Authentifizierung/Accounts.
