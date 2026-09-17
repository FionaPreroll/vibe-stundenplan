// Generates the README screenshots from a live run of the app: a populated
// weekly plan (a university timetable, light mode), a second plan in dark
// mode with editing locked, the entry modal, and the time-raster modal. Run
// locally with `npm run screenshots`, or automatically via
// .github/workflows/screenshots.yml on every push to main.
import { chromium } from "playwright";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = 4173;
const OUT_DIR = path.join(ROOT, "screenshots");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const filePath = path.join(ROOT, decodeURIComponent(urlPath));
    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// row/rowEnd select the cell(s) by click (single row) or drag-select
// (rowEnd > row, for a multi-row entry) — the latter is required whenever
// startTime/endTime extend past the single row's own time label, so the
// entry's actual span always matches the custom time range it claims to
// have (see the Project work example below).
async function addEntry(page, { day, row, rowEnd, title, description, link, startTime, endTime }) {
  const endRow = rowEnd ?? row;
  if (endRow === row) {
    await page.click(`td.data-cell[data-day="${day}"][data-row="${row}"]`);
  } else {
    const startBox = await page.locator(`td.data-cell[data-day="${day}"][data-row="${row}"]`).boundingBox();
    const endBox = await page.locator(`td.data-cell[data-day="${day}"][data-row="${endRow}"]`).boundingBox();
    await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2, { steps: 5 });
    await page.mouse.up();
  }
  await page.fill("#fieldTitle", title);
  if (description) await page.fill("#fieldDescription", description);
  if (link) await page.fill("#fieldLink", link);
  if (startTime) await page.fill("#fieldStartTime", startTime);
  if (endTime) await page.fill("#fieldEndTime", endTime);
  await page.click("#saveEntryBtn");
}

// Removes a day column by its current display name (must be an exact match
// of the full, non-abbreviated .day-name text).
async function removeDayColumn(page, dayName) {
  await page
    .locator("th.day-col")
    .filter({ has: page.locator(".day-name", { hasText: dayName }) })
    .locator(".col-remove-btn")
    .click();
}

