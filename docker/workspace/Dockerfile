# Phase 21: the Workspace image (brief 102 task 12; P-85, P-88). The runner (`workspace/`, W-64) takes
# queued questions from the database and answers each with one `claude -p` turn on Stack's
# subscription token, with two stdio MCP servers beside it: the materials server (bb2dash's
# `mcp-server/`) and the harness `rag` server (the harness repo's `mcp-server/`).
#
#   docker compose -p bb2dash-wt21 --profile workspace build workspace     (before the merge)
#
# Built from the repo root (compose.yaml's `context: .`) through docker/workspace/Dockerfile.dockerignore,
# an allow-list of its own; the root .dockerignore, which is the sync image's, is not read. The harness
# source arrives through two named build contexts compose.yaml declares: `harness-mcp` (its
# mcp-server/ folder) and `harness-certs` (its certs/ folder). linux/amd64 only: the rag server's
# tokenizer has no linux-arm64 build.
#
# The in-image layout is frozen (brief 102, Seams, "W-64 and W-65"); workspace/test/mcp-config.test.ts
# pins the same literals:
#
#   /app/workspace/      package.json, node_modules, dist/ (runner.js, healthcheck.js, hooks/tool-gate.js),
#                        claude/settings.json, prompts/system.md
#   /app/mcp-materials/  package.json, node_modules, dist/index.js
#   /app/mcp-rag/        package.json, node_modules, dist/, certs/prod-ca.crt, mcp-rag.sh
#   /opt/fastembed/      the rag server's embedding model, baked in: nothing is downloaded at run time
#   /app/turn/           empty, owned by node: the working directory of every `claude -p` turn
#   /home/node/.claude/  owned by node: the workspace-claude-home volume mounts here
#
# No secret is copied, passed as a build argument or set in the environment. The four secret files
# reach the container read-only under /run/secrets when it starts, and each is read by the one
# process that needs it (the runner, the materials server, the rag launcher, the firewall).

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

# --- rag: the harness rag MCP server, built from the harness checkout --------------------------------
# Only its sources: never the host's node_modules, dist or .fastembed-cache (a Windows node_modules
# holds Windows binaries). Whatever is checked out in the harness folder is what gets baked; 102a
# records `git -C <harness> rev-parse HEAD` at build time.
FROM ${NODE_IMAGE} AS rag
WORKDIR /build
# onnxruntime-node's install script otherwise downloads its CUDA provider, which a CPU-only
# container never loads.
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip
COPY --from=harness-mcp package.json package-lock.json tsconfig.json ./
RUN npm ci --no-audit --no-fund
COPY --from=harness-mcp src ./src
COPY --from=harness-mcp scripts ./scripts
# The embedding model is baked by loading the built server's own embedder once: the script needs no
# database, downloads the model into /opt/fastembed and fails the build if the vectors are not the
# shape the store holds. At run time the firewall refuses the model's host, so the model must be
# here. Readable by every user, writable by root alone.
RUN npm run build \
 && FASTEMBED_CACHE_DIR=/opt/fastembed node scripts/verify-embedder.mjs \
 && npm prune --omit=dev --no-audit --no-fund \
 && chmod -R u=rwX,go=rX /opt/fastembed

# --- runtime -----------------------------------------------------------------------------------------
FROM ${NODE_IMAGE}

# One exact version (brief 102, "CLI pin"): never the moving tag the dev container defaults to and
# never the `stable` tag. 2.1.288 is the floor (its PreToolUse hook-skip fix and its headless SIGTERM
# fix); the runner's init-line check compares every turn against this same number, and task 9's
# fixtures are recorded on it. A bump is a deliberate change.
ARG CLAUDE_CODE_VERSION=2.1.289

# The firewall's tools (iptables and ip6tables, ipset, dig from dnsutils, ip from iproute2, curl with
# the CA bundle for its end check) and procps for task 12's process check. setpriv, which the
# entrypoint drops privileges with, is util-linux and already in the base image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      dnsutils \
      iproute2 \
      ipset \
      iptables \
      procps \
 && rm -rf /var/lib/apt/lists/*

# The CLI's config folder and the turns' working directory exist here, owned by node, so a new
# workspace-claude-home volume takes that owner; the npm prefix is node's for the install below.
RUN mkdir -p /home/node/.claude /app/turn /usr/local/share/npm-global \
 && chown node:node /home/node/.claude /app/turn /usr/local/share/npm-global

# Claude Code, by the dev container's recipe (bb2dash-stack .devcontainer/Dockerfile, B-48), with the
# version written out.
USER node
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force
USER root

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

# /app/mcp-rag: the harness rag MCP server, its pinned CA and its launcher; the model beside it.
COPY --from=rag /build/package.json /app/mcp-rag/package.json
COPY --from=rag /build/node_modules /app/mcp-rag/node_modules
COPY --from=rag /build/dist /app/mcp-rag/dist
COPY --from=rag /opt/fastembed /opt/fastembed
COPY --from=harness-certs prod-ca.crt /app/mcp-rag/certs/prod-ca.crt
COPY docker/workspace/mcp-rag.sh /app/mcp-rag/mcp-rag.sh

# The root entrypoint and the firewall it raises. Root's files in a root-owned folder: nothing the
# node user can write is ever read by either.
COPY docker/workspace/entrypoint.sh docker/workspace/init-firewall.sh /app/docker/workspace/
# A Windows checkout may hand over CRLF; a shebang line must end in LF.
RUN sed -i 's/\r$//' /app/docker/workspace/entrypoint.sh /app/docker/workspace/init-firewall.sh /app/mcp-rag/mcp-rag.sh \
 && chmod 0755 /app/docker/workspace/entrypoint.sh /app/docker/workspace/init-firewall.sh /app/mcp-rag/mcp-rag.sh

# The container starts as root on purpose: the entrypoint raises the default-deny firewall, makes
# /run/workspace, then drops to `node` (setpriv, every capability gone) before any Node or `claude`
# process starts. There is no USER line for that reason, and compose.yaml sets no `user:`.
ENTRYPOINT ["/app/docker/workspace/entrypoint.sh"]
CMD ["node", "/app/workspace/dist/runner.js"]
