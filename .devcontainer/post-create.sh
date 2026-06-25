#!/usr/bin/env bash

set -euo pipefail

mkdir -p /workspaces/app-game

if [ ! -f /workspaces/app-game/package.json ] && [ -d /home/node/defaults ]; then
  cp -rn /home/node/defaults/. /workspaces/app-game/ 2>/dev/null || true
fi

pnpm config set --global store-dir /pnpm/store
