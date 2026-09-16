# Anforderungen: Vibe-Stundenplan

Dieses Dokument fasst zusammen, was die App aktuell leisten soll — als Referenz für ein
späteres Rewrite, unabhängig von der konkreten Implementierung. Es beschreibt den Stand nach
dem Feature-Batch "Tagesspalten entfernbar/hinzufügbar, Jetzt-Hervorhebung, echte
Mehrsprachigkeit (DE/EN), README mit automatisierten Screenshots".

Für Modul-Verantwortlichkeiten, Test-Philosophie und Konventionen (i18n, wann sich ein
Framework lohnen würde etc.) siehe [CONTRIBUTING.md](CONTRIBUTING.md) — dieses Dokument hier
beschreibt das *was*, CONTRIBUTING.md das *wie*.

## Zweck

Single-Page-App für die persönliche Alltagsplanung: ein Stundenplan-artiges Wochenraster, in
das man Termine/Aufgaben einträgt. Kein Kalender-Ersatz, kein Team-Tool — ein
Einzelnutzer-Werkzeug, das lokal im Browser läuft, für deutsch- und englischsprachige Nutzer.

## Technische Rahmenbedingungen (bewusste Entscheidungen)

- **Kein Build-Schritt für die App.** Reines HTML/CSS/JS (ES-Module), direkt als statische
  Dateien servierbar (lokal per `python3 -m http.server` o. ä., oder GitHub Pages). Kein
  Bundler, kein Framework, kein CSS-Framework.
- **Keine Laufzeit-Abhängigkeiten für die App.** Die ausgelieferte App braucht keine
  npm-Pakete. Die einzige Ausnahme im ganzen Repo ist Playwright als reine devDependency für
  das Screenshot-Tooling (siehe Punkt 13) — nie im App-Code, nie für `npm test` nötig.
- **Kein Backend, keine Accounts.** Alle Daten liegen ausschließlich im `localStorage` des
  Browsers. Keine Synchronisation zwischen Geräten/Browsern außer über manuellen
  Export/Import (siehe Punkt 8).
- **Tests ohne Test-Framework.** Node's eingebauter Test-Runner (`node --test` / `npm test`).
- **Deployment:** GitHub Actions → GitHub Pages, automatisch bei jedem Push auf `main`.
  Erfordert ein öffentliches Repo (Pages auf privaten Repos braucht einen bezahlten
  GitHub-Plan) und einmalig manuell gesetzten Pages-Source ("GitHub Actions") in den
  Repo-Einstellungen — das kann der Workflow-Token nicht selbst freischalten.

## Architektur / Module

| Datei | Verantwortung |
|---|---|
| `index.html` | Markup, zwei Modal-`<form>`s (Termin-Modal, Zeitraster-Modal), `data-i18n*`-Attribute für statischen Text |
| `style.css` | Styling, Regenbogenfarben (positionsbasiert, nicht an feste Wochentage gebunden), responsives Layout |
| `logic.js` | **Reine** Stundenplan-Logik — kein DOM, kein I/O, keine Sprache, vollständig unit-testbar |
| `io.js` | Export/Import-Serialisierung eines Plans (JSON), nimmt Sprache als Parameter |
| `store.js` | Persistenz mehrerer Pläne + Sprachwahl; kapselt `localStorage`, Storage ist injizierbar (Testbarkeit) |
| `i18n.js` | String-Wörterbuch (DE/EN) + reine Helper (`translate`, `detectDefaultLanguage`) |
| `app.js` | DOM-Controller; einziges Modul, das `document`/`window`/`alert`/`confirm` anfasst |

Testdateien (`logic.test.js`, `io.test.js`, `store.test.js`, `i18n.test.js`) spiegeln die vier
Logik-Module 1:1. `app.js` hat bewusst keine automatisierten Tests (Begründung in
CONTRIBUTING.md); seine Korrektheit wird während der Entwicklung per
Playwright-End-to-End-Durchläufen geprüft.

## Funktionale Anforderungen

### 1. Grundraster (Tabelle)

- Kopfzeile: Tages-Spalten, jede in einer Regenbogenfarbe (zyklisch nach Spaltenposition
  vergeben, nicht an bestimmte Wochentage gebunden — siehe Punkt 1a).
