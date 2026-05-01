mkdir -p /workspaces 
if [ ! -f /workspaces/package.json ] && [ -f /workspaces/package.json ]; then
  cp -rn /workspaces/. /workspaces/ 2>/dev/null || true;
fi

if [ ! -f /workspaces/app-game/package.json ]; then
  cp -rn /home/node/defaults/. /workspaces/ 2>/dev/null || true;
fi

pnpm config set --global store-dir /pnpm/store