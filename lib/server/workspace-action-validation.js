function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value) {
  return String(value || "").trim();
}

function requireObject(value, label) {
  if (!isPlainObject(value)) {
    throw new RequestValidationError(`${label} must be a JSON object.`);
  }
  return value;
}

function readString(value, label, { required = false, max = 280 } = {}) {
  const text = asTrimmedString(value);
  if (!text) {
    if (required) {
      throw new RequestValidationError(`${label} is required.`);
    }
    return "";
  }

  if (text.length > max) {
    throw new RequestValidationError(`${label} must be ${max} characters or fewer.`);
  }

  return text;
}

function readOptionalNumber(value, label, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new RequestValidationError(`${label} must be a valid number.`);
  }
  if (min !== null && numeric < min) {
    throw new RequestValidationError(`${label} must be at least ${min}.`);
  }
  if (max !== null && numeric > max) {
    throw new RequestValidationError(`${label} must be at most ${max}.`);
  }
  return numeric;
}

function readOptionalStringArray(value, label, { maxItems = 12, maxLength = 180 } = {}) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new RequestValidationError(`${label} must be an array of strings.`);
  }
  if (value.length > maxItems) {
    throw new RequestValidationError(`${label} must contain ${maxItems} items or fewer.`);
  }
  return value.map((item, index) => readString(item, `${label}[${index}]`, { required: true, max: maxLength }));
}

function normalizeAction(value, label = "action") {
  const action = requireObject(value, label);
  const id = readString(action.id, `${label}.id`, { required: true, max: 120 });
  const title = readString(action.title, `${label}.title`, { required: true, max: 180 });

  return {
    ...action,
    id,
    title,
    summary: readString(action.summary || action.whyNow, `${label}.summary`, { max: 400 }),
    ticker: readString(action.ticker, `${label}.ticker`, { max: 16 }),
    status: readString(action.status, `${label}.status`, { max: 48 }),
    sizeLabel: readString(action.sizeLabel || action.size, `${label}.sizeLabel`, { max: 80 }),
    sizeValue: readOptionalNumber(action.sizeValue, `${label}.sizeValue`),
    funding: readString(action.funding, `${label}.funding`, { max: 120 }),
    watchFor: readString(action.watchFor, `${label}.watchFor`, { max: 240 }),
    tone: readString(action.tone, `${label}.tone`, { max: 32 }),
  };
}

export class RequestValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RequestValidationError";
    this.status = status;
  }
}

