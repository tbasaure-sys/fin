import assert from "node:assert/strict";
import test from "node:test";

import { localizeBreakpointDriver, localizeBreakpointSourceCategory, localizeBreakpointStatus } from "../lib/breakpoint/presentation.js";

test("Breakpoint presentation localizes engine labels before they reach Spanish users", () => {
  assert.equal(localizeBreakpointDriver("margin", "es"), "margen EBIT");
  assert.equal(localizeBreakpointStatus("stretched", "es"), "exigente");
  assert.equal(localizeBreakpointSourceCategory("reported", "es"), "reportado");
});
