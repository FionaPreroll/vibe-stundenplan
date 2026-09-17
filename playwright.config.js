// Config for the small, targeted Playwright regression suite in e2e/ — not
// a general-purpose e2e rewrite of the manual Playwright verification this
// project otherwise relies on (see CONTRIBUTING.md's test philosophy), just
// automated guards for specific layout/CSS behaviors that have actually
// broken silently before and that node --test can't observe (no DOM/layout).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "python3 -m http.server 4174",
    url: "http://localhost:4174/index.html",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4174",
  },
  // Every spec runs against both engines: sticky/layout CSS bugs in this
  // project have specifically been engine-dependent (the frozen time
  // column, item 25, only broke on Firefox — Chromium alone never caught
  // it). The sandbox some of this project's development happens in can't
  // download the Firefox browser (network policy blocks Playwright's CDN),
  // so the firefox project is unverifiable there — CI (normal internet
  // access) is the real gate for it; see CONTRIBUTING.md.
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
});
