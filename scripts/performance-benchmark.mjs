import { chromium } from "@playwright/test";

const baseUrl = (process.env.BLS_PERF_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const repetitions = Math.max(1, Number.parseInt(process.env.BLS_PERF_RUNS || "3", 10));
const routes = (process.env.BLS_PERF_ROUTES || "/?lang=es,/factorlab?lang=es,/aurora?lang=es,/stress?lang=es,/channels?lang=es")
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function summarize(measurements, selector) {
  const values = measurements.map(selector).filter((value) => Number.isFinite(value));
  return values.length ? Number(median(values).toFixed(2)) : null;
}

async function measureRoute(browser, route) {
  const measurements = [];

  for (let run = 0; run < repetitions; run += 1) {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const consoleErrors = [];

    await page.addInitScript(() => {
      window.__blsPerformance = { lcp: 0, longTaskCount: 0, longTaskDuration: 0 };
      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) window.__blsPerformance.lcp = last.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {}
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__blsPerformance.longTaskCount += 1;
            window.__blsPerformance.longTaskDuration += entry.duration;
          }
        }).observe({ type: "longtask", buffered: true });
      } catch {}
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));

    let response;
    try {
      response = await page.goto(`${baseUrl}${route}`, { waitUntil: "load", timeout: 30_000 });
      await page.waitForTimeout(250);
      const result = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const resources = performance.getEntriesByType("resource");
        const paints = performance.getEntriesByType("paint");
        const scripts = resources.filter((entry) => entry.initiatorType === "script" || /\.js(?:\?|$)/.test(entry.name));
        const transferSize = (entries) => entries.reduce((total, entry) => total + (entry.transferSize || 0), 0);
        const encodedBodySize = (entries) => entries.reduce((total, entry) => total + (entry.encodedBodySize || 0), 0);
        const largestContentfulPaint = performance.getEntriesByType("largest-contentful-paint").at(-1);

        return {
          title: document.title,
          h1Count: document.querySelectorAll("h1").length,
          navigation: navigation
            ? {
                responseStart: Number(navigation.responseStart.toFixed(2)),
                domContentLoaded: Number(navigation.domContentLoadedEventEnd.toFixed(2)),
                load: Number(navigation.loadEventEnd.toFixed(2)),
                duration: Number(navigation.duration.toFixed(2)),
              }
            : null,
          paint: Object.fromEntries(paints.map((entry) => [entry.name, Number(entry.startTime.toFixed(2))])),
          lcp: Number((window.__blsPerformance?.lcp || largestContentfulPaint?.startTime || 0).toFixed(2)) || null,
          longTasks: {
            count: window.__blsPerformance?.longTaskCount || 0,
            duration: Number((window.__blsPerformance?.longTaskDuration || 0).toFixed(2)),
          },
          resources: {
            count: resources.length,
            scripts: scripts.length,
            totalTransferBytes: transferSize(resources),
            scriptTransferBytes: transferSize(scripts),
            totalEncodedBytes: encodedBodySize(resources),
            scriptEncodedBytes: encodedBodySize(scripts),
          },
        };
      });

      measurements.push({
        run: run + 1,
        status: response?.status() || null,
        consoleErrors,
        ...result,
      });
    } catch (error) {
      measurements.push({ run: run + 1, status: response?.status() || null, error: String(error), consoleErrors });
    } finally {
      await context.close();
    }
  }

  const successful = measurements.filter((measurement) => measurement.navigation && !measurement.error);
  if (!successful.length) return { route, measurements };

  return {
    route,
    summary: {
      responseStartMs: summarize(successful, (measurement) => measurement.navigation.responseStart),
      domContentLoadedMs: summarize(successful, (measurement) => measurement.navigation.domContentLoaded),
      loadMs: summarize(successful, (measurement) => measurement.navigation.load),
      lcpMs: summarize(successful, (measurement) => measurement.lcp),
      scriptTransferBytes: summarize(successful, (measurement) => measurement.resources.scriptTransferBytes),
      totalTransferBytes: summarize(successful, (measurement) => measurement.resources.totalTransferBytes),
      scriptRequests: summarize(successful, (measurement) => measurement.resources.scripts),
      longTaskDurationMs: summarize(successful, (measurement) => measurement.longTasks.duration),
    },
    measurements,
  };
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const route of routes) results.push(await measureRoute(browser, route));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseUrl, repetitions, routes, results }, null, 2));
