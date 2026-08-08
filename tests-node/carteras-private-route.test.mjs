import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Carteras lives behind the existing private workspace session", async () => {
  const page = await readFile(new URL("../app/app/carteras/page.js", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/carteras/dashboard/route.js", import.meta.url), "utf8");
  const middleware = await readFile(new URL("../middleware.js", import.meta.url), "utf8");

  assert.match(page, /requireServerAuthSession\("\/app\/carteras"\)/);
  assert.match(page, /index: false/);
  assert.match(api, /requireApiAuthSession/);
  assert.match(middleware, /pathname === "\/app" \|\| pathname\.startsWith\("\/app\/"\)/);
});

test("Carteras uses the configured backend instead of exposing an unauthenticated browser origin", async () => {
  const loader = await readFile(new URL("../lib/server/carteras-api.js", import.meta.url), "utf8");
  assert.match(loader, /CARTERAS_API_BASE_URL/);
  assert.match(loader, /CARTERAS_API_TOKEN/);
  assert.match(loader, /authorization: `Bearer \$\{token\}`/);
  assert.match(loader, /cache: "no-store"/);
  assert.match(loader, /if \(!configuredBaseUrl\(\)\)/);
  assert.match(loader, /source: "fallback"/);
});
