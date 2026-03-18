#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$ROOT_DIR/.venv/bin/python}"
PORTFOLIO_MANAGER_PYTHON_BIN="${PORTFOLIO_MANAGER_PYTHON_BIN:-$PYTHON_BIN}"
REDACT_SCRIPT="$ROOT_DIR/scripts/redact_dashboard_artifact.py"
SOURCE_DIR="$ROOT_DIR/output/dashboard/latest"
ARTIFACT_DIR="$ROOT_DIR/artifacts/dashboard/latest"
REMOTE_UPLOAD_URL="${BLS_PRIME_REMOTE_SNAPSHOT_PUT_URL:-${META_ALLOCATOR_REMOTE_SNAPSHOT_PUT_URL:-}}"
REMOTE_UPLOAD_METHOD="${BLS_PRIME_REMOTE_SNAPSHOT_UPLOAD_METHOD:-PUT}"
SKIP_PORTFOLIO_MANAGER=0
PUSH_ARTIFACTS=0
COMMIT_MESSAGE=""

usage() {
  cat <<'EOF'
usage: refresh_blsprime_local.sh [--push] [--skip-portfolio-manager] [--python /path/to/python] [--commit-message "msg"]

Runs a local dashboard refresh using the private data roots available on this machine,
publishes the redacted artifact to artifacts/dashboard/latest, and optionally commits/pushes it.
EOF
}

log_step() {
  printf '\n==> %s\n' "$1"
}