- Linke Spalte "Zeit": ein frei editierbares Textfeld pro Zeile, kein erzwungenes Format
  (bestimmte Features — Raster-Presets, Sub-Raster-Anzeige, Jetzt-Hervorhebung —
  funktionieren nur korrekt, wenn der Text dem Muster `HH:MM–HH:MM` entspricht; alles andere
  wird als undurchsichtiger Text behandelt und degradiert graceful).
- Start: 10 leere Zeilen, 7 Tages-Spalten (Standardnamen abhängig von der aktuellen
  Sprache, siehe Punkt 14).
- Zeilen können hinzugefügt ("+ Zeile hinzufügen") und wieder entfernt werden (×-Button pro
  Zeile).
  - Enthält die zu entfernende Zeile Termine (eigene oder durch einen mehrzeiligen Termin
    belegte), wird vor dem Entfernen eine Bestätigung verlangt.
  - Entfernen verschiebt alle späteren Termine um eine Zeile nach oben und
    verkürzt/löscht mehrzeilige Termine, die über die entfernte Zeile hinwegreichten.

### 1a. Tagesspalten: hinzufügen, umbenennen, entfernen

- Jede Spaltenüberschrift ist direkt inline editierbar (`contenteditable`, analog zum
  Plantitel, Punkt 6) — Klicken benennt die Spalte um.
- "+" am rechten Ende der Kopfzeile fügt eine neue Spalte hinzu (automatisch benannt "Tag N"
  / "Day N" je nach Sprache, um Kollisionen zu vermeiden) und fokussiert/selektiert sofort
  den Namen zum Umbenennen.
- ×-Button pro Spaltenkopf entfernt diese Spalte. Enthält sie Termine, wird vorher eine
  Bestätigung verlangt. Die letzte verbleibende Spalte kann nicht entfernt werden
  (Button deaktiviert).
- **Wichtig:** Termine werden intern nach Spalten-*Name* (nicht Position) referenziert.
  Umbenennen einer Spalte verschiebt automatisch alle ihre Termine auf den neuen Namen;
  Versuche, auf einen bereits vergebenen Namen umzubenennen, werden abgelehnt (Meldung,
  alter Name bleibt erhalten).
- Ein Sprachwechsel (Punkt 14) benennt **nie** automatisch bestehende Spalten um — nur neu
  angelegte Pläne/Spalten bekommen die Standardnamen der aktuell gewählten Sprache. Das
  verhindert stille Datenmanipulation an bestehenden Plänen.

### 2. Zeitraster-Hilfe ("Zeiten festlegen")

Modal mit zwei Wegen, die Zeitspalte zu befüllen:

a. **Feste Presets**: TU Dresden (Doppelstunden), RWTH Aachen (Blockraster) — je 8 fixe
   Zeit-Labels.
b. **Eigenes Raster**: Intervall in **Minuten** (erlaubt Sub-Stunden-Takte wie 10 oder 15
   Minuten) + Start-/Endzeit über native `<input type="time">`-Felder, sodass das Raster an
   jeder beliebigen Minute starten kann (z. B. 7:50).

Anwenden eines Presets/Rasters:
- Erhöht die Zeilenzahl bei Bedarf (verkleinert sie nie).
- Überschreibt nur die ersten N Zeit-Labels; falls dort schon abweichende Werte stehen, wird
  vorher eine Bestätigung verlangt.
- Rührt Termine (Entries) nie an.

### 3. Termine (Entries)

- Klick auf eine Zelle (oder Drag, siehe Punkt 4) öffnet ein Modal zum Hinzufügen/Bearbeiten.
- Felder: Titel (Pflicht), Beschreibung (optional), Link (optional, URL), Start/Ende
  (optional, `HH:MM`, unabhängig vom Zeilen-Zeitlabel — siehe Punkt 5).
- Speichern mit leerem Titel löscht den Termin (entspricht "Löschen").
- Expliziter "Löschen"-Button entfernt den Termin.

### 4. Mehrzeilige Termine (Drag-Auswahl)

