#!/usr/bin/env node
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    project: process.cwd(),
    browser: "chromium",
    timeout: 30000,
    waitMs: 1000,
    fullPage: false,
    json: false,
    failOnConsole: true,
    failOnRequestFailed: true,
    failOnHttp5xx: true,
    failOnHttp4xx: false,
    ignoreUrlPatterns: [],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      if (!argv[i + 1]) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--full-page") args.fullPage = true;
    else if (arg === "--no-fail-on-console") args.failOnConsole = false;
    else if (arg === "--no-fail-on-request-failed") args.failOnRequestFailed = false;
    else if (arg === "--no-fail-on-http-5xx") args.failOnHttp5xx = false;
    else if (arg === "--fail-on-http-4xx") args.failOnHttp4xx = true;
    else if (arg === "--project") args.project = readValue();
    else if (arg.startsWith("--project=")) args.project = arg.slice("--project=".length);
    else if (arg === "--url") args.url = readValue();
    else if (arg.startsWith("--url=")) args.url = arg.slice("--url=".length);
    else if (arg === "--screenshot") args.screenshot = readValue();
    else if (arg.startsWith("--screenshot=")) args.screenshot = arg.slice("--screenshot=".length);
    else if (arg === "--browser") args.browser = readValue();
    else if (arg.startsWith("--browser=")) args.browser = arg.slice("--browser=".length);
    else if (arg === "--timeout") args.timeout = Number(readValue());
    else if (arg.startsWith("--timeout=")) args.timeout = Number(arg.slice("--timeout=".length));
    else if (arg === "--wait-ms") args.waitMs = Number(readValue());
    else if (arg.startsWith("--wait-ms=")) args.waitMs = Number(arg.slice("--wait-ms=".length));
    else if (arg === "--viewport") args.viewport = parseViewport(readValue());
    else if (arg.startsWith("--viewport=")) args.viewport = parseViewport(arg.slice("--viewport=".length));
    else if (arg === "--ignore-url-pattern") args.ignoreUrlPatterns.push(readValue());
    else if (arg.startsWith("--ignore-url-pattern=")) args.ignoreUrlPatterns.push(arg.slice("--ignore-url-pattern=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) throw new Error(`Invalid viewport "${value}". Use WIDTHxHEIGHT, e.g. 1280x720.`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function usage() {
  return `Usage:
  node inspect_page.mjs --url <url> [options]

Options:
  --project <path>                 Target project root used to resolve Playwright.
  --screenshot <path>              Save a screenshot. Relative paths resolve from project root.
  --full-page                      Capture the full scrollable page.
  --browser chromium|firefox|webkit
  --viewport WIDTHxHEIGHT          Example: 1280x720.
  --timeout <ms>                   Navigation timeout. Default: 30000.
  --wait-ms <ms>                   Extra wait after load. Default: 1000.
  --json                           Print JSON only.
  --ignore-url-pattern <regex>     Ignore matching request/response URLs. Repeatable.
  --no-fail-on-console             Do not fail on console.error.
  --no-fail-on-request-failed      Do not fail on failed network requests.
  --no-fail-on-http-5xx            Do not fail on HTTP 5xx responses.
  --fail-on-http-4xx               Fail on HTTP 4xx responses.
`;
}

function loadPlaywright(projectRoot) {
  const packageJson = path.join(projectRoot, "package.json");
  const requireFromProject = createRequire(fs.existsSync(packageJson) ? packageJson : path.join(projectRoot, "noop.js"));

  for (const packageName of ["playwright", "@playwright/test"]) {
    try {
      return { packageName, module: requireFromProject(packageName) };
    } catch {
      // Try the next package.
    }
  }

  throw new Error(
    `Playwright is not installed or cannot be resolved from ${projectRoot}. Install "playwright" or "@playwright/test" in the target project, or use the project's existing Playwright command.`
  );
}

function makeUrlIgnored(patterns) {
  const regexes = patterns.map((pattern) => new RegExp(pattern));
  return (url) => regexes.some((regex) => regex.test(url));
}

function resolveOutputPath(projectRoot, outputPath) {
  if (!outputPath) return null;
  return path.isAbsolute(outputPath) ? outputPath : path.join(projectRoot, outputPath);
}

function summarizeForHuman(result) {
  const lines = [
    `URL: ${result.url}`,
    `Status: ${result.finalStatus}`,
    `Browser: ${result.browser}`,
    `HTTP status: ${result.mainResponseStatus ?? "unknown"}`,
    `Title: ${result.title || "unknown"}`,
    `Console errors: ${result.consoleErrors.length}`,
    `Page errors: ${result.pageErrors.length}`,
    `Failed requests: ${result.failedRequests.length}`,
    `HTTP 4xx: ${result.http4xx.length}`,
    `HTTP 5xx: ${result.http5xx.length}`,
    `Screenshot: ${result.screenshotPath ?? "not captured"}`,
  ];

  if (result.failureReasons.length) {
    lines.push("Failure reasons:");
    for (const reason of result.failureReasons) lines.push(`- ${reason}`);
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }

  if (!args.url) throw new Error("Missing required --url argument.");
  if (!Number.isFinite(args.timeout) || args.timeout <= 0) throw new Error("--timeout must be a positive number.");
  if (!Number.isFinite(args.waitMs) || args.waitMs < 0) throw new Error("--wait-ms must be a non-negative number.");

  const projectRoot = path.resolve(args.project);
  const ignored = makeUrlIgnored(args.ignoreUrlPatterns);
  const { module: playwright, packageName } = loadPlaywright(projectRoot);
  const browserType = playwright[args.browser];
  if (!browserType?.launch) throw new Error(`Unsupported browser "${args.browser}". Use chromium, firefox, or webkit.`);

  const result = {
    url: args.url,
    projectRoot,
    playwrightPackage: packageName,
    browser: args.browser,
    viewport: args.viewport ?? null,
    startedAt: new Date().toISOString(),
    finalStatus: "FAIL",
    mainResponseStatus: null,
    title: "",
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    http4xx: [],
    http5xx: [],
    screenshotPath: null,
    failureReasons: [],
  };

  let browser;
  try {
    browser = await browserType.launch({ headless: true });
    const context = await browser.newContext(args.viewport ? { viewport: args.viewport } : {});
    const page = await context.newPage();
    page.setDefaultTimeout(args.timeout);
    page.setDefaultNavigationTimeout(args.timeout);

    page.on("console", (message) => {
      if (message.type() === "error") {
        result.consoleErrors.push({
          text: message.text(),
          location: message.location(),
        });
      }
    });

    page.on("pageerror", (error) => {
      result.pageErrors.push({
        message: error.message,
        stack: error.stack ?? null,
      });
    });

    page.on("requestfailed", (request) => {
      const url = request.url();
      if (ignored(url)) return;
      result.failedRequests.push({
        url,
        method: request.method(),
        resourceType: request.resourceType(),
        failure: request.failure()?.errorText ?? "unknown",
      });
    });

    page.on("response", (response) => {
      const url = response.url();
      if (ignored(url)) return;
      const status = response.status();
      if (status >= 500) {
        result.http5xx.push({ url, status, statusText: response.statusText() });
      } else if (status >= 400) {
        result.http4xx.push({ url, status, statusText: response.statusText() });
      }
    });

    const response = await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: args.timeout });
    result.mainResponseStatus = response?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: Math.min(args.timeout, 10000) }).catch(() => {});
    if (args.waitMs > 0) await page.waitForTimeout(args.waitMs);
    result.title = await page.title().catch(() => "");

    const screenshotPath = resolveOutputPath(projectRoot, args.screenshot);
    if (screenshotPath) {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: args.fullPage });
      result.screenshotPath = screenshotPath;
    }

    if (args.failOnConsole && result.consoleErrors.length) result.failureReasons.push("console.error messages were observed");
    if (result.pageErrors.length) result.failureReasons.push("uncaught page errors were observed");
    if (args.failOnRequestFailed && result.failedRequests.length) result.failureReasons.push("failed network requests were observed");
    if (args.failOnHttp5xx && result.http5xx.length) result.failureReasons.push("HTTP 5xx responses were observed");
    if (args.failOnHttp4xx && result.http4xx.length) result.failureReasons.push("HTTP 4xx responses were observed");
    if (result.mainResponseStatus && result.mainResponseStatus >= 500) result.failureReasons.push(`main document returned HTTP ${result.mainResponseStatus}`);
    if (args.failOnHttp4xx && result.mainResponseStatus && result.mainResponseStatus >= 400 && result.mainResponseStatus < 500) {
      result.failureReasons.push(`main document returned HTTP ${result.mainResponseStatus}`);
    }

    result.finalStatus = result.failureReasons.length ? "FAIL" : "PASS";
  } finally {
    if (browser) await browser.close();
    result.finishedAt = new Date().toISOString();
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(summarizeForHuman(result));
  }

  return result.finalStatus === "PASS" ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    const result = {
      finalStatus: "FAIL",
      failureReasons: [error.message],
      error: error.stack ?? String(error),
    };
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 2;
  });
