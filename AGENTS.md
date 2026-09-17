# Agent contribution instructions

Apply these instructions to every change in this repository.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before making implementation decisions; it contains the
  module boundaries, testing expectations, styling rules, and release details.
- Work on a feature branch named `feature/<short-kebab-case-description>` (for example,
  `feature/this-and-that`). Create or switch to that branch before committing if the current
  branch does not follow this convention.
- Run the relevant checks from the checklist in `CONTRIBUTING.md` before committing. For visual
  changes, also run the documented Playwright verification or state clearly in the PR if the
  environment prevents it.
- Commit the completed changes, then open a pull request. Its body must include a **Preview**
  section with a raw.githack URL for the current branch:
  `https://raw.githack.com/FionaPreroll/vibe-stundenplan/<branch>/index.html`.
- In the PR body, summarize user-visible changes, list the checks run, and explicitly call out
  checks blocked by environment limitations.
