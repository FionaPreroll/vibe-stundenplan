// Generates the README screenshots from a live run of the app: a populated
// weekly plan, the entry modal, and the time-raster modal. Run locally with
// `npm run screenshots`, or automatically via
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

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  page.on("dialog", (d) => d.accept());

  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForSelector("#planTable");

  // Explicit, not relying on locale auto-detection: the README screenshots
  // are always English, regardless of what locale this runs under.
  await page.selectOption("#languageSwitcher", "en");

  await page.click("#planTitle");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Winter Semester 25/26");
  await page.keyboard.press("Enter");

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
  await page.click('td.data-cell[data-day="Saturday"][data-row="2"]');
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

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
