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

async function addEntry(page, { day, row, title, description, link, startTime, endTime }) {
  await page.click(`td.data-cell[data-day="${day}"][data-row="${row}"]`);
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  page.on("dialog", (d) => d.accept());

  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForSelector("#planTable");

  // Explicit, not relying on locale auto-detection: the README screenshots
  // are always German, regardless of what locale this runs under.
  await page.selectOption("#languageSwitcher", "de");

  await page.click("#planTitle");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Wintersemester 25/26");
  await page.keyboard.press("Enter");

  await page.click("#timePresetBtn");
  await page.fill("#rasterInterval", "60");
  await page.fill("#rasterStart", "08:00");
  await page.fill("#rasterEnd", "18:00");
  await page.click("#applyRasterBtn");

  await addEntry(page, { day: "Montag", row: 0, title: "Analysis II", description: "Hörsaal 3, Prof. Weber" });
  await addEntry(page, { day: "Montag", row: 4, title: "Mittagspause" });
  await addEntry(page, {
    day: "Dienstag",
    row: 1,
    title: "Projektarbeit",
    description: "Mit Team Nord",
    link: "https://example.com/projekt",
    startTime: "09:20",
    endTime: "10:40",
  });
  await addEntry(page, { day: "Mittwoch", row: 5, title: "Sport", description: "Laufen im Park" });
  await addEntry(page, { day: "Freitag", row: 3, title: "Teammeeting", description: "Wöchentliches Sync" });

  // A multi-row entry via drag-select, to show off merged cells too.
  const cellTop = await page.locator('td.data-cell[data-day="Donnerstag"][data-row="0"]').boundingBox();
  const cellBottom = await page.locator('td.data-cell[data-day="Donnerstag"][data-row="1"]').boundingBox();
  await page.mouse.move(cellTop.x + cellTop.width / 2, cellTop.y + cellTop.height / 2);
  await page.mouse.down();
  await page.mouse.move(cellBottom.x + cellBottom.width / 2, cellBottom.y + cellBottom.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.fill("#fieldTitle", "Praktikum Datenbanken");
  await page.fill("#fieldDescription", "Block, Raum 1.12");
  await page.click("#saveEntryBtn");

  await page.screenshot({ path: path.join(OUT_DIR, "app.png"), fullPage: true });

  // Entry modal, filled in but not yet saved.
  await page.click('td.data-cell[data-day="Samstag"][data-row="2"]');
  await page.fill("#fieldTitle", "Lerngruppe");
  await page.fill("#fieldDescription", "Bibliothek, Gruppenraum 4");
  await page.fill("#fieldStartTime", "14:15");
  await page.fill("#fieldEndTime", "16:00");
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
