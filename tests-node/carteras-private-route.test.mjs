import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Carteras requires a private session in page and API", async () => {
  const page = await readFile(new URL("../app/app/carteras/page.js", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/carteras/dashboard/route.js", import.meta.url), "utf8");
  assert.match(page, /requireServerAuthSession/);
  assert.match(api, /requireApiAuthSession/);
  assert.ok(page.includes("getCarterasDashboard(authSession)"));
  assert.ok(api.includes("getCarterasDashboard(session)"));
  assert.match(page, /index: false/);
});