- Klick-und-Ziehen vertikal innerhalb **einer** Tages-Spalte wählt einen zusammenhängenden
  Zeilenbereich aus; Loslassen öffnet das Termin-Modal für genau diesen Bereich.
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
  15-minütiger Call um 08:10–08:25 innerhalb einer 08:00–09:00-Zeile), ohne dass das gesamte
  Raster so fein aufgelöst sein muss.
- **Darstellung:** kleines Zeit-Badge über dem Titel; die sichtbare Box des Termins (ein
  `.entry-box`-Div, absolut innerhalb der `<td>` positioniert, statt die `<td>` selbst zu
  färben/umranden) wird zusätzlich innerhalb ihrer Zelle verschoben — pixelbasiert per
  `top`/`bottom`, proportional dazu, wo die Zeit innerhalb der Gesamtzeitspanne der belegten
  Zeile(n) liegt (bewusst Pixel statt CSS-Prozent, siehe oben). Wichtig: verschoben wird die
  **Box selbst** (ihre Ober-/Unterkante), nicht nur ihr Inhalt per Padding — sonst wirkt es
  so, als würde nur der Text nach unten rutschen, während die Zelle optisch schon vorher
  beginnt, was bei einem mehrzeiligen Termin mit spätem Start seltsam aussieht. Das ist eine
  **Näherung fürs Auge**, kein pixelgenauer Kalender — und fällt auf "keine Verschiebung"
  zurück, wenn die Zeilen-Zeitlabels nicht als `HH:MM–HH:MM` parsebar sind (z. B. bei den
  standardmäßig leeren Zeilen eines frischen Plans).
- **UX-Absicherung:** Ist im Termin-Modal eine Start-/Endzeit gesetzt, aber die betroffene(n)
  Zeile(n) haben kein parsebares Zeitlabel, erscheint ein Hinweistext, der das erklärt —
  statt dass die Einrückung einfach stillschweigend ausbleibt und wie ein Bug wirkt.
- **Bewusst außerhalb des Scopes:** echte freie (rasterunabhängige) Positionierung mit
  eigener Kollisionslogik wie in einem echten Kalender-UI. Das Zeilenraster bleibt die
  Quelle der Wahrheit dafür, was einen Zeitslot belegen darf; Sub-Raster-Zeiten sind eine
  reine Anzeige-Ebene obendrauf. Diese Entscheidung wurde bewusst getroffen, um Datenmodell
  und Kollisionsbehandlung einfach zu halten.

### 6. Editierbarer Titel

- Die Überschrift (`<h1>`, Planname) ist direkt inline editierbar (`contenteditable`). Enter
  bestätigt (blur), ohne einen Zeilenumbruch einzufügen; blur übernimmt den getrimmten,
  nicht-leeren Namen (leer → Fallback auf sprachabhängigen Standardnamen, Punkt 14).
- Umbenennen aktualisiert: die Anzeige, `document.title`
  (`"{Name} · {Stundenplan|Schedule}"`), und den Eintrag im Plan-Switcher.

### 7. Mehrere Stundenpläne

- Ein Plan = `{ id, name, days[], rowCount, times[], entries{} }`.
- Dropdown listet alle Pläne nach Name; Auswahl wechselt den aktiven Plan und rendert alles
  neu.
- "+" legt einen neuen leeren Plan an (automatisch benannt, sprachabhängig, mit
  Kollisionsvermeidung) und fokussiert/selektiert sofort den Titel zum Umbenennen.
- 🗑 löscht den aktuellen Plan nach Bestätigung; der letzte verbleibende Plan kann nicht
  gelöscht werden (Button deaktiviert).
- Alle Pläne liegen gemeinsam unter einem `localStorage`-Schlüssel; Planwechsel ist
  sofort/lokal, kein Reload nötig.

### 8. Export / Import

- Export lädt den aktiven Plan als eingerücktes, für Menschen lesbares/editierbares JSON
  herunter, Dateiname aus dem (slugifizierten) Plannamen.
- JSON-Form: `{ app: "vibe-stundenplan", version: 1, plan: { name, days, rowCount, times, entries } }`.
  Vollständige Feld-für-Feld-Spezifikation inkl. Fallback-Regeln und JSON-Schema-Entwurf:
  siehe [EXPORT_FORMAT.md](EXPORT_FORMAT.md).
