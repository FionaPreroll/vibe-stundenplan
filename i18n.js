// Minimal, dependency-free i18n: a string dictionary plus a couple of pure
// helpers. No framework — just enough to keep every user-facing string (and
// the day-name defaults) swappable between German and English.

export const LANGUAGES = ["de", "en"];
export const DEFAULT_LANGUAGE = "de";

export const DAYS_BY_LANGUAGE = {
  de: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

// Conventional abbreviations for the defaults above, same index order —
// German's are two letters (Mo/Di/...), English's three (Mon/Tue/...), each
// following that language's own everyday convention rather than a uniform
// character count. Only meaningful for a column that's still an untouched
// default (see shortDayLabel in app.js); a custom/renamed column has no
// language-correct abbreviation to fall back to.
export const DAYS_SHORT_BY_LANGUAGE = {
  de: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

// Sunday-first, matching Date#getDay()'s 0=Sunday indexing — used to detect
// "today" for the now-highlight, independent of a plan's actual day names.
export const WEEKDAYS_BY_LANGUAGE = {
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

// German-speaking users very often run an English-language browser/OS, so
// default to English unless the browser explicitly reports German.
export function detectDefaultLanguage(navigatorLanguage) {
  if (typeof navigatorLanguage === "string" && navigatorLanguage.toLowerCase().startsWith("de")) {
    return "de";
  }
  return "en";
}

const STRINGS = {
  de: {
    appTitleSuffix: "Stundenplan",
    renameHint: "Klicken zum Umbenennen",
    planSwitcherLabel: "Stundenplan wählen",
    newPlanTitle: "Neuen Stundenplan anlegen",
    deletePlanTitle: "Diesen Stundenplan löschen",
    themeSwitcherLabel: "Design",
    themeSystem: "System",
    themeLight: "Hell",
    themeDark: "Dunkel",
    lockEditingTitle: "Bearbeitung sperren",
    unlockEditingTitle: "Bearbeitung entsperren",
    aboutBtnTitle: "Über diese App",
    aboutModalTitle: "Über Vibe-Stundenplan",
    aboutModalDescription:
      "Eine kostenlose, werbefreie Stundenplan-App direkt im Browser — ohne Konto, ohne Server. Alle Pläne bleiben ausschließlich in diesem Browser gespeichert (localStorage); nichts wird hochgeladen.",
    aboutModalSourceLabel: "Quellcode",
    aboutModalSourceLinkText: "Auf GitHub ansehen",
    toolbarGroupData: "Daten",
    toolbarGroupGrid: "Raster",
    toolbarGroupView: "Ansicht",
    exportBtn: "Exportieren",
    exportAllBtn: "Alle exportieren",
    importBtn: "Importieren",
    timePresetBtn: "Zeiten festlegen",
    addRowBtn: "+ Zeile hinzufügen",
    resetBtn: "Zurücksetzen",
    printBtn: "🖨 Drucken",
    jumpToNowBtn: "📍 Jetzt",
    hintText:
      "Tipp: Zelle anklicken für einen Termin, oder über mehrere Zeitfenster ziehen für einen längeren Termin (auf Touch-Geräten erst gedrückt halten).",
    timeColHeader: "Zeit",
    timeInputPlaceholder: "z. B. 08:00–08:45",
    addDayColTitle: "Spalte hinzufügen",
    removeDayColTitle: "Spalte entfernen",
    removeRowTitle: "Zeile entfernen",
    copyEntryTitle: "Termin kopieren",

    entryEditTitle: "Termin bearbeiten",
    entryAddTitle: "Termin hinzufügen",
    fieldTitleLabel: "Titel",
    fieldTitlePlaceholder: "z. B. Mathe lernen",
    fieldStartLabel: "Start (optional)",
    fieldEndLabel: "Ende (optional)",
    fieldDescriptionLabel: "Beschreibung",
    fieldDescriptionPlaceholder: "Details zur Aufgabe...",
    fieldLinkLabel: "Link",
    applyAllDaysLabel: "Auf alle Tage anwenden",
    fieldColorLabel: "Farbe",
    colorNoneTitle: "Keine Farbe",
    deleteEntryBtn: "Löschen",
    cancelBtn: "Abbrechen",
    saveBtn: "Speichern",
    linkText: "🔗 Link",
    timeHintUnparseable:
      "Hinweis: Diese Zeile hat kein gültiges HH:MM–HH:MM-Zeitlabel, daher wird der Termin nicht eingerückt dargestellt.",
    rowLabelFallback: "Zeile {n}",
    rowRangeLabelFallback: "Zeile {a}–{b}",
    undoToast: "Rückgängig gemacht",
    copyToast: "Termin kopiert",
    pasteToast: "Eingefügt",
    dragOverwriteToastOne: '"{title}" wurde ersetzt',
    dragOverwriteToastMany: "{count} Termine wurden ersetzt",

    timeModalTitle: "Zeitraster festlegen",
    timeModalHint:
      "Vorlage wählen oder eigenes Raster erstellen. Einträge bleiben erhalten, es werden nur die Zeit-Labels gesetzt.",
    presetTuDresden: "TU Dresden (Doppelstunden)",
    presetRwthAachen: "RWTH Aachen (Blockraster)",
    customRasterLabel: "Eigenes Raster",
    rasterIntervalLabel: "Intervall (Min.)",
    rasterFromLabel: "Von",
    rasterToLabel: "Bis",
    applyRasterBtn: "Raster anwenden",
    closeBtn: "Schließen",

    confirmOverwriteTimes: "Bestehende Zeit-Labels werden überschrieben. Fortfahren?",
    confirmRemoveRowWithEntries: "Diese Zeile enthält Termine. Beim Entfernen gehen sie verloren. Fortfahren?",
    confirmResetPlan: "Wirklich diesen Stundenplan zurücksetzen? Das kann nicht rückgängig gemacht werden.",
    confirmRemoveDayWithEntries: 'Spalte "{day}" enthält Termine. Beim Entfernen gehen sie verloren. Fortfahren?',
    confirmDeletePlan: 'Stundenplan "{name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.',
    alertDayNameTaken: 'Eine Spalte namens "{name}" gibt es schon.',
    alertRasterNeedsTimes: "Bitte Start- und Endzeit angeben.",
    alertImportFailed: "Import fehlgeschlagen.",

    errorIntervalPositive: "Das Intervall muss größer als 0 sein.",
    errorEndAfterStart: "Das Ende muss nach dem Start liegen.",
    errorLastPlanCannotBeDeleted: "Der letzte Stundenplan kann nicht gelöscht werden.",
    errorInvalidJson: "Ungültiges JSON: Die Datei konnte nicht gelesen werden.",
    errorMissingPlanField: 'Ungültiges Format: Feld "plan" fehlt.',
    errorMissingPlansField: 'Ungültiges Format: Feld "plans" fehlt oder ist leer.',

    defaultPlanName: "Mein Stundenplan",
    newPlanName: "Neuer Plan",
    newDayName: "Tag",
    importedPlanName: "Importierter Plan",

    demoEntry1Title: "👋 Willkommen!",
    demoEntry1Description: "Das ist ein Beispiel. 🔒 oben anklicken zum Bearbeiten oder um einen neuen, leeren Plan zu starten.",
    demoEntry2Title: "Sport",
    demoEntry3Title: "Projektarbeit",
    demoEntry3Description: "Gruppenarbeit im Labor",
  },
  en: {
    appTitleSuffix: "Schedule",
    renameHint: "Click to rename",
    planSwitcherLabel: "Select schedule",
    newPlanTitle: "Create new schedule",
    deletePlanTitle: "Delete this schedule",
    themeSwitcherLabel: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    lockEditingTitle: "Lock editing",
    unlockEditingTitle: "Unlock editing",
    aboutBtnTitle: "About this app",
    aboutModalTitle: "About Vibe-Stundenplan",
    aboutModalDescription:
      "A free, ad-free weekly schedule app that runs entirely in your browser — no account, no server. Every schedule stays in this browser only (localStorage); nothing is ever uploaded.",
    aboutModalSourceLabel: "Source code",
    aboutModalSourceLinkText: "View on GitHub",
    toolbarGroupData: "Data",
    toolbarGroupGrid: "Grid",
    toolbarGroupView: "View",
    exportBtn: "Export",
    exportAllBtn: "Export all",
    importBtn: "Import",
    timePresetBtn: "Set time grid",
    addRowBtn: "+ Add row",
    resetBtn: "Reset",
    printBtn: "🖨 Print",
    jumpToNowBtn: "📍 Now",
    hintText:
      "Tip: click a cell to add an entry, or drag across several time slots for a longer one (press and hold first on touch).",
    timeColHeader: "Time",
    timeInputPlaceholder: "e.g. 08:00–08:45",
    addDayColTitle: "Add column",
    removeDayColTitle: "Remove column",
    removeRowTitle: "Remove row",
    copyEntryTitle: "Copy entry",

    entryEditTitle: "Edit entry",
    entryAddTitle: "Add entry",
    fieldTitleLabel: "Title",
    fieldTitlePlaceholder: "e.g. Study math",
    fieldStartLabel: "Start (optional)",
    fieldEndLabel: "End (optional)",
    fieldDescriptionLabel: "Description",
    fieldDescriptionPlaceholder: "Details about the task...",
    fieldLinkLabel: "Link",
    applyAllDaysLabel: "Apply to all days",
    fieldColorLabel: "Color",
    colorNoneTitle: "No color",
    deleteEntryBtn: "Delete",
    cancelBtn: "Cancel",
    saveBtn: "Save",
    linkText: "🔗 Link",
    timeHintUnparseable:
      "Note: this row doesn't have a valid HH:MM–HH:MM time label, so the entry won't be shown indented.",
    rowLabelFallback: "Row {n}",
    rowRangeLabelFallback: "Row {a}–{b}",
    undoToast: "Undone",
    copyToast: "Entry copied",
    pasteToast: "Pasted",
    dragOverwriteToastOne: '"{title}" replaced',
    dragOverwriteToastMany: "{count} entries replaced",

    timeModalTitle: "Set time grid",
    timeModalHint: "Pick a preset or build your own grid. Entries are kept — only the time labels are set.",
    presetTuDresden: "TU Dresden (double periods)",
    presetRwthAachen: "RWTH Aachen (block schedule)",
    customRasterLabel: "Custom grid",
    rasterIntervalLabel: "Interval (min.)",
    rasterFromLabel: "From",
    rasterToLabel: "To",
    applyRasterBtn: "Apply grid",
    closeBtn: "Close",

    confirmOverwriteTimes: "Existing time labels will be overwritten. Continue?",
    confirmRemoveRowWithEntries: "This row has entries. Removing it will delete them. Continue?",
    confirmResetPlan: "Really reset this schedule? This cannot be undone.",
    confirmRemoveDayWithEntries: 'Column "{day}" has entries. Removing it will delete them. Continue?',
    confirmDeletePlan: 'Really delete schedule "{name}"? This cannot be undone.',
    alertDayNameTaken: 'A column named "{name}" already exists.',
    alertRasterNeedsTimes: "Please provide a start and end time.",
    alertImportFailed: "Import failed.",

    errorIntervalPositive: "The interval must be greater than 0.",
    errorEndAfterStart: "The end must be after the start.",
    errorLastPlanCannotBeDeleted: "The last schedule can't be deleted.",
    errorInvalidJson: "Invalid JSON: the file couldn't be read.",
    errorMissingPlanField: 'Invalid format: the "plan" field is missing.',
    errorMissingPlansField: 'Invalid format: the "plans" field is missing or empty.',

    defaultPlanName: "My Schedule",
    newPlanName: "New Schedule",
    newDayName: "Day",
    importedPlanName: "Imported Schedule",

    demoEntry1Title: "👋 Welcome!",
    demoEntry1Description: "This is a demo. Tap 🔒 above to edit it or start a new, empty schedule.",
    demoEntry2Title: "Gym",
    demoEntry3Title: "Project work",
    demoEntry3Description: "Group work in the lab",
  },
};

export function translate(language, key, params) {
  const dict = STRINGS[language] || STRINGS[DEFAULT_LANGUAGE];
  let text = dict[key] ?? STRINGS[DEFAULT_LANGUAGE][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}
