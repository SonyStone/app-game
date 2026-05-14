FROM mcr.microsoft.com/devcontainers/javascript-node:22

RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
  jq \
  ripgrep \
  tree \
  && mkdir -p /pnpm/store /workspaces/repos \
  && chown -R node:node /pnpm /workspaces \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspaces/app-game
