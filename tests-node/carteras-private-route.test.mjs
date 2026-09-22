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

test("both routes pass the authenticated session to the portfolio loader", async () => {
  for (const route of ["../app/app/carteras/page.js", "../app/api/carteras/dashboard/route.js"]) {
    const source = await readFile(new URL(route, import.meta.url), "utf8");
    assert.match(source, /getCarterasDashboard\([^,]+, authSession\)/);
  }
});
