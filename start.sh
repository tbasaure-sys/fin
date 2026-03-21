#!/bin/bash
# Finds libstdc++.so.6 in the Nix store and exports it before starting gunicorn.
# Needed because numpy C-extensions require libstdc++ which Nix puts in /nix/store.
STDCPP=$(find /nix/store -name "libstdc++.so.6" -not -path "*/dev/*" 2>/dev/null | head -1)
if [ -n "$STDCPP" ]; then
  export LD_LIBRARY_PATH="$(dirname $STDCPP):${LD_LIBRARY_PATH:-}"
fi
exec python3.11 -m gunicorn 'meta_alpha_allocator.dashboard.wsgi:create_app()' \
  --workers 1 --threads 4 --timeout 120 \
  --bind "0.0.0.0:${PORT:-8000}" \
  --log-level info
