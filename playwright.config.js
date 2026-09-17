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
});
