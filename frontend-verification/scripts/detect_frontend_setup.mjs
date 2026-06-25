#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SCRIPT_NAMES = [
  "agent:verify",
  "verify",
  "check",
  "typecheck",
  "lint",
  "build",
  "test",
  "test:e2e",
  "e2e",
  "dev",
  "dev:all",
  "start",
  "preview",
  "backend:dev",
];

const PLAYWRIGHT_CONFIGS = [
  "playwright.config.ts",
  "playwright.config.js",
  "playwright.config.mjs",
  "playwright.config.cjs",
];

const TEST_DIRS = [
  "tests/e2e",
  "e2e",
  "playwright",
  "tests",
];

const FRAMEWORK_FILES = [
  ["Next.js", ["next.config.js", "next.config.mjs", "next.config.ts"]],
  ["Vite", ["vite.config.js", "vite.config.mjs", "vite.config.ts"]],
  ["Nuxt", ["nuxt.config.js", "nuxt.config.mjs", "nuxt.config.ts"]],
  ["SvelteKit", ["svelte.config.js", "svelte.config.mjs", "svelte.config.ts"]],
  ["Angular", ["angular.json"]],
  ["Vue CLI", ["vue.config.js"]],
];

function parseArgs(argv) {
  const args = { project: process.cwd(), json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--project" && argv[i + 1]) {
      args.project = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--project=")) {
      args.project = arg.slice("--project=".length);
    } else if (arg === "-h" || arg === "--help") {
      args.help = true;
    }
  }
  return args;
}

function exists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function packageManagerFromField(value) {
  if (!value || typeof value !== "string") return null;
  const name = value.split("@")[0];
  return ["npm", "pnpm", "yarn", "bun"].includes(name) ? name : null;
}

function detectPackageManager(root, pkg) {
  const lockfiles = [
    ["pnpm", "pnpm-lock.yaml"],
    ["yarn", "yarn.lock"],
    ["npm", "package-lock.json"],
    ["npm", "npm-shrinkwrap.json"],
    ["bun", "bun.lockb"],
    ["bun", "bun.lock"],
  ];

  const matches = lockfiles
    .filter(([, file]) => exists(root, file))
    .map(([manager, file]) => ({ manager, file }));

  const fromField = packageManagerFromField(pkg?.packageManager);
  return {
    manager: matches[0]?.manager ?? fromField ?? "npm",
    source: matches[0]?.file ?? (fromField ? "packageManager" : "default"),
    lockfiles: matches,
    packageManagerField: pkg?.packageManager ?? null,
  };
}

function runCommand(manager, script) {
  if (manager === "pnpm") return `pnpm run ${script}`;
  if (manager === "yarn") return `yarn run ${script}`;
  if (manager === "bun") return `bun run ${script}`;
  return `npm run ${script}`;
}

function playwrightCommand(manager) {
  if (manager === "pnpm") return "pnpm exec playwright test";
  if (manager === "yarn") return "yarn playwright test";
  if (manager === "bun") return "bunx playwright test";
  return "npx playwright test";
}

function dependencyMap(pkg) {
  return {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
    ...(pkg?.optionalDependencies ?? {}),
  };
}

function detectFrameworks(root) {
  return FRAMEWORK_FILES
    .filter(([, files]) => files.some((file) => exists(root, file)))
    .map(([name]) => name);
}

function detectSetup(root) {
  const packageJsonPath = path.join(root, "package.json");
  const pkg = readJson(packageJsonPath);
  const packageManager = detectPackageManager(root, pkg);
  const scripts = pkg?.scripts ?? {};
  const deps = dependencyMap(pkg);
  const availableScripts = SCRIPT_NAMES.filter((name) => scripts[name]);
  const playwrightConfigs = PLAYWRIGHT_CONFIGS.filter((file) => exists(root, file));
  const testDirs = TEST_DIRS.filter((dir) => exists(root, dir));
  const hasPlaywrightDependency = Boolean(deps["@playwright/test"] || deps.playwright);
  const hasPackageJson = Boolean(pkg);

  const suggestedChecks = [];
  if (scripts["agent:verify"]) {
    suggestedChecks.push(runCommand(packageManager.manager, "agent:verify"));
  } else {
    for (const script of ["check", "typecheck", "lint", "build", "test", "test:e2e", "e2e"]) {
      if (scripts[script]) suggestedChecks.push(runCommand(packageManager.manager, script));
    }
    if (hasPlaywrightDependency || playwrightConfigs.length > 0) {
      suggestedChecks.push(playwrightCommand(packageManager.manager));
    }
  }

  const suggestedStart = [];
  for (const script of ["dev:all", "dev", "start", "preview", "backend:dev"]) {
    if (scripts[script]) suggestedStart.push(runCommand(packageManager.manager, script));
  }

  const missing = [];
  if (!hasPackageJson) missing.push("package.json");
  if (!scripts["agent:verify"]) missing.push("agent:verify script");
  if (!hasPlaywrightDependency) missing.push("Playwright dependency");
  if (playwrightConfigs.length === 0) missing.push("Playwright config");
  if (testDirs.length === 0) missing.push("E2E test directory");

  return {
    projectRoot: root,
    hasPackageJson,
    packageManager,
    frameworks: detectFrameworks(root),
    scripts: availableScripts,
    suggestedChecks,
    suggestedStart,
    playwright: {
      dependencyInstalled: hasPlaywrightDependency,
      configFiles: playwrightConfigs,
      testDirectories: testDirs,
      command: playwrightCommand(packageManager.manager),
    },
    mcp: {
      note: "Browser MCP availability cannot be detected from project files. Check the active agent tools for Chrome DevTools MCP or Playwright MCP.",
    },
    missing,
  };
}

function printHuman(result) {
  const line = (label, value) => {
    const rendered = Array.isArray(value) ? (value.length ? value.join(", ") : "none") : value;
    console.log(`${label}: ${rendered}`);
  };

  line("Project", result.projectRoot);
  line("Package manager", `${result.packageManager.manager} (${result.packageManager.source})`);
  line("Framework signals", result.frameworks);
  line("Available scripts", result.scripts);
  line("Suggested checks", result.suggestedChecks);
  line("Suggested start commands", result.suggestedStart);
  line("Playwright dependency", result.playwright.dependencyInstalled ? "yes" : "no");
  line("Playwright config", result.playwright.configFiles);
  line("E2E directories", result.playwright.testDirectories);
  line("Missing verification setup", result.missing);
}

const args = parseArgs(process.argv);

if (args.help) {
  console.log("Usage: node detect_frontend_setup.mjs [--project <path>] [--json]");
  process.exit(0);
}

const root = path.resolve(args.project);
const result = detectSetup(root);

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}
