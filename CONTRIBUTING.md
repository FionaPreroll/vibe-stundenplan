# Contributing / Architecture Notes

Kurzer Leitfaden für Weiterentwicklung — ergänzt [REQUIREMENTS.md](REQUIREMENTS.md) (was die
App tut) um das *wie* (wo Code hingehört, was getestet wird, was bewusste Entscheidungen statt
Zufall sind).

## Modul-Karte

| Datei | Verantwortung | Testbar? |
|---|---|---|
| `logic.js` | Reine Stundenplan-Logik: Zeitraster, mehrzeilige Termine, Zeilen/Spalten-Operationen. Kein DOM, kein `localStorage`, kein `window`. | Ja — `logic.test.js` |
| `io.js` | Export/Import-Serialisierung eines Plans (JSON). Reine Funktionen, nimmt Sprache als Parameter statt sie selbst zu bestimmen. | Ja — `io.test.js` |
| `store.js` | Persistenz mehrerer Pläne + Sprachwahl. `localStorage`-Zugriff ist über einen `storage`-Parameter injizierbar (Tests nutzen ein In-Memory-Fake). | Ja — `store.test.js` |
| `i18n.js` | String-Wörterbuch (DE/EN) + kleine reine Helper (`translate`, `detectDefaultLanguage`). Kein Framework. | Ja — `i18n.test.js` |
| `app.js` | DOM-Controller: Rendering, Event-Wiring, verbindet die obigen Module mit der Seite. Einziges Modul, das `document`/`window` anfasst. | Nein, siehe unten |

**Faustregel beim Hinzufügen von Code:** Wenn eine Funktion ohne Browser-Globals auskommt
(kein `document`, `window`, `localStorage`, `alert`, `confirm`), gehört sie in `logic.js`,
`io.js`, `store.js` oder `i18n.js` — nicht in `app.js`. `app.js` sollte reine
Verdrahtung bleiben: Werte aus dem DOM lesen, eine reine Funktion aufrufen, Ergebnis ins DOM
schreiben.

## Test-Philosophie

- **Getestet:** alles in `logic.js` / `io.js` / `store.js` / `i18n.js` — mit Node's
  eingebautem Test-Runner (`npm test`, kein externes Test-Framework). Läuft in CI bei jedem
  Push/PR.
- **Nicht getestet (automatisiert):** `app.js`. Ein DOM-Controller mit Klick-Handlern,
  Drag-Logik und Modal-State ließe sich nur mit erheblichem Aufwand (jsdom oder ein
  Headless-Browser als Testabhängigkeit) sinnvoll unit-testen, für einen Nutzen, der bei
  diesem Projektumfang nicht im Verhältnis steht. Stattdessen: **vor jedem Commit, der
  `app.js`/`index.html` ändert, manuell mit Playwright durchklicken** (lokaler Server +
  Playwright, wie in der Session-Historie dieses Projekts durchgängig gemacht — Screenshot
  und/oder gezielte `page.$eval`-Checks der betroffenen Interaktion). Das ist bewusst
  Entwickler-Disziplin statt CI-Gate; wenn `app.js` einmal groß/riskant genug wird, dass sich
  das nicht mehr trägt, ist das ein Signal, dass Teile daraus in testbare Module wandern
  sollten (siehe nächster Abschnitt), nicht dass eine Browser-Testsuite eingeführt werden
  muss.

## Modularität: vanilla JS ist kein Dogma

Die App ist bewusst ohne Build-Schritt und ohne Framework gebaut — nicht aus Prinzip, sondern
weil der Umfang das bisher nicht rechtfertigt: sieben Module, überschaubare Zustandsform (ein
Store-Objekt), keine komplexen Abhängigkeiten zwischen UI-Komponenten. Ein Framework
(React/Vue/Svelte) oder ein Bundler würde hier mehr Konzept- und Tooling-Overhead einführen,
als er an Klarheit zurückgibt.

**Das ist aber keine Denkverbot, sondern eine Abwägung, die sich mit dem Projekt ändern
kann.** Konkrete Signale, die eine Änderung rechtfertigen würden:

- `app.js` wächst über die aktuelle Größe (Stand: ~700 Zeilen) deutlich hinaus und die
  Verantwortlichkeiten lassen sich nicht mehr an einem Blick erfassen.
- Zustandsänderungen brauchen mehrfach verschachteltes manuelles DOM-Diffing (aktuell: fast
  alles rendert einfach per `innerHTML = ""` + Neuaufbau — funktioniert, weil die Tabelle
  klein bleibt; würde bei z. B. hunderten Zeilen ineffizient).
