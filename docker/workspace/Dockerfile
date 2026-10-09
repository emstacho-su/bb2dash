# Phase 21: the Workspace image (brief 102 task 12; P-85, P-88). The runner (`workspace/`, W-64) takes
# queued questions from the database and answers each with one `claude -p` turn on Stack's
# subscription token, with one stdio MCP server beside it: the materials server (bb2dash's
# `mcp-server/`). Phase 24a removed the harness `rag` server and its model: retrieval is the runner's
# own, through `workspace-search`, and the materials server's `batch.js`.
#
#   docker compose -p bb2dash-wt21 --profile workspace build workspace     (before the merge)
#
# Built from the repo root (compose.yaml's `context: .`) through docker/workspace/Dockerfile.dockerignore,
# an allow-list of its own; the root .dockerignore, which is the sync image's, is not read. The pinned
# CA arrives through the named build context `harness-certs` (the harness checkout's certs/ folder).
#
# The in-image layout is frozen (brief 102, Seams, "W-64 and W-65"); workspace/test/mcp-config.test.ts
# pins the same literals:
#
#   /app/workspace/      package.json, node_modules, dist/ (runner.js, healthcheck.js, hooks/tool-gate.js),
#                        claude/settings.json, prompts/*.md
#   /app/mcp-materials/  package.json, node_modules, dist/index.js, dist/batch.js
#   /app/certs/          prod-ca.crt, root's and 0444: the one pinned CA. The runner checks the pooler's
#                        certificate against it (WORKSPACE_DB_CA_FILE)
#   /usr/local/share/npm-global/  Claude Code at its pinned version, owned by root
#   /app/turn/           empty, root's and 0555: the working directory of every `claude -p` turn
#   /home/node/.claude/  owned by node: compose mounts a tmpfs here (freeze amendment F-4)
#
# No secret is copied, passed as a build argument or set in the environment. The three secret files
# reach the container read-only under /run/secrets when it starts, and each is read by the one
# process that needs it (the runner, the materials server, the firewall).

ARG NODE_IMAGE=node:22-bookworm-slim

# --- runner: the Workspace runner, built from workspace/ -------------------------------------------
# Named paths only, never the folder whole: its README and test fixtures stay out of the image, and
# docker/grep-clean.test.mjs scans exactly what is copied here.
FROM ${NODE_IMAGE} AS runner
WORKDIR /build
COPY workspace/package.json workspace/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY workspace/tsconfig.json ./
COPY workspace/src ./src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# --- materials: the materials MCP server, built from mcp-server/ ------------------------------------
# The same steps as the `build` stage of mcp-server/Dockerfile (npm ci, npm run build, npm prune).
# Built here, never copied out of the bb2dash-mcp image, so this image does not depend on another
# image having been built first.
FROM ${NODE_IMAGE} AS materials
WORKDIR /build
COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mcp-server/tsconfig.json ./
COPY mcp-server/src ./src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# --- cli ----------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS cli

# One exact version (brief 102, "CLI pin"): never the moving tag the dev container defaults to and
# never the `stable` tag. 2.1.288 is the floor (its PreToolUse hook-skip fix and its headless SIGTERM
# fix); the runner's init-line check compares every turn against this same number, and task 9's
# fixtures are recorded on it. A bump is a deliberate change.
ARG CLAUDE_CODE_VERSION=2.1.289

# By the dev container's recipe (bb2dash-stack .devcontainer/Dockerfile, B-48), with the version
# written out: installed as node, into a prefix node owns for the length of the install.
RUN mkdir -p /usr/local/share/npm-global \
 && chown node:node /usr/local/share/npm-global
USER node
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"

# The pin cannot move by itself (102a, PM rulings T1): once the CLI is installed its folder is root's, so the
# node user every turn runs as can read and run it and cannot replace it; compose.yaml turns the
# CLI's own updater off as well (DISABLE_AUTOUPDATER=1). In a stage of its own because the package's
# install links its one large binary (about 250 MB) under two names, and a chown in a later layer of
# the runtime stage would store that binary a second time. The runtime stage takes the folder in one
# COPY, already root's.
USER root
RUN chown -R root:root /usr/local/share/npm-global