- Import liest so eine Datei und legt sie als **neuen** Plan an (überschreibt nie einen
  bestehenden Plan), wechselt danach automatisch dorthin.
- Import ist defensiv: fehlende/kaputte Felder fallen auf sinnvolle, sprachabhängige
  Defaults zurück (fehlender Name → "Importierter Plan"/"Imported Schedule", ungültiges
  `rowCount` → 10, `times` kein Array → `[]`, `entries` kein Objekt → `{}`, `days` fehlt/leer
  /enthält Leerstrings → Standard-Wochentage der aktuellen UI-Sprache) statt abzustürzen.
- `entries` werden roh durchgereicht (kein Feld-Allowlist in `io.js`) — `span`, `startTime`,
  `endTime` etc. werden automatisch mit exportiert/importiert, ohne dass `io.js` jedes
  Entry-Feld einzeln kennen muss.
- Der exportierte Plan trägt die Tagesnamen exakt so, wie sie zum Exportzeitpunkt hießen
  (egal in welcher Sprache/wie umbenannt) — beim Import werden sie unverändert übernommen.

### 9. Persistenz & Migration

- Alle Daten liegen in `localStorage`, Schlüssel `stundenplan-store-v1`, kein
  Backend/Account.
- Beim ersten Laden ohne vorhandenen Store wird das ältere Einzelplan-Format (Schlüssel
  `stundenplan-data-v1`, aus der Zeit vor Multi-Plan-Unterstützung) automatisch in einen
  einzelnen Plan migriert, damit ein App-Update keine bestehenden Daten verliert.
- Ein kaputter/unlesbarer Legacy-Wert wird ignoriert (Fallback auf einen frischen leeren
  Plan) statt die App abstürzen zu lassen.
- Pläne, die vor Einführung der Tagesspalten-Anpassbarkeit gespeichert wurden (kein `days`
  -Feld), werden beim Laden automatisch mit den Standard-Wochentagen aufgefüllt.

### 10. Tastatur-Bedienung

- Beide Modals (Termin, Zeitraster) sind echte `<form>`-Elemente.
- Enter in einem einzeiligen Feld (Titel, Link, Start-/Endzeit, Raster-Eingaben) sendet das
  Formular ab (speichert / wendet das Raster an).
- Enter im mehrzeiligen "Beschreibung"-Feld fügt wie gewohnt einen Zeilenumbruch ein (kein
  Submit) — normales HTML-Formularverhalten, keine Sonderbehandlung nötig.
- Escape schließt das jeweils offene Modal, verwirft ungespeicherte Änderungen.
- Tab-Reihenfolge folgt der natürlichen DOM-Reihenfolge der Felder.

### 11. Jetzt-Hervorhebung

- Die Zeile, deren Zeitlabel die aktuelle Uhrzeit umschließt (`HH:MM–HH:MM`-Format
  vorausgesetzt), wird in der Zeit-Spalte optisch hervorgehoben.
- Die Spalte, deren Name dem heutigen Wochentag entspricht (Vergleich gegen die
  Standard-Wochentagsnamen der aktuellen UI-Sprache — funktioniert also nur, solange die
  entsprechende Spalte nicht umbenannt/entfernt wurde), wird im Spaltenkopf hervorgehoben.
- Liegt an der Kreuzung aus aktueller Zeile und heutiger Spalte ein Termin (auch ein
  mehrzeiliger, dessen Anker weiter oben liegt), wird genau diese Zelle zusätzlich
  hervorgehoben.
- Aktualisiert sich automatisch alle 30 Sekunden sowie nach jeder Neu-Darstellung der
  Tabelle (z. B. nach dem Speichern eines Termins).

### 12. Mehrsprachigkeit (Deutsch/Englisch)

- Vollständige UI-Übersetzung ins Englische, umschaltbar über einen Sprachwähler im Header
  (zeigt "Deutsch"/"English" — Sprachnamen bleiben bewusst in ihrer eigenen Sprache,
  unabhängig von der aktuell gewählten UI-Sprache).
