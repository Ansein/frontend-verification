---
name: frontend-verification
description: Verify frontend and full-stack changes before completion by exercising the affected user path in a browser, checking build/test results, console errors, failed critical network requests, screenshots, and E2E coverage. Use when Codex modifies UI components, styling, routing, browser behavior, forms, auth flows, loading/empty/error states, API integrations visible in the frontend, or backend behavior that changes a user-facing page.
---

# Frontend Verification

## Overview

Verify the changed frontend path in a real browser before claiming the task is complete. Do not treat compile, typecheck, lint, or unit tests as sufficient when the change affects browser-visible behavior.

This enhanced version includes a read-only setup detector at `scripts/detect_frontend_setup.mjs`. Use it to discover the target project's package manager, verification scripts, Playwright setup, and missing prerequisites before deciding which checks to run.

It also includes `scripts/inspect_page.mjs`, a Playwright-based page inspection helper. Use it when Playwright is installed in the target project and browser MCP tools are unavailable or unnecessary.

## Reviewer Subagent Mode

Prefer separating implementation from verification when subagents are available.

Use this pattern:

```text
Builder agent: modify code, run basic checks, fix compile/test failures.
Reviewer subagent: use this skill to verify the changed user path in a browser and return a report.
Builder agent: fix issues from the reviewer report, then request verification again when needed.
```

Invoke a reviewer subagent only after the builder has made the intended code changes and the workspace is ready for review. Give the reviewer:

- The target project root.
- The original user request or acceptance criteria.
- The changed files or a concise summary of the change.
- The likely affected route or user flow, if known.
- The path to this skill if it is not globally installed.

The reviewer subagent must work in review posture: run checks, start the app if needed, inspect the browser path, capture evidence, and report findings. It should not edit source files unless the main agent explicitly asks it to fix something.

If subagents are unavailable, the main agent must run the same workflow itself. Do not skip browser verification just because reviewer delegation is unavailable.

## Workflow

### 1. Identify the Affected Path

Before running checks, determine:

- The changed route, page, or component.
- The user action or state that changed.
- The frontend-visible API or backend behavior, if any.
- The expected success state.
- Relevant loading, empty, error, auth, or permission states.

If the user did not name a route, infer the most relevant page from the files changed, router config, tests, and nearby code.

### 2. Plan Observation Targets

Create a short observation checklist before running browser verification. Derive it from the user request, changed files, routes, component names, tests, and API calls.

Include the relevant items from this set:

- Primary route or page to open.
- Primary user flow to exercise.
- Changed component or UI region to inspect.
- Data/API path visible in the UI.
- Initial, loading, success, empty, and error states when relevant.
- Auth, permission, or role-specific states when relevant.
- Desktop and mobile viewport checks when layout or responsive behavior changed.
- Screenshots that should be captured.
- Existing E2E or smoke tests that should cover the change.

Do not ask the user for observation targets when the affected route and user flow are obvious from the task or diff. State the inferred checklist and proceed.

Ask the user a concise clarification, or present a short checklist for selection, when:

- The changed files affect multiple unrelated routes.
- The task changes shared components used across many pages.
- The route, role, tenant, dataset, or browser state cannot be inferred.
- The verification could perform destructive actions or depend on external services.
- The visual acceptance criteria are subjective and screenshots alone are not enough.

When asking, propose concrete options rather than an open-ended question. Example:

```text
I see this change may affect three browser paths. Which should I verify first?
1. Dashboard summary cards at /dashboard
2. Project creation form at /projects/new
3. Empty/error state in the project list
```

If the user is unavailable or the workflow should continue without waiting, choose the highest-risk paths, state the assumptions in the report, and mark unverified targets as remaining risks.

### 3. Detect Project Verification Setup

Run the bundled detector from this skill directory before choosing commands:

```bash
node scripts/detect_frontend_setup.mjs --project <project-root> --json
```

When the skill is installed outside the target project, replace `scripts/detect_frontend_setup.mjs` with the path to this skill's bundled script. For the current project root, use:

```bash
node <skill-dir>/scripts/detect_frontend_setup.mjs --project . --json
```

Use the detector output to decide:

- Which package manager command style to use.
- Whether `agent:verify` already exists.
- Which static, build, and test scripts are available.
- Whether Playwright is installed and configured.
- Whether an E2E test directory already exists.
- What verification setup is missing.

The detector is read-only. It must not be treated as verification by itself.

### 4. Run Project Checks

Prefer the project's unified verification command when present:

```bash
npm run agent:verify
```

If it does not exist, inspect the project scripts and run the closest available checks, such as:

```bash
npm run check
npm run typecheck
npm run lint
npm run build
npm test
npx playwright test
```

Skip missing scripts without inventing commands. Record what was available and what was not.

### 5. Handle Missing Verification Setup

Do not assume Playwright, browser MCP tools, or `agent:verify` are already installed.

If verification tooling is missing:

