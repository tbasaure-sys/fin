import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fetchBackendPhantomDiversification } from "./backend.js";
import { getServerConfig } from "./config.js";
import { analyzePhantomBreadth, PhantomBreadthError } from "./phantom-breadth-engine.js";
import { fetchDailyCloseHistory } from "./holdings-performance.js";

function buildPythonEnv() {
  const cwd = process.cwd();
  const srcPath = path.join(cwd, "src");
  const current = String(process.env.PYTHONPATH || "").trim();
  return {
    ...process.env,
    PYTHONPATH: current ? `${srcPath}${path.delimiter}${current}` : srcPath,
  };
}

function resolvePythonBin() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".venv", "Scripts", "python.exe"),
    path.join(cwd, ".venv", "bin", "python"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "python";
}

function hasExplicitBackendUrl() {
  return Boolean(
    String(process.env.BLS_PRIME_BACKEND_URL || "").trim() ||
    String(process.env.META_ALLOCATOR_BACKEND_URL || "").trim(),
  );
}

function isLocalBackendUrl(value) {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i.test(String(value || ""));
}

export function shouldUseConfiguredBackendForPhantom(backendBaseUrl) {
  return Boolean(backendBaseUrl && hasExplicitBackendUrl());
}

function readJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse phantom diversification response: ${String(error?.message || error)}`);
  }
}

function runPhantomSubprocess(workspaceId, holdings) {
  const pythonBin = resolvePythonBin();
  const payload = JSON.stringify({ workspace_id: workspaceId, holdings });

  return new Promise((resolve, reject) => {
    const child = spawn(
      pythonBin,
      ["-m", "meta_alpha_allocator.web.phantom_diversification_cli"],
      {
        cwd: process.cwd(),
        env: buildPythonEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const timeoutId = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Phantom diversification analysis timed out."));
    }, 120000);

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        let errorPayload = null;
        try {
          errorPayload = stdout ? readJson(stdout) : null;
        } catch {
          errorPayload = null;
        }
        const errorMessage = errorPayload?.error || stderr.trim() || `Phantom diversification analysis failed with exit code ${code}.`;
        reject(new Error(errorMessage));
        return;
      }
      let response;
      try {
        response = readJson(stdout);
      } catch (parseError) {
        reject(parseError);
        return;
      }
      if (response?.error) {
        reject(new Error(String(response.error)));
        return;
      }
      resolve(response);
    });

    child.stdin.end(payload);
  });
}

async function runPhantomJsEngine(workspaceId, holdings) {
  const tickers = [...new Set(
    (Array.isArray(holdings) ? holdings : [])
      .map((row) => String(row?.ticker || "").toUpperCase())
      .filter(Boolean),
  )];
  const fromDate = new Date(Date.now() - 900 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const priceHistory = await fetchDailyCloseHistory(tickers, { fromDate });
  return analyzePhantomBreadth(holdings, priceHistory, { workspaceId });
}

export async function analyzeWorkspacePhantomDiversification(workspaceId, holdings) {
  const { backendBaseUrl } = getServerConfig();
  if (shouldUseConfiguredBackendForPhantom(backendBaseUrl)) {
    try {
      return await fetchBackendPhantomDiversification(holdings, workspaceId);
    } catch (error) {
      if (!isLocalBackendUrl(backendBaseUrl)) throw error;
    }
  }
  try {
    return await runPhantomSubprocess(workspaceId, holdings);
  } catch (subprocessError) {
    // Serverless runtimes (Vercel) have no Python. Fall back to the
    // paper-faithful pure-JS engine so the section keeps working.
    if (subprocessError instanceof PhantomBreadthError) throw subprocessError;
    try {
      return await runPhantomJsEngine(workspaceId, holdings);
    } catch (jsError) {
      if (jsError instanceof PhantomBreadthError) throw jsError;
      throw subprocessError;
    }
  }
}
