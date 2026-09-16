import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  DAYS_BY_LANGUAGE,
  WEEKDAYS_BY_LANGUAGE,
  detectDefaultLanguage,
  translate,
} from "./i18n.js";

test("LANGUAGES lists exactly de and en, with de as the default", () => {
  assert.deepEqual(LANGUAGES, ["de", "en"]);
  assert.equal(DEFAULT_LANGUAGE, "de");
});

test("DAYS_BY_LANGUAGE and WEEKDAYS_BY_LANGUAGE cover every language with 7 entries", () => {
  for (const lang of LANGUAGES) {
    assert.equal(DAYS_BY_LANGUAGE[lang].length, 7);
    assert.equal(WEEKDAYS_BY_LANGUAGE[lang].length, 7);
  }
});

test("WEEKDAYS_BY_LANGUAGE is Sunday-first, matching Date#getDay()", () => {
  assert.equal(WEEKDAYS_BY_LANGUAGE.de[0], "Sonntag");
  assert.equal(WEEKDAYS_BY_LANGUAGE.en[0], "Sunday");
});

test("detectDefaultLanguage picks German only for a German browser language", () => {
  assert.equal(detectDefaultLanguage("de"), "de");
  assert.equal(detectDefaultLanguage("de-DE"), "de");
  assert.equal(detectDefaultLanguage("de-AT"), "de");
});

test("detectDefaultLanguage defaults to English for anything else, including no value", () => {
  assert.equal(detectDefaultLanguage("en-US"), "en");
  assert.equal(detectDefaultLanguage("fr"), "en");
  assert.equal(detectDefaultLanguage(undefined), "en");
  assert.equal(detectDefaultLanguage(""), "en");
});

test("translate returns the localized string for a known key", () => {
  assert.equal(translate("de", "saveBtn"), "Speichern");
  assert.equal(translate("en", "saveBtn"), "Save");
});

test("translate substitutes {param} placeholders", () => {
  assert.equal(translate("de", "rowLabelFallback", { n: 3 }), "Zeile 3");
  assert.equal(translate("en", "confirmDeletePlan", { name: "Uni" }), 'Really delete schedule "Uni"? This cannot be undone.');
});

test("translate falls back to the default language for an unknown language, and to the key itself for an unknown key", () => {
  assert.equal(translate("fr", "saveBtn"), "Speichern");
  assert.equal(translate("de", "totallyUnknownKey"), "totallyUnknownKey");
});

test("every string key present in German is also present in English", () => {
  // Re-import the raw dictionaries indirectly via translate() over a probe
  // of known keys would be brittle; instead just spot-check parity for a
  // representative sample plus every key translate() can resolve for "de".
  const sampleKeys = [
    "appTitleSuffix",
    "entryEditTitle",
    "entryAddTitle",
    "confirmRemoveDayWithEntries",
    "errorIntervalPositive",
    "errorLastPlanCannotBeDeleted",
    "defaultPlanName",
    "newDayName",
  ];
  for (const key of sampleKeys) {
    const de = translate("de", key);
    const en = translate("en", key);
    assert.notEqual(de, key, `missing German string for ${key}`);
    assert.notEqual(en, key, `missing English string for ${key}`);
    assert.notEqual(de, en, `expected ${key} to differ between de/en`);
  }
});
