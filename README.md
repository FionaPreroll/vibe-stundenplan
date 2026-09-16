# Vibe-Stundenplan

Eine Single-Page-App für die persönliche Alltagsplanung: ein Stundenplan-Wochenraster zum
Eintragen von Terminen, Aufgaben und Blöcken — direkt im Browser, ohne Build-Schritt, ohne
Backend. Deutsch und Englisch werden vollständig unterstützt.

**Live:** https://fionapreroll.github.io/vibe-stundenplan/

![Stundenplan mit Beispielinhalten](screenshots/app.png)

## Features

- Wochenraster mit frei benennbaren, hinzufügbaren und entfernbaren Tages-Spalten,
  farbcodiert im Regenbogen-Schema
- Zeitraster per Vorlage (TU Dresden, RWTH Aachen) oder frei konfigurierbar — Intervall in
  Minuten (auch Sub-Stunden-Takte), beliebige Start-/Endzeit
- Termine per Klick oder Drag-Auswahl über mehrere Zeitfenster anlegen, inkl. optionaler
  Start-/Endzeit unabhängig vom Raster (visuell innerhalb der Zelle eingerückt)
- Live-Hervorhebung des aktuellen Zeitfensters und Wochentags
- Mehrere Stundenpläne parallel verwalten und wechseln
- Export/Import als lesbares JSON — Format spezifiziert in
  [EXPORT_FORMAT.md](EXPORT_FORMAT.md)
- Deutsch/Englisch umschaltbar, inkl. automatischer Erkennung der Browsersprache
- Vollständig tastaturbedienbar (Enter speichert, Escape verwirft)

Details, Architektur und bewusste Scope-Entscheidungen: siehe
[REQUIREMENTS.md](REQUIREMENTS.md). Hinweise für Beiträge/Weiterentwicklung: siehe
[CONTRIBUTING.md](CONTRIBUTING.md).

### Termin anlegen

![Termin-Modal](screenshots/entry-modal.png)

### Zeitraster festlegen

![Zeitraster-Modal](screenshots/time-modal.png)

## Lokal starten

Kein Build nötig — einfach über einen lokalen Server servieren, z. B.:

```
python3 -m http.server 8000
```

und `http://localhost:8000` öffnen.

## Tests

```
npm test
```

Läuft mit Node's eingebautem Test-Runner, keine externen Abhängigkeiten nötig.

## Screenshots aktualisieren

Die Screenshots oben werden automatisch per GitHub Actions
(`.github/workflows/screenshots.yml`) bei jedem Push auf `main` neu generiert und
zurückcommittet. Das ist die einzige Stelle im Projekt, die eine echte devDependency
(Playwright, nur für dieses Skript) braucht — die App selbst bleibt abhängigkeitsfrei.

Manuell:

```
npm install
npx playwright install --with-deps chromium
npm run screenshots
```