// Removes the last (bottommost) row — used to trim the trailing empty rows
// a raster narrower than the initial row count leaves behind.
async function removeLastRow(page) {
  await page.locator("#planBody tr").last().locator(".row-remove-btn").click();
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  page.on("dialog", (d) => d.accept());

  // Freezes "now" (app.js's now-highlight, item 11) to a fixed Wednesday
  // 13:00 rather than whatever real time this happens to run at — both
  // example plans below have an entry sitting in that exact slot (the
  // university plan's Wednesday "Sports", 13:00-14:00; the German plan's
  // Wednesday "Mittagessen mit Oma", 12:00-14:00), so the highlighted
  // row/day-column/cell in the screenshots is always that entry instead of
  // shifting — or vanishing outside opening hours — depending on when CI
  // happens to regenerate them. Local-time Date constructor, so this lands
  // on Wednesday 13:00 regardless of the machine's own timezone.
  await page.clock.setFixedTime(new Date(2024, 0, 3, 13, 0, 0));

  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForSelector("#planTable");

  // A brand-new visitor's store starts locked with a demo plan
  // (REQUIREMENTS.md item 30) — unlock before building the example plans
  // below, same as a real first-time user would via the lock icon.
  await page.click("#editLockBtn");

  // Explicit, not relying on locale auto-detection: the README screenshots
  // are always English, regardless of what locale this runs under.
  await page.selectOption("#languageSwitcher", "en");

  await page.click("#planTitle");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Winter Semester 25/26");
  await page.keyboard.press("Enter");

  // A university timetable has no weekend classes — drop those two columns
  // rather than just leaving them empty.
  await removeDayColumn(page, "Saturday");
  await removeDayColumn(page, "Sunday");

  await page.click("#timePresetBtn");
  await page.fill("#rasterInterval", "60");
  await page.fill("#rasterStart", "08:00");
  await page.fill("#rasterEnd", "18:00");
  await page.click("#applyRasterBtn");

  // Hourly raster from 08:00, so row 0 = 08:00-09:00, row 1 = 09:00-10:00,
  // row 2 = 10:00-11:00, etc.
  await addEntry(page, { day: "Monday", row: 0, title: "Analysis II", description: "Lecture Hall 3, Prof. Weber" });
  await addEntry(page, { day: "Monday", row: 4, title: "Lunch break" });
  // Custom time 09:20-10:40 crosses row 1 (09:00-10:00) into row 2
  // (10:00-11:00), so the entry itself must be drag-selected across both
  // rows — a single-row entry with a custom time outside its own row
  // just looks broken (the bug this replaced).
  await addEntry(page, {
    day: "Tuesday",
    row: 1,
    rowEnd: 2,
    title: "Project work",
    description: "With Team North",
    link: "https://example.com/project",
    startTime: "09:20",
    endTime: "10:40",
  });
  await addEntry(page, { day: "Wednesday", row: 5, title: "Sports", description: "Running in the park" });
  await addEntry(page, { day: "Friday", row: 3, title: "Team meeting", description: "Weekly sync" });
  // A multi-row entry via drag-select, to show off merged cells too.
  await addEntry(page, {
    day: "Thursday",
    row: 0,
    rowEnd: 1,
    title: "Database internship",
    description: "Block session, Room 1.12",
  });

  await page.screenshot({ path: path.join(OUT_DIR, "app.png"), fullPage: true });

  // Entry modal, filled in but not yet saved. Row 2 = 10:00-11:00, so the
  // custom start/end time below is chosen to actually sit inside that hour
  // (a sub-raster range, not an unrelated time of day) — otherwise the
  // modal shows a start/end that has nothing to do with the row it's on.
  // Wednesday row 2 is otherwise unused by the entries above.
  await page.click('td.data-cell[data-day="Wednesday"][data-row="2"]');
  await page.fill("#fieldTitle", "Study group");
  await page.fill("#fieldDescription", "Library, Group Room 4");
  await page.fill("#fieldStartTime", "10:15");
  await page.fill("#fieldEndTime", "10:45");
  await page.locator("#modalOverlay .modal").screenshot({ path: path.join(OUT_DIR, "entry-modal.png") });
  await page.click("#cancelModalBtn");

  // Time-raster modal.
  await page.click("#timePresetBtn");
  await page.locator("#timeModalOverlay .modal").screenshot({ path: path.join(OUT_DIR, "time-modal.png") });
  await page.click("#cancelTimeModalBtn");

  // A second, German example plan — an everyday "life" schedule rather than
  // a university one, with the weekend filled in — used to show off dark
  // mode and the edit lock together. Switching language first so the new
  // plan gets German day-name defaults (Montag..Sonntag) to match.
  await page.selectOption("#languageSwitcher", "de");
  await page.click("#newPlanBtn");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Mein Alltag");
  await page.keyboard.press("Enter");

  // 2h raster from 08:00 to 22:00, so row 0 = 08:00-10:00, row 1 =
  // 10:00-12:00, ..., row 6 = 20:00-22:00 (7 rows).
  await page.click("#timePresetBtn");
  await page.fill("#rasterInterval", "120");
  await page.fill("#rasterStart", "08:00");
  await page.fill("#rasterEnd", "22:00");
  await page.click("#applyRasterBtn");

  await addEntry(page, { day: "Donnerstag", row: 0, title: "Yoga" });
  await addEntry(page, { day: "Montag", row: 1, title: "Sport", description: "Joggen im Park" });
  await addEntry(page, { day: "Mittwoch", row: 2, title: "Mittagessen mit Oma" });
  await addEntry(page, { day: "Sonntag", row: 2, title: "Familienessen" });
  await addEntry(page, { day: "Samstag", row: 3, title: "Fußball", description: "Turnier in der Halle" });
  await addEntry(page, { day: "Dienstag", row: 4, title: "Einkaufen" });
  await addEntry(page, { day: "Freitag", row: 5, title: "Kino", description: "Mit Freunden" });

  // The raster above only fills 7 of the 10 initial rows — trim the empty
  // trailing ones so the screenshot doesn't end in blank rows.
  await removeLastRow(page);
  await removeLastRow(page);
  await removeLastRow(page);

  await page.selectOption("#themeSwitcher", "dark");
  await page.click("#editLockBtn");
  // .entry-box has a 0.12s `background` transition (style.css) for the
  // ordinary hover/selection states — switching theme and locking in the
  // same tick as the screenshot caught that transition mid-flight, so
  // filled cells came out a washed-out gray instead of their settled dark
  // tint. Comfortably past 0.12s before capturing.
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, "app-dark-locked.png"), fullPage: true });

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