- Zwei oder mehr Komponenten müssten Zustand synchron halten, ohne dass ein simples
  `render()`-nach-jeder-Änderung-Muster mehr ausreicht.

**Wenn `app.js` aufgeteilt wird, bevorzugt in diese Richtung** (nächster sinnvoller Schritt,
noch ohne Framework):

- `render.js` — Tabellen-/Modal-Rendering (DOM-Erzeugung), nimmt Plan-Daten + Callbacks
  entgegen, kennt keine Event-Wiring-Details.
- `selection.js` — Drag-Auswahl-Zustandsmaschine (`dragState`, `highlightSelection`, …).
- `columns.js` — Tagesspalten-Verwaltung (hinzufügen/entfernen/umbenennen), analog zur
  bestehenden Trennung von `logic.js`-Funktionen.
- `app.js` bleibt der dünne Rest: Event-Listener registrieren, die obigen Module verdrahten.

**Falls doch ein Framework/Bundler nötig wird:** kein Ausschlusskriterium, aber dann bitte
bewusst und klein — z. B. Preact statt React (deutlich kleiner), esbuild/Vite nur falls
TypeScript oder echtes Tree-Shaking gebraucht wird, nicht "weil man das halt so macht". Jede
neue Laufzeit-Abhängigkeit sollte einen Satz Begründung in einem Commit oder hier im Dokument
bekommen.

## Die eine bestehende Ausnahme: Playwright

`scripts/screenshots.js` (für die README-Screenshots, automatisiert über
`.github/workflows/screenshots.yml`) braucht Playwright als **devDependency**. Das ist die
einzige Laufzeit-Abhängigkeit im ganzen Projekt, und bewusst so gehalten:

- Sie betrifft nur Tooling/Doku, nie den ausgelieferten App-Code (`index.html`/`*.js` bleiben
  komplett abhängigkeitsfrei).
- `npm test` (die eigentliche CI-Gate) braucht sie nicht und installiert sie nicht.

Neue devDependencies für Tooling sind grundsätzlich okay, wenn sie denselben Maßstab
einhalten: nie im ausgelieferten App-Code, nie in `npm test` nötig.

## Mehrsprachigkeit (i18n)

- Jeder neue, für Nutzer sichtbare String (Button, Label, Platzhalter, Confirm-/Alert-Text,
  Fehlermeldung) bekommt einen Key in `i18n.js`, **in beiden Sprachen** (`de` und `en`) — kein
  String darf nur in einer Sprache existieren.
- Statischer Text in `index.html`: `data-i18n="key"` (setzt `textContent`),
  `data-i18n-placeholder="key"`, `data-i18n-title="key"`, `data-i18n-aria-label="key"`.
  `app.js`s `applyStaticTranslations()` wendet das bei jedem Sprachwechsel/Render an.
- Dynamischer Text in `app.js`: über den lokalen `t(key, params)`-Helper (bindet
  `translate()` an die aktuell gewählte Sprache), `{param}`-Platzhalter in den
  Wörterbuch-Strings für Interpolation (z. B. `t("confirmDeletePlan", { name: p.name })`).
- Fehler aus `logic.js`/`io.js`/`store.js`, die dem Nutzer angezeigt werden, werfen einen
  Error mit `.code` (über `codedError()` in `logic.js`) statt einem fertigen Satz — die
  Übersetzung passiert erst in `app.js` beim Anzeigen (`alert(err.code ? t(err.code) :
  err.message)`). So bleiben die Logik-Module sprachneutral und testbar, ohne dass Tests
  deutsche oder englische Fehlertexte pattern-matchen müssen.
- Tagesnamen-Defaults (`DAYS_BY_LANGUAGE`) und die Wochentag-Zuordnung für die
  Jetzt-Hervorhebung (`WEEKDAYS_BY_LANGUAGE`) sind sprachabhängig, aber **rein für neue
  Pläne/Spalten** — ein Sprachwechsel benennt nie automatisch die Tagesspalten eines
  bestehenden Plans um (das wäre stille Datenmanipulation). Nutzer können Spalten jederzeit
  manuell umbenennen.

## Checkliste für ein neues Feature

1. Reine Logik (Datenmodell-Operationen, Validierung) in `logic.js`/`io.js`/`store.js`,
   mit Unit-Tests.
2. Neue Strings in `i18n.js`, beide Sprachen.
3. DOM-Verdrahtung in `app.js` + ggf. Markup/`data-i18n`-Attribute in `index.html`.
4. Manueller Playwright-Durchlauf der betroffenen Interaktion (siehe Test-Philosophie oben).
5. `npm test` grün, dann committen. CI (`ci.yml`) und Deploy (`deploy-pages.yml`) laufen
   automatisch bei Push auf `main`.
