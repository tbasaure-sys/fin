import test from "node:test";
import assert from "node:assert/strict";

import { buildBreakpointCompanyLinks } from "../lib/breakpoint/navigation.js";

test("Breakpoint exits into the unified company page and an honest authenticated queue path", () => {
  const links = buildBreakpointCompanyLinks("hrow", "es");

  assert.equal(links.company, "/company/HROW?lang=es");
  assert.equal(
    links.queue,
    "/login?intent=signin&next=%2Fapp%2Fcompany%2FHROW&lang=es",
  );
});
