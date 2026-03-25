#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REFRESH_SCRIPT="$ROOT_DIR/scripts/refresh_blsprime_local.sh"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-300}"
APP_NAME="${BLS_PRIME_APP_NAME:-${NEXT_PUBLIC_BLS_APP_NAME:-Allocator Workspace}}"
ARGS=()

usage() {
  cat <<'EOF'
usage: run_blsprime_autorefresh.sh [--push] [--skip-portfolio-manager] [--python /path/to/python]

Runs refresh_blsprime_local.sh in a loop every INTERVAL_SECONDS seconds (default: 300).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push|--skip-portfolio-manager)
      ARGS+=("$1")
      shift
      ;;
    --python|--commit-message)
      ARGS+=("$1" "$2")
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

trap 'printf "\nStopping auto-refresh loop.\n"; exit 0' INT TERM

printf 'Starting %s auto-refresh loop (interval=%ss)\n' "$APP_NAME" "$INTERVAL_SECONDS"

while true; do
  printf '\n[%s] Running refresh...\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  if "$REFRESH_SCRIPT" "${ARGS[@]}"; then
    printf '[%s] Refresh succeeded.\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  else
    printf '[%s] Refresh failed. Waiting for next interval.\n' "$(date '+%Y-%m-%d %H:%M:%S')" >&2
  fi
  sleep "$INTERVAL_SECONDS"
done