pick_existing_dir() {
  local candidate
  for candidate in "$@"; do
    if [[ -n "$candidate" && -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

require_file() {
  local path="$1"
  local label="$2"
  if [[ ! -f "$path" ]]; then
    printf 'Missing %s at %s\n' "$label" "$path" >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      PUSH_ARTIFACTS=1
      shift
      ;;
    --skip-portfolio-manager)
      SKIP_PORTFOLIO_MANAGER=1
      shift
      ;;
    --python)
      PYTHON_BIN="$2"
      shift 2
      ;;
    --commit-message)
      COMMIT_MESSAGE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

require_file "$PYTHON_BIN" "Python executable"
require_file "$REDACT_SCRIPT" "artifact redaction script"

if [[ -n "$REMOTE_UPLOAD_URL" ]]; then
  # Broken shell pastes can leave embedded whitespace in env vars. URLs here should not contain
  # any spaces, tabs, or newlines, so strip all whitespace before handing off to curl.
  REMOTE_UPLOAD_URL="$(printf '%s' "$REMOTE_UPLOAD_URL" | tr -d '[:space:]')"
fi

DEFAULT_FIN_MODEL_ROOT="$(pick_existing_dir \
  "${ROOT_DIR}/_local_data/finance/Fin_model" \
  "${HOME}/code/Fin_model" \
  "${HOME}/Fin_model" || true)"
DEFAULT_CARIA_DATA_ROOT="$(pick_existing_dir \
  "${HOME}/data/caria_publication/data" \
  "${ROOT_DIR}/_local_data/ct/caria_data" || true)"
DEFAULT_PORTFOLIO_ROOT="$(pick_existing_dir \
  "${HOME}/code/portfolio_manager" \
  "${ROOT_DIR}/_local_data/finance/portfolio_manager" || true)"

export META_ALLOCATOR_FIN_MODEL_ROOT="${META_ALLOCATOR_FIN_MODEL_ROOT:-$DEFAULT_FIN_MODEL_ROOT}"
export META_ALLOCATOR_CARIA_DATA_ROOT="${META_ALLOCATOR_CARIA_DATA_ROOT:-$DEFAULT_CARIA_DATA_ROOT}"
export META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT="${META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT:-$DEFAULT_PORTFOLIO_ROOT}"
export PYTHONPATH="${ROOT_DIR}/src${PYTHONPATH:+:${PYTHONPATH}}"

if [[ -z "${META_ALLOCATOR_FIN_MODEL_ROOT:-}" ]]; then
  printf 'Could not resolve META_ALLOCATOR_FIN_MODEL_ROOT.\n' >&2
  exit 1
fi

if [[ -z "${META_ALLOCATOR_CARIA_DATA_ROOT:-}" ]]; then
  printf 'Could not resolve META_ALLOCATOR_CARIA_DATA_ROOT.\n' >&2
  exit 1
fi

if [[ -z "${META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT:-}" ]]; then
  printf 'Could not resolve META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT.\n' >&2
  exit 1
fi

require_file "${META_ALLOCATOR_FIN_MODEL_ROOT}/data_processed/tension_metrics.csv" "Fin_model tension metrics"
require_file "${META_ALLOCATOR_CARIA_DATA_ROOT}/sp500_universe_fmp.parquet" "caria sp500_universe_fmp.parquet"
require_file "${META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT}/output/latest/holdings_normalized.csv" "portfolio holdings"
require_file "${META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT}/output/latest/screener.csv" "portfolio screener"
require_file "${META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT}/output/latest/valuation_summary.csv" "portfolio valuation summary"

if [[ $SKIP_PORTFOLIO_MANAGER -eq 0 ]]; then
  if [[ -f "${META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT}/config/defaults.yaml" ]]; then
    log_step "Refreshing portfolio_manager outputs"
    (
      cd "${META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT}"
      "${PORTFOLIO_MANAGER_PYTHON_BIN}" -m portfolio_manager.cli --config ./config/defaults.yaml
    )
  else
    printf 'Skipping portfolio_manager refresh; using existing latest CSVs at %s\n' "${META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT}/output/latest"
  fi
fi

log_step "Refreshing dashboard snapshot"
(
  cd "$ROOT_DIR"
  "${PYTHON_BIN}" -m meta_alpha_allocator.cli dashboard refresh >/tmp/blsprime_dashboard_refresh.json
)

log_step "Publishing redacted artifact"
mkdir -p "$ARTIFACT_DIR"
"${PYTHON_BIN}" "$REDACT_SCRIPT" "$SOURCE_DIR" "$ARTIFACT_DIR" >/dev/null

if [[ -n "$REMOTE_UPLOAD_URL" ]]; then
  log_step "Uploading snapshot to remote storage"
  if [[ ! "$REMOTE_UPLOAD_URL" =~ ^https?:// ]]; then
    printf 'Remote snapshot upload URL is invalid after sanitization: %q\n' "$REMOTE_UPLOAD_URL" >&2
    exit 1
  fi
  curl --fail --silent --show-error \
    -X "$REMOTE_UPLOAD_METHOD" \
    -H "content-type: application/json" \
    --data-binary "@${ARTIFACT_DIR}/dashboard_snapshot.json" \
    "$REMOTE_UPLOAD_URL" >/dev/null
fi

log_step "Current artifact stamp"
export BLS_PRIME_ARTIFACT_PATH="${ARTIFACT_DIR}/dashboard_snapshot.json"
"${PYTHON_BIN}" - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["BLS_PRIME_ARTIFACT_PATH"])
payload = json.loads(path.read_text(encoding="utf-8").replace("NaN", "null"))
print(f"generated_at={payload.get('generated_at')}")
print(f"as_of_date={payload.get('as_of_date')}")
status = payload.get("status", {}) or {}
print(f"contract_status={status.get('contract_status')}")
PY

if [[ $PUSH_ARTIFACTS -eq 1 ]]; then
  log_step "Committing artifact"
  (
    cd "$ROOT_DIR"
    git add artifacts/dashboard/latest
    if git diff --cached --quiet -- artifacts/dashboard/latest; then
      printf 'No artifact changes detected.\n'
      exit 0
    fi
    if [[ -z "$COMMIT_MESSAGE" ]]; then
      COMMIT_MESSAGE="Refresh dashboard artifact"
    fi
    git commit -m "$COMMIT_MESSAGE"
    git push origin main
  )
fi

printf '\nRefresh complete.\n'