- **Automatische Erkennung beim ersten Laden:** Standardsprache wird aus
  `navigator.language` abgeleitet — nur ein explizit deutscher Wert (`de`, `de-DE`, `de-AT`,
  …) wählt Deutsch, alles andere (inkl. keinem Wert) English. Hintergrund: deutschsprachige
  Nutzer verwenden häufig ein englischsprachiges Browser-/Betriebssystem-UI, daher lieber
  konservativ auf Englisch defaulten als anzunehmen, jeder Deutsch-Text-Leser habe eine
  deutsche Systemsprache.
- Die gewählte Sprache wird pro Browser (nicht pro Plan) in `localStorage` gespeichert und
  bleibt über Reloads erhalten; jeder Plan kann trotzdem einen eigenen Titel in beliebiger
  Sprache/Formulierung haben.
- Übersetzt werden: alle Button-/Label-/Platzhalter-Texte, Modal-Titel, Confirm-/Alert-
  Dialoge, Fehlermeldungen, sowie die *Standardwerte* für neue Pläne/Spalten (Plannamen,
  Tagesnamen). **Nicht** automatisch übersetzt werden vom Nutzer selbst eingegebene Inhalte
  (Termin-Titel, Beschreibungen, umbenannte Spalten-/Plannamen) — das sind freie
  Texteingaben, keine UI-Strings.
- **Bestehende Tagesspalten beim Sprachwechsel:** Ein Spaltenname, der noch exakt dem
  Standard-Wochentagsnamen der *bisherigen* Sprache an seiner Position entspricht (der Nutzer
  hat ihn also nie umbenannt), wird beim Umschalten auf den Standardnamen der *neuen* Sprache
  an derselben Position aktualisiert — z. B. wird aus "Montag" beim Wechsel zu Englisch
  automatisch "Monday". Eine manuell umbenannte Spalte (z. B. "Lerntag" statt "Montag") gilt
  nicht mehr als "Standard" und bleibt unverändert, da es dann freier Text ist, kein
  UI-String mehr. Das gilt plan-übergreifend (alle gespeicherten Pläne, nicht nur der aktive)
  und für Spalten jenseits der ersten 7 (z. B. eine hinzugefügte 8. Spalte), die ohnehin nie
  einem Wochentags-Default entsprechen und daher unangetastet bleiben. Einträge und manuell
  gesetzte Spaltenbreiten (Punkt 18) an einer übersetzten Spalte werden mit umgehängt
  (`translateDefaultDayNames` in `logic.js`, nutzt intern dieselbe Umhäng-Logik wie eine
  manuelle Umbenennung). Eine Übersetzung, die zu einem Namenskonflikt mit einer anderen
  Spalte führen würde, wird übersprungen (die Spalte behält ihren alten Namen), um die
  Eindeutigkeits-Invariante der Spaltennamen nicht zu verletzen.
- Architektur: ein zentrales Wörterbuch (`i18n.js`, `{ de: {...}, en: {...} }`) plus ein
  `translate(language, key, params)`-Helfer mit `{param}`-Interpolation. Kein
  i18n-Framework, keine zusätzliche Laufzeit-Abhängigkeit. Details zur Konvention (wie neue
  Strings ergänzt werden) stehen in CONTRIBUTING.md.
- Native Formularelemente wie `<input type="time">` folgen dabei weiterhin der
  Locale-Einstellung des jeweiligen Browsers/Betriebssystems (z. B. 12h-AM/PM- vs.
  24h-Anzeige) — das ist Browser-/OS-Verhalten, nicht von der Seite aus steuerbar, und
  bewusst nicht nachgebaut (kein eigener Zeit-Picker, um keine unnötige Komplexität
  einzuführen).

### 13. CI / Tests

- Unit-Tests über Node's eingebauten Test-Runner (`node --test`, aufgerufen als
  `npm test`), keine externe Test-Abhängigkeit für die App selbst.
- Ein Testfile pro Logik-Modul (`logic.test.js`, `io.test.js`, `store.test.js`,
  `i18n.test.js`).