export function errorResponse(error) {
  const message = String(error?.message || error || "Request failed.");

  if (error instanceof RequestValidationError) {
    return Response.json({ error: message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }

  if (/not found/i.test(message)) {
    return Response.json({ error: message }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  if (/Could not parse|No current price found|Please provide|Include a share count or USD amount|Cannot sell|must result in a positive position|Invalid|Unsupported tickers|overlapping history|rolling window|timed out|Unexpected phantom diversification failure|At least 3|weights must sum|failed with exit code/i.test(message)) {
    return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  if (/spawn|ENOENT|MODULE_NOT_FOUND|No module named/i.test(message)) {
    return Response.json({ error: "Phantom diversification analysis is unavailable. The analysis engine could not be started." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  return Response.json({ error: "Internal server error." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export function parsePortfolioUpdatePayload(body) {
  const payload = requireObject(body, "Payload");
  const instruction = readString(payload.instruction || payload.text, "instruction", { required: true, max: 400 });
  const price = readOptionalNumber(payload.price ?? payload.currentPrice ?? payload.explicitPrice, "price", { min: 0 });

  return price === undefined ? { instruction } : { instruction, price };
}

export function parsePhantomDiversificationPayload(body) {
  const payload = requireObject(body, "Payload");
  if (!Array.isArray(payload.holdings)) {
    throw new RequestValidationError("holdings must be an array.");
  }
  if (payload.holdings.length < 3) {
    throw new RequestValidationError("At least 3 holdings are required.");
  }
  if (payload.holdings.length > 24) {
    throw new RequestValidationError("Phantom diversification analyzes up to 24 positive holdings per run. Trim the list or reset to the connected top weights.");
  }

  const holdings = payload.holdings.map((row, index) => {
    const holding = requireObject(row, `holdings[${index}]`);
    const ticker = readString(holding.ticker, `holdings[${index}].ticker`, { required: true, max: 16 })
      .toUpperCase()
      .replace(/[^A-Z0-9.\-]/g, "");
    const weight = readOptionalNumber(holding.weight, `holdings[${index}].weight`, { min: 0.0001, max: 100 });
    const sector = readString(holding.sector, `holdings[${index}].sector`, { max: 80 });
    const country = readString(holding.country, `holdings[${index}].country`, { max: 80 });
    const proxy = readString(holding.proxy, `holdings[${index}].proxy`, { max: 48 });
    if (!ticker) {
      throw new RequestValidationError(`holdings[${index}].ticker is required.`);
    }
    if (weight === undefined) {
      throw new RequestValidationError(`holdings[${index}].weight is required.`);
    }
    return { ticker, weight, sector, country, proxy };
  });

  const totalWeight = holdings.reduce((sum, row) => sum + row.weight, 0);
  if (!(totalWeight > 0)) {
    throw new RequestValidationError("Holdings weights must sum to more than zero.");
  }

  return { holdings };
}

export function parseDecisionPayload(body) {
  const payload = requireObject(body, "Payload");
  const userResponse = readString(payload.userResponse, "userResponse", { required: true, max: 24 }).toLowerCase();
  const allowedResponses = new Set(["deferred", "rejected", "noted", "executed", "staged", "cancelled"]);
  if (!allowedResponses.has(userResponse)) {
    throw new RequestValidationError("userResponse is not supported.");
  }

  return {
    action: normalizeAction(payload.action),
    userResponse,
    note: readString(payload.note, "note", { max: 400 }),
    stateSummary: isPlainObject(payload.stateSummary) ? payload.stateSummary : {},
    counterfactual: isPlainObject(payload.counterfactual) ? payload.counterfactual : {},
  };
}

export function parseEscrowStagePayload(body) {
  const payload = requireObject(body, "Payload");

  return {
    action: normalizeAction(payload.action),
    autoMature: Boolean(payload.autoMature),
    expiresAt: readString(payload.expiresAt, "expiresAt", { max: 64 }),
    note: readString(payload.note, "note", { max: 400 }),
    stateSummary: isPlainObject(payload.stateSummary) ? payload.stateSummary : {},
  };
}

export function parseEscrowPatchPayload(body) {
  const payload = requireObject(body, "Payload");
  const action = readString(payload.action, "action", { max: 24 }).toLowerCase();
  const readiness = readOptionalNumber(payload.readiness, "readiness", { min: 0, max: 1 });

  if (!action && readiness === undefined && payload.autoMature === undefined && !asTrimmedString(payload.note)) {
    throw new RequestValidationError("At least one escrow field must be provided.");
  }

  if (action && !["cancel", "execute"].includes(action)) {
    throw new RequestValidationError("action must be either 'cancel' or 'execute'.");
  }

  return {
    action,
    autoMature: payload.autoMature === undefined ? undefined : Boolean(payload.autoMature),
    readiness,
    note: readString(payload.note, "note", { max: 400 }),
    stateSummary: isPlainObject(payload.stateSummary) ? payload.stateSummary : {},
  };
}

export function parseMandatePatchPayload(body) {
  const payload = requireObject(body, "Payload");

  const next = {
    activeMandateId: readString(payload.activeMandateId, "activeMandateId", { max: 120 }),
    title: readString(payload.title, "title", { max: 160 }),
    summary: readString(payload.summary, "summary", { max: 320 }),
    statement: readString(payload.statement, "statement", { max: 320 }),
    guardrails: readOptionalStringArray(payload.guardrails, "guardrails"),
  };

  if (payload.thresholds !== undefined) {
    const thresholds = requireObject(payload.thresholds, "thresholds");
    next.thresholds = {};
    const minRecoverability = readOptionalNumber(thresholds.minRecoverability, "thresholds.minRecoverability", { min: 0, max: 1 });
    const maxPhantomRebound = readOptionalNumber(thresholds.maxPhantomRebound, "thresholds.maxPhantomRebound", { min: 0, max: 1 });
    if (minRecoverability !== undefined) next.thresholds.minRecoverability = minRecoverability;
    if (maxPhantomRebound !== undefined) next.thresholds.maxPhantomRebound = maxPhantomRebound;
  }

  const hasChange = Object.values(next).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (isPlainObject(value)) return Object.keys(value).length > 0;
    return Boolean(value);
  });

  if (!hasChange) {
    throw new RequestValidationError("At least one mandate field must be provided.");
  }

  return next;
}