# --- runtime -----------------------------------------------------------------------------------------
FROM ${NODE_IMAGE}

# The firewall's tools (iptables and ip6tables, ipset, dig from dnsutils, curl with the CA bundle for
# its end check) and procps for task 12's process checks (ps, pgrep). No iproute2: no script in this
# image calls `ip` (the firewall reads the container's IPv6 addresses from /proc/net/if_inet6).
# setpriv, which the entrypoint drops privileges with, is util-linux and already in the base image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      dnsutils \
      ipset \
      iptables \
      procps \
 && rm -rf /var/lib/apt/lists/*

# The CLI's config folder exists here, owned by node, so a tmpfs mounted here (owned by node, by compose) takes
# that owner. The turns' working directory is root's and 0555 (102a, PM rulings V2), so the runtime
# user can neither write it nor change its mode: every turn loads project settings from its working
# directory, and a `.claude` folder planted there would be read by every later turn. The CLI keeps
# what it writes under CLAUDE_CONFIG_DIR.
RUN mkdir -p /home/node/.claude /app/turn \
 && chown node:node /home/node/.claude \
 && chown root:root /app/turn \
 && chmod 0555 /app/turn

# Claude Code from the `cli` stage, root's (see there). The two settings are the recipe's: its
# prefix, and its bin folder at the end of PATH.
COPY --from=cli /usr/local/share/npm-global /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

ENV NODE_ENV=production
WORKDIR /app

# /app/workspace: the runner package. Owned by root: the runner never writes to its own files.
COPY --from=runner /build/package.json /app/workspace/package.json
COPY --from=runner /build/node_modules /app/workspace/node_modules
COPY --from=runner /build/dist /app/workspace/dist
COPY workspace/claude /app/workspace/claude
COPY workspace/prompts /app/workspace/prompts

# /app/mcp-materials: the materials MCP server.
COPY --from=materials /build/package.json /app/mcp-materials/package.json
COPY --from=materials /build/node_modules /app/mcp-materials/node_modules
COPY --from=materials /build/dist /app/mcp-materials/dist

# /app/certs: the one pinned CA, for the database connection (102a, PM rulings V2). The runner
# verifies the bb2dash pooler's certificate against it whatever its DSN says (compose.yaml sets
# WORKSPACE_DB_CA_FILE to this path). Phase 24a: the rag server is gone, so this is the only reader.
# A public certificate from the harness checkout's certs/ folder. A plain COPY, so the file and
# the folder COPY makes for it are root's; then 0444 whatever mode the build host gave the file.
# The runtime user can read it and cannot replace it.
COPY --from=harness-certs prod-ca.crt /app/certs/prod-ca.crt
RUN chmod 0444 /app/certs/prod-ca.crt

# The root entrypoint and the firewall it raises. Root's files in a root-owned folder: nothing the
# node user can write is ever read by either.
COPY docker/workspace/entrypoint.sh docker/workspace/init-firewall.sh /app/docker/workspace/
# A Windows checkout may hand over CRLF; a shebang line must end in LF.
RUN sed -i 's/\r$//' /app/docker/workspace/entrypoint.sh /app/docker/workspace/init-firewall.sh \
 && chmod 0755 /app/docker/workspace/entrypoint.sh /app/docker/workspace/init-firewall.sh

# The container starts as root on purpose: the entrypoint raises the default-deny firewall, makes
# /run/workspace, then drops to `node` (setpriv, every capability gone) before any Node or `claude`
# process starts. There is no USER line for that reason, and compose.yaml sets no `user:`.
ENTRYPOINT ["/app/docker/workspace/entrypoint.sh"]
CMD ["node", "/app/workspace/dist/runner.js"]