- `store.test.js` verwendet ein kleines In-Memory-Fake für `localStorage`
  (dependency-injected über `loadStore(storage, defaultLanguage)` /
  `saveStore(store, storage)`), braucht also keinen Browser/DOM.
- GitHub-Actions-Workflow `ci.yml` läuft bei jedem Push auf `main` und bei jedem Pull
  Request.

### 14. Deployment & Screenshots

- GitHub-Actions-Workflow `deploy-pages.yml` deployt die statische Seite (Repo-Root
  unverändert, kein Build) auf GitHub Pages bei jedem Push auf `main`.
- Live-URL: https://fionapreroll.github.io/vibe-stundenplan/
- GitHub-Actions-Workflow `screenshots.yml` generiert bei jedem Push auf `main`
  (`paths-ignore: screenshots/**`, um Endlosschleifen zu vermeiden) automatisch neue
  README-Screenshots (`scripts/screenshots.js`, treibt die App per Playwright mit
  Beispielinhalten und fotografiert Hauptansicht + beide Modals) und committet sie mit
  `[skip ci]` zurück, falls sie sich geändert haben.
- Das ist die einzige Stelle im Projekt mit einer echten npm-Laufzeitabhängigkeit
  (Playwright, devDependency) — betrifft nur dieses Tooling, nie den App-Code selbst
  (siehe "Technische Rahmenbedingungen" oben).

### 15. Druckansicht

- "🖨 Drucken"-Button ruft `window.print()` auf; ein `@media print`-Stylesheet reduziert
  die Ansicht auf Plantitel + Tabelle.
- Ausgeblendet werden: Plan-Switcher, Sprachwahl, alle Aktions-Buttons, Bearbeitungssymbole
  (Zeilen/Spalten entfernen, Spalte hinzufügen, leere-Zelle-"+"), Modals. Der Titel verliert
  seine editierbar-wirkende Umrandung (kein `contenteditable`-Styling im Druck, auch wenn
  das Attribut technisch aktiv bleibt).
- Die Regenbogenfarben der Kopfzeile und gefüllter Zellen werden per
  `print-color-adjust: exact` erzwungen, da sie ein inhaltliches Merkmal sind (Farbcodierung
  der Wochentage), nicht nur Dekoration, die ein sparsamer Browser-Druck sonst wegließe.
- Die Zeitspalte wird im Druck breiter dargestellt als am Bildschirm (dort schmal gehalten,
  um Platz für Tablet-Breiten zu sparen), damit volle Zeit-Labels nicht abgeschnitten
  werden; Platzhaltertext ("z. B. …") in noch nicht befüllten Zeit-Feldern wird im Druck
  unsichtbar (`::placeholder { color: transparent }`), damit leere Zeilen nicht wie
  Formularfelder aussehen.
- `@page { size: landscape }` als Hinweis an den Browser — Weekly-Tabellen sind breiter als
  hoch, auch wenn nicht jeder Browser/jedes Betriebssystem das automatisch übernimmt (dann
  wählt die Nutzerin Querformat manuell im Druckdialog).
- Bewusst **nicht** umgesetzt: automatisches Ausblenden komplett leerer Zeilen im Druck
  (Papier sparen) — die Druckansicht zeigt exakt das, was auch am Bildschirm zu sehen ist,
  minus Bedienelemente, ohne zusätzliche Content-Filterung.

### 16. Bearbeitungssymbole abschaltbar

- Checkbox im Header ("Bearbeitungssymbole anzeigen"/"Show edit icons") blendet die
  Zeilen-/Spalten-Entfernen-×, den Spalte-hinzufügen-"+" und das "+" in leeren Zellen aus.
- Reine Anzeige-Einstellung: Die zugrunde liegende Interaktion (Zelle anklicken, Drag-Auswahl,
  Umbenennen per Klick) bleibt vollständig funktionsfähig, auch wenn die Symbole ausgeblendet
  sind — kein "Edit-Lock", nur Aufräumen der Optik (z. B. für ruhigere Ansicht/Präsentation).
- Persistiert pro Browser (wie die Sprache), nicht pro Plan — `store.showEditIcons`
  (`getShowEditIcons`/`setShowEditIcons` in `store.js`), Default `true`.
