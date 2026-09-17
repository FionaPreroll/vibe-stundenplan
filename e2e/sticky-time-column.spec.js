// Regression guard for the frozen time column (REQUIREMENTS.md item 25):
// below 600px the table scrolls horizontally, and both the header cell
// (.time-col) and every row's time cell (.time-cell) are meant to stay
// pinned to the left edge throughout — not just the header. That's exactly
// the kind of CSS/layout behavior node --test can't see (no real DOM/layout)
// and a one-off manual Playwright check has silently regressed on before
// (only .time-col was actually verified, not every .time-cell row) — hence
// a real, permanent, CI-run test instead of another throwaway script.
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 380, height: 700 } });

test("time column stays pinned to the left during horizontal scroll on narrow screens", async ({ page }) => {
  await page.goto("/index.html");
  await page.waitForSelector("#planTable");

  // Add day columns until the table needs to scroll horizontally at 380px
  // (the default 7 columns already exceed the table's 600px min-width, but
  // a couple more make the scroll distance comfortably large).
  for (let i = 0; i < 3; i++) {
    await page.click(".add-day-col .icon-btn");
  }

  const wrap = page.locator(".table-wrap");
  const wrapBox = await wrap.boundingBox();

  const timeColBoxBefore = await page.locator(".time-col").boundingBox();
  const timeCellBoxBefore = await page.locator(".time-cell").first().boundingBox();

  await wrap.evaluate((el) => (el.scrollLeft = el.scrollWidth));

  const timeColBox = await page.locator(".time-col").boundingBox();
  expect(Math.abs(timeColBox.x - wrapBox.x)).toBeLessThan(2);

  const timeCells = await page.locator(".time-cell").all();
  expect(timeCells.length).toBeGreaterThan(1);
  for (const [index, cell] of timeCells.entries()) {
    const box = await cell.boundingBox();
    expect(Math.abs(box.x - wrapBox.x), `row ${index}'s .time-cell should stay flush with the scroll container's left edge`).toBeLessThan(2);
    // Position alone isn't enough: on Firefox, a sticky .time-cell stayed
    // flush at its left edge but its WIDTH collapsed down to a sliver of
    // its content instead of keeping the column's actual width, clipping
    // the time label down to unreadable fragments. Same for the header,
    // as a sanity check that the column's width is consistent top to
    // bottom, not just each cell internally unchanged.
    expect(
      Math.abs(box.width - timeCellBoxBefore.width),
      `row ${index}'s .time-cell width should stay the same after scrolling, not collapse`
    ).toBeLessThan(2);
    expect(
      Math.abs(box.width - timeColBox.width),
      `row ${index}'s .time-cell width should match the header's width`
    ).toBeLessThan(2);
  }
  expect(Math.abs(timeColBox.width - timeColBoxBefore.width), "the header's own width shouldn't change after scrolling either").toBeLessThan(2);
});
