#!/usr/bin/env bash
# Installs backend and frontend dependencies without lifecycle scripts, retrying once on transient registry errors.
# The only script the build needs, Prisma client generation, runs explicitly from the locked prisma package.
set -euo pipefail

for pkg in backend frontend; do
  npm ci --prefix "$pkg" --ignore-scripts --no-audit --no-fund || { sleep 10; npm ci --prefix "$pkg" --ignore-scripts --no-audit --no-fund; }
done
npm --prefix backend run db:generate