- Unabhängig davon blendet die Druckansicht (Punkt 15) dieselben Symbole *immer* aus,
  unabhängig vom aktuellen Toggle-Zustand — Druck soll nie interaktive UI zeigen.

### 17. Responsives Layout & Mobile

- Die Tabelle nutzt `table-layout: fixed` statt `auto`: Bei automatischem Layout bestimmen
  Formularelemente (das Zeit-`<input>`) ihre natürliche/intrinsische Breite und ignorieren
  dabei kleine `min-width`-Vorgaben weitgehend — das trieb die Zeitspalte auf über 220px
  Breite hoch, obwohl nur ~90px vorgesehen waren. Mit `table-layout: fixed` bestimmt die
  deklarierte Breite der Zeitspalte direkt die Spaltenbreite; Tagesspalten ohne eigene
  `width`-Angabe teilen sich den verbleibenden Platz automatisch gleichmäßig — bei
  beliebiger Spaltenzahl, nicht nur den ursprünglichen 7.
- Ergebnis: Die initiale 7-Tage-Ansicht braucht auf Tablet-Breite (≥ 768px) und größer kein
  horizontales Scrollen mehr (vorher: hartes `min-width: 920px` auf der Tabelle, erzwang
  Scrollen schon ab knapp 950px Fensterbreite). Das umfasst auch alle gängigen
  Smartphone-Querformat-Breiten (getestet 667–926px) — deckt damit einen praktisch
  relevanten Teil des "Mobile Landscape"-Falls ab.
- Ein `min-width: 600px` auf der Tabelle bleibt als Untergrenze: darunter (z. B.
  Smartphone-Hochformat, ~375–430px) scrollt `.table-wrap` horizontal statt Spalten
  weiter zusammenzudrücken — 7+ Spalten lassen sich auf Hochformat-Handybreite nicht
  verlustfrei ohne Scrollen darstellen ("sofern möglich" heißt hier: möglich ab Tablet
  aufwärts, nicht bei jeder Bildschirmgröße).
- Tages-Spaltennamen dürfen umbrechen (`white-space: normal; overflow-wrap: anywhere`)
  statt eine einzelne Zeile zu erzwingen — wichtig, weil Spaltennamen jetzt frei umbenennbar
  sind (Punkt 1a) und beliebig lang sein können.
- Modals haben `max-height: 90vh` mit `overflow-y: auto`: Auf kurzen Viewports (z. B.
  Smartphone im Querformat, ~375–400px Höhe) würde ein nicht begrenztes Modal über den
  sichtbaren Bereich hinausragen und Buttons (Speichern, Abbrechen) unerreichbar machen.
  Mit der Begrenzung wird das Modal stattdessen intern scrollbar; alle Felder und Buttons
  bleiben erreichbar.
- Bewusst **nicht** umgesetzt: eine responsive Anpassung der festen Zeilenhöhe (70px,
  siehe Punkt 5 — `ROW_HEIGHT_PX` in `app.js`). Eine kleinere mobile Zeilenhöhe würde mit
  der Pixel-Berechnung für Sub-Raster-Einrückung kollidieren, sofern `ROW_HEIGHT_PX` nicht
  ebenfalls dynamisch aus dem tatsächlich gerenderten Wert gelesen würde — als bewusst
  einfach gehaltene Abwägung vorerst nicht angegangen.

### 18. Manuell verstellbare Spaltenbreiten

- **Anlass:** `table-layout: fixed` (Punkt 17) sorgt zwar für ein Layout ohne Scrollen, aber
  die feste ~92px-Zeitspalte reicht nicht für jedes Raster — lange Zeitlabels wie
  "16:40–18:10" wurden im Zeit-`<input>` hart abgeschnitten (Inputs umbrechen ihren Text nie,
  unabhängig von CSS).