- Use existing project checks first.
- Use available browser MCP tools if they are already configured in the agent environment.
- If browser MCP tools are unavailable but Playwright is already installed, use Playwright CLI.
- If Playwright is not installed, do not silently add dependencies for an unrelated feature task.
- Install or configure Playwright only when the user asked to set up frontend verification, when the project already establishes Playwright as its test framework, or when adding verification infrastructure is clearly in scope for the current task.
- Before adding new dependencies, detect the package manager from lockfiles and use the matching command.
- If installing dependencies requires network access or package changes, state the intended change before doing it when the environment requires approval.
- If verification cannot be completed because required tooling or services are unavailable, report `FAIL` or a blocked verification status with the missing prerequisite.

For a project that has no browser verification yet, the acceptable MVP setup is:

```text
package.json script: npm run agent:verify
Playwright config
one smoke test for the changed or core route
AGENTS.md rule that invokes this skill
```

### 6. Bootstrap Verification When In Scope

When the user asks to set up or upgrade frontend verification, add the smallest useful project-level setup:

- Add Playwright only if it is not already present.
- Add a Playwright config using the app's existing dev server command and local URL when those can be inferred.
- Add one smoke test for the changed route or a core route.
- Add `agent:verify` to run static/build checks plus Playwright where practical.
- Add the short `AGENTS.md` trigger rule if the project does not already have one.

Do not add visual regression snapshots in the first setup unless the user explicitly asks for visual regression. Screenshots during browser inspection are enough for the enhanced version.

### 7. Start the App

Use existing project scripts first:

```bash
npm run dev
npm run dev:all
npm run start
```

Use backend startup commands only when the affected frontend path requires live backend behavior. Wait until the app is reachable before browser inspection.

### 8. Inspect in a Browser

Use the best available browser path:

1. Use Chrome DevTools MCP when available for live browser inspection, console, network, screenshots, and performance clues.
2. Use Playwright MCP when available for structured page interaction.
3. Use `scripts/inspect_page.mjs` for a focused page load, console/pageerror/network check, and screenshot when Playwright is installed in the target project.
4. Use Playwright CLI/tests when MCP browser tools are unavailable.

Do not claim that Chrome DevTools MCP or Playwright MCP was used unless that tool is actually available in the active agent environment. If no browser MCP exists, use Playwright CLI or report the missing browser inspection capability.

Example page inspection command:

```bash
node <skill-dir>/scripts/inspect_page.mjs --project <project-root> --url http://127.0.0.1:5173 --screenshot artifacts/frontend-verification/page.png --json
```

The helper is not a replacement for active interaction. It loads one URL, watches console/page errors and network failures, and captures a screenshot. Use MCP tools or project Playwright tests for clicks, forms, hover states, dialogs, tabs, and other multi-step flows.

Open the affected route and actively exercise the changed user path. Do not only load the page. Click, type, hover, select, submit, scroll, open dialogs/menus, change tabs, and trigger validation states when those interactions are relevant to the change.

Check at minimum:

- The page is not blank and does not crash.
- The expected UI appears.
- The changed interaction works.
- There are no uncaught page errors.
- There are no serious console errors.
- There are no failed critical network requests.
- Loading, empty, and error states are acceptable when relevant.
- The layout is not visibly broken on the affected viewport.

Capture at least one screenshot when the task changes visible UI. Capture multiple screenshots when the change affects important states.

### 9. Detect Small Visual or Interaction Changes

Use layered evidence for small frontend changes:

- For behavior changes, prefer deterministic assertions: visible text, enabled/disabled state, selected tab, URL change, form value, toast/dialog presence, request outcome, or DOM attribute.
- For tiny visual changes, capture before/after or state-specific screenshots when possible and inspect them with a multimodal reviewer.
- For precise pixel-level regression, use Playwright visual comparisons such as `toHaveScreenshot()` only when the project already has visual snapshots or when the user asks to add visual regression.
- For layout-sensitive changes, check the relevant component at desktop and mobile viewports, and inspect bounding boxes, overflow, clipping, overlap, and scroll behavior.
- For animation, hover, focus, dropdown, tooltip, modal, popover, drag/drop, or keyboard behavior, actively trigger the state before judging it.

Do not overclaim micro-visual correctness from logs alone. If no multimodal model, baseline screenshot, or visual regression test is available, report the limitation under `Remaining risks`.

### 10. Add or Update E2E Coverage

If Playwright tests already exist, run the relevant tests. If the change adds or changes an important user-facing behavior, add or update a focused Playwright test for that path unless the user explicitly asks not to change tests.

For small cosmetic-only changes, a browser screenshot plus static checks may be enough.

### 11. Decide Completion

Treat the task as incomplete if any of these occur:

- Build, typecheck, lint, or relevant tests fail.
- The affected page cannot load.
- The page is blank or crashes.
- A critical console error appears.
- A critical API or asset request fails.
- The changed interaction does not work.
- Expected UI is missing.
- The screenshot shows obvious layout breakage.

Fix the issue and rerun the relevant checks before reporting completion.

## Report Format

End with a concise verification report:

```text
Frontend verification report

Changed route/path:
Observation targets:
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

Use `PASS` only when the changed browser path was exercised and the relevant checks are clean. Use `FAIL` when verification is blocked, incomplete, or found a real issue.
