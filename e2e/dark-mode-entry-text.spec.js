// Regression guard for the dark-mode entry text that previously inherited a
// light-theme foreground: the default demo's description became nearly black
// on its dark tinted entry background. This needs a real browser because
// node --test cannot resolve CSS variables or computed styles.
import { test, expect } from "@playwright/test";

test("entry title and description use the dark-theme foreground color", async ({ page }) => {
  await page.goto("/index.html");
  await page.waitForSelector(".entry-description");

  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });

  const colors = await page.locator(".entry-title, .entry-description").evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).color)
  );

  // The demo contains several populated entries. Verify every title and
  // description instead of assuming there is only one pair of elements.
  expect(colors).not.toHaveLength(0);
  colors.forEach((color) => {
    expect(color).toBe("rgb(238, 238, 243)");
  });
});
