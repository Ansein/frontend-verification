# Frontend Verification Skill

`frontend-verification` is a portable frontend verification protocol packaged as a Codex Skill. It helps Codex, Claude Code, OpenCode, and other coding agents finish frontend and full-stack work with a browser verification loop, not just a passing build.

It is designed for projects where a coding agent changes UI, routing, styling, forms, API integrations, loading states, error states, or backend behavior that is visible in the frontend.

## Multimodal Requirement

For true visual review, the executing agent or reviewer LLM should have multimodal capability so it can inspect screenshots and visible UI states. Text-only agents can still run commands, collect logs, and report missing evidence, but they cannot reliably judge layout, blank screens, clipping, overlap, or visual regressions from screenshots.

## What It Does

- Detects the target project's frontend verification setup.
- Finds the package manager, useful scripts, Playwright config, and E2E test directories.
- Prefers an existing `agent:verify` command when available.
- Runs the closest available static, build, test, and E2E checks.
- Uses Chrome DevTools MCP, Playwright MCP, or Playwright CLI when available.
- Supports an optional Builder / Reviewer subagent workflow when subagents are available.
- Requires the affected user path to be exercised in a browser before completion.
- Checks console errors, page errors, failed critical network requests, obvious blank pages, broken interactions, and visible layout issues.
- Produces a concise `PASS` / `FAIL` verification report.

## Project Layout

```text
frontend-verification/
  SKILL.md
  agents/
    openai.yaml
  scripts/
    detect_frontend_setup.mjs

README.md
README_zh.md
```

The Skill package itself is the `frontend-verification/` directory. The root README files are project documentation and are not required by Codex at runtime.

## Quick Test

Run the read-only setup detector against any frontend project:

```bash
node frontend-verification/scripts/detect_frontend_setup.mjs --project <project-root> --json
```

For the current directory:

```bash
node frontend-verification/scripts/detect_frontend_setup.mjs --project . --json
```

The detector does not install dependencies, start services, or modify files. It reports:

- detected package manager
- available project scripts
- suggested verification commands
- suggested start commands
- Playwright dependency/config/test directory status
- missing verification prerequisites

## Recommended AGENTS.md Rule

Add this to the target project's `AGENTS.md`:

```text
Use the `frontend-verification` skill for every frontend or full-stack change.

Do not mark the task complete until the changed user path has been verified in a browser and `npm run agent:verify` passes when available.
```

## Expected Target Project Setup

The best target-project setup is:

```text
package.json script: npm run agent:verify
Playwright config
one smoke test for a core route or changed route
AGENTS.md rule that invokes this skill
optional Chrome DevTools MCP for live browser inspection
```

The Skill does not assume these are already present. If they are missing, it should use existing checks first and report the missing prerequisite instead of silently adding dependencies.

## Verification Workflow

1. Identify the affected route, component, user action, and expected state.
2. Run `scripts/detect_frontend_setup.mjs` against the target project.
3. Prefer `npm run agent:verify` or the equivalent package-manager command when it exists.
4. Otherwise run the closest available checks, such as typecheck, lint, build, tests, and Playwright.
5. Start the app using existing scripts such as `dev`, `dev:all`, `start`, or `preview`.
6. Inspect the affected path in a browser.
7. Capture screenshots for visible UI changes.
8. Add or update focused E2E coverage when the change affects important user behavior.
9. Report the result as `PASS` or `FAIL`.

## Builder / Reviewer Subagent Workflow

When the Codex environment can launch subagents, use a separate reviewer for frontend verification:

```text
Builder agent
  -> modifies code
  -> runs basic checks
  -> hands off to reviewer subagent

Reviewer subagent
  -> uses $frontend-verification
  -> runs setup detection
  -> runs checks and browser inspection
  -> reports PASS / FAIL with evidence

Builder agent
  -> fixes reviewer findings
  -> requests verification again if needed
```

The reviewer should work in review posture: run checks, start the app, inspect the affected browser path, capture screenshots or artifacts, and report findings. It should not edit source files unless explicitly asked to fix something.

Suggested reviewer prompt:

```text
Use $frontend-verification to review this frontend/full-stack change.

Project root: <project-root>
Original request: <user request>
Changed files or summary: <summary>
Likely affected route/user flow: <route or flow if known>

Do not modify source files. Run the available verification checks, inspect the affected path in a browser when possible, and return the standard frontend verification report with PASS or FAIL.
```

If subagents are unavailable, the main agent should run the same verification workflow itself.

## Report Format

```text
Frontend verification report

Changed route/path:
Setup detected:
Reviewer mode:
User flow checked:
Commands run:
Browser tool used:
Console errors:
Network failures:
Screenshots:
E2E result:
Remaining risks:
Final status: PASS / FAIL
```

Use `PASS` only when the changed browser path was exercised and relevant checks are clean.

## Validation

Validate the Skill structure with:

```bash
python C:/Users/16928/.codex/skills/.system/skill-creator/scripts/quick_validate.py frontend-verification
```

Check the detector script syntax with:

```bash
node --check frontend-verification/scripts/detect_frontend_setup.mjs
```
