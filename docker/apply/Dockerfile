# Phase 23: the apply image. The worker (`apply/`) takes queued inbox_feedback requests from the
# database, archives the answers that need no reading itself, and runs /inbox-apply with one
# `claude -p` run on Stack's subscription token for the rest, with two stdio MCP servers beside it:
# the worker's own SQL server (role inbox_apply_runner) and the materials server (`mcp-server/`).
#
#   docker compose -p bb2dash-wt23 --profile apply build apply     (before the merge)
#
# Phase 21's Workspace image (docker/workspace/Dockerfile) without the notes store: the same base,
# the same pinned CLI by the same recipe, the same root-owned layout and the same entrypoint and
# firewall (docker/apply/init-firewall.sh is generated from the Workspace's; see fork-firewall.mjs).
# Built from the repo root through docker/apply/Dockerfile.dockerignore; the pinned CA arrives
# through the named build context `harness-certs`.
#
# The in-image layout (apply/src/config.ts pins the same literals):
#
#   /app/apply/          package.json, node_modules, dist/ (main.js, healthcheck.js,
#                        hooks/tool-gate.js, mcp-sql/server.js), claude/settings.json
#   /app/apply/run/      root's and 0555: the working directory of every `claude -p` run. It holds
#                        .claude/skills/inbox-apply (SKILL.md, context.md, writer.md) and nothing else
#   /app/mcp-materials/  package.json, node_modules, dist/index.js
#   /app/certs/          prod-ca.crt, root's and 0444: the one pinned CA for the database connection
#   /usr/local/share/npm-global/  Claude Code at its pinned version, owned by root
#   /home/node/.claude/  owned by node: the apply-claude-home volume mounts here
#
# No secret is copied, passed as a build argument or set in the environment. The three secret files
# reach the container read-only under /run/secrets when it starts, and each is read by the one
# process that needs it (the worker and its SQL server, the materials server, the firewall).

ARG NODE_IMAGE=node:22-bookworm-slim

# --- worker: the apply worker, bundled from apply/src and the workspace/src modules it imports ------
FROM ${NODE_IMAGE} AS worker
WORKDIR /build/apply
COPY apply/package.json apply/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apply/src ./src
# The Phase 21 modules the bundle takes in (the subscription guard, the token and CA readers, the
# verified database connection, the CLI process): source only, beside apply/ as in the repo.
COPY workspace/src /build/workspace/src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# --- materials: the materials MCP server, built from mcp-server/ ------------------------------------
FROM ${NODE_IMAGE} AS materials
WORKDIR /build
COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mcp-server/tsconfig.json ./
COPY mcp-server/src ./src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# --- cli: Claude Code at its pinned version ----------------------------------------------------------
FROM ${NODE_IMAGE} AS cli

# One exact version, the Workspace's (workspace/src/config.ts CLAUDE_CODE_VERSION): the worker's
# init-line check compares every run against it, and this phase's spike was recorded on it. A bump
# is a deliberate change, made in both images.
ARG CLAUDE_CODE_VERSION=2.1.289

RUN mkdir -p /usr/local/share/npm-global \
 && chown node:node /usr/local/share/npm-global
USER node
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"

# The pin cannot move by itself: once installed the CLI's folder is root's, so the node user every
# run is made as can read and run it and cannot replace it.
USER root
RUN chown -R root:root /usr/local/share/npm-global

# --- runtime -----------------------------------------------------------------------------------------
FROM ${NODE_IMAGE}

# The firewall's tools (iptables and ip6tables, ipset, dig from dnsutils, curl with the CA bundle for
# its end check) and procps. setpriv, which the entrypoint drops privileges with, is in the base image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      dnsutils \
      ipset \
      iptables \
      procps \
 && rm -rf /var/lib/apt/lists/*

# The CLI's config folder exists here, owned by node, so a new apply-claude-home volume takes that
# owner. The CLI keeps what it writes under CLAUDE_CONFIG_DIR.
RUN mkdir -p /home/node/.claude \
 && chown node:node /home/node/.claude

COPY --from=cli /usr/local/share/npm-global /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

ENV NODE_ENV=production
WORKDIR /app

# /app/apply: the worker package. Owned by root: the worker never writes to its own files.
COPY --from=worker /build/apply/package.json /app/apply/package.json
COPY --from=worker /build/apply/node_modules /app/apply/node_modules
COPY --from=worker /build/apply/dist /app/apply/dist
COPY apply/claude /app/apply/claude

# /app/apply/run: the working directory of every run, with the skill as a project skill. The CLI
# loads project settings and skills from its working directory, so a file planted here would be
# read by every later run: the folder and everything in it are root's, and it is 0555.
COPY skills/inbox-apply /app/apply/run/.claude/skills/inbox-apply
RUN chown -R root:root /app/apply/run \
 && chmod -R a-w /app/apply/run \
 && chmod 0555 /app/apply/run

# /app/mcp-materials: the materials MCP server.
COPY --from=materials /build/package.json /app/mcp-materials/package.json
COPY --from=materials /build/node_modules /app/mcp-materials/node_modules
COPY --from=materials /build/dist /app/mcp-materials/dist

# /app/certs: the one pinned CA. The worker and its SQL server verify the pooler's certificate
# against it whatever the DSN says. A public certificate from the harness checkout's certs/ folder.
COPY --from=harness-certs prod-ca.crt /app/certs/prod-ca.crt
RUN chmod 0444 /app/certs/prod-ca.crt

# The root entrypoint and the firewall it raises. Root's files in a root-owned folder.
COPY docker/apply/entrypoint.sh docker/apply/init-firewall.sh /app/docker/apply/
# A Windows checkout may hand over CRLF; a shebang line must end in LF.
RUN sed -i 's/\r$//' /app/docker/apply/entrypoint.sh /app/docker/apply/init-firewall.sh \
 && chmod 0755 /app/docker/apply/entrypoint.sh /app/docker/apply/init-firewall.sh

# The container starts as root on purpose: the entrypoint raises the default-deny firewall, makes
# /run/apply, then drops to `node` (setpriv, every capability gone) before any Node or `claude`
# process starts. There is no USER line for that reason, and compose.yaml sets no `user:`.
ENTRYPOINT ["/app/docker/apply/entrypoint.sh"]
CMD ["node", "/app/apply/dist/main.js"]