- **Lösung:** Jede Spalte (Zeit- und Tagesspalten) bekommt am rechten Rand ihres `<th>` einen
  schmalen Ziehgriff (`.col-resize-handle`, `position: absolute` am Spaltenrand). Ziehen setzt
  per Maus-Drag eine explizite `width` auf das `<th>` — unter `table-layout: fixed` bestimmt
  das die Spaltenbreite der ganzen Spalte (Kopf- und Datenzellen). Eine Mindestbreite
  (`MIN_COL_WIDTH = 60px` in `app.js`) verhindert, dass eine Spalte auf 0 kollabiert.
  Nicht manuell verstellte Tagesspalten teilen sich weiterhin automatisch den verbleibenden
  Platz gleichmäßig (unverändertes Verhalten aus Punkt 17).
- **Persistenz:** Die Zeitspaltenbreite liegt als `plan.timeColWidth` (Zahl oder `null` für
  Default), Tagesspaltenbreiten als `plan.columnWidths[dayName]` (Objekt, nur für explizit
  verstellte Spalten). Beim Umbenennen einer Tagesspalte wird der Breiten-Eintrag mit
  umgehängt (`renameDayWidth` in `logic.js`, analog zu `renameDayEntries`), beim Entfernen
  gelöscht (`removeDayWidth`) — sonst würden verwaiste Einträge unter dem alten Namen
  liegen bleiben.
- **Sichtbarkeit:** Die Ziehgriffe sind Bearbeitungs-UI wie die Lösch-/Hinzufügen-Icons und
  folgen deren Sichtbarkeits-Toggle (Punkt 16) sowie der Druckansicht (Punkt 15) — im Druck
  wird die Zeitspalte ohnehin auf eine feste, garantiert ausreichende Breite gezwungen
  (`!important`, überschreibt eine manuelle Bildschirm-Breite absichtlich).
- **Fallback "zur Not umbrechen":** Das Zeitlabel selbst wurde von einem `<input type="text">`
  auf ein `contenteditable`-Span umgestellt (wie die Tagesnamen, Punkt 1a) — Inputs können
  grundsätzlich nicht umbrechen, ein `<span>` schon. Damit greift eine zweite Absicherung
  unabhängig vom manuellen Resize: Ist eine Spalte trotzdem zu schmal, bricht das Label
  normal um (bevorzugt am Halbgeviertstrich "–" zwischen den Uhrzeiten, da Unicode-
  Zeilenumbruchregeln dort ohnehin eine Umbruchstelle vorsehen; `overflow-wrap: anywhere`
  als zusätzliches Sicherheitsnetz für den Fall, dass selbst das nicht reicht) statt
  abgeschnitten zu werden.

## Bewusste Nicht-Ziele (damit sie in einem Rewrite nicht versehentlich neu diskutiert werden)

- Kein Build-Tooling (Webpack/Vite/Bundler) für die App — bewusst bei reinen, direkt
  servierbaren ES-Modulen belassen; siehe CONTRIBUTING.md für die Bedingungen, unter denen
  sich das ändern sollte.
- Kein CSS-Framework — kleines handgeschriebenes Stylesheet.
- Kein pixelgenaues Kalender-Layout (freie Positionierung wie Google Calendar) — bewusst
  zugunsten von Zeilenraster + Sub-Raster-Zeit-Badge (Punkt 5) verworfen, um Datenmodell und
  Kollisionsbehandlung einfach zu halten.
- Kein Backend/Sync — nur Single-Browser-`localStorage`; Export/Import-JSON ist der einzige
  Weg, einen Plan zwischen Browsern/Geräten zu bewegen.
- Keine Authentifizierung/Accounts.
- Keine weiteren Sprachen über Deutsch/Englisch hinaus (aktuell) — die `i18n.js`-Struktur
  wäre dafür erweiterbar, aber es gibt noch keine dritte Zielsprache.
- Kein eigener Zeit-Picker für `<input type="time">` — Browser-native 12h/24h-Darstellung
  wird akzeptiert statt nachgebaut (siehe Punkt 12).
- Keine responsive Anpassung der festen 70px-Zeilenhöhe — würde die Pixel-Berechnung der
  Sub-Raster-Einrückung verkomplizieren (siehe Punkt 17).
- Kein automatisches Ausblenden leerer Zeilen in der Druckansicht — Druck zeigt exakt den
  Bildschirminhalt minus Bedienelemente, keine zusätzliche Content-Filterung (siehe Punkt 15).
