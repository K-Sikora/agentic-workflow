#!/usr/bin/env bash
# Installs backend and frontend dependencies, retrying once on transient registry errors.
set -euo pipefail

for pkg in backend frontend; do
  npm ci --prefix "$pkg" --no-audit --no-fund || { sleep 10; npm ci --prefix "$pkg" --no-audit --no-fund; }
done
