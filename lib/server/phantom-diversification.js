import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

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
  const venvPython = path.join(process.cwd(), ".venv", "bin", "python");
  return existsSync(venvPython) ? venvPython : "python3";
}

function readJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse phantom diversification response: ${String(error?.message || error)}`);
  }
}

export async function analyzeWorkspacePhantomDiversification(workspaceId, holdings) {
  const pythonBin = resolvePythonBin();
  const payload = JSON.stringify({
    workspace_id: workspaceId,
    holdings,
  });

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
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        const errorPayload = stdout ? readJson(stdout) : null;
        const errorMessage = errorPayload?.error || stderr.trim() || `Phantom diversification analysis failed with exit code ${code}.`;
        reject(new Error(errorMessage));
        return;
      }
      const response = readJson(stdout);
      if (response?.error) {
        reject(new Error(String(response.error)));
        return;
      }
      resolve(response);
    });

    child.stdin.end(payload);
  });
}
