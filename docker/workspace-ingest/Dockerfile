# Phase 24a: the ingest image, one image for two services (brief 109, "Uploads and extraction" and the
# freeze amendment F-3). Built once as bb2dash-workspace-ingest:local, run as:
#
#   workspace-ingest   the worker: `node /app/workspace-ingest/dist/main.js` behind the root entrypoint
#                      (firewall, then `node`). Holds two secret files and a network.
#   workspace-extract  the parser's loop: `node /app/workspace-ingest/dist/parser-main.js`, entrypoint
#                      overridden by compose, user `extract`. Holds no secret, no network, a read-only root.
#
# They meet only in /exchange (a tmpfs volume). Built from the repo root (compose.yaml's `context: .`)
# through docker/workspace-ingest/Dockerfile.dockerignore, an allow-list of its own.
#
# In-image layout (workspace-ingest/README.md has the same list):
#
#   /app/workspace-ingest/   package.json, node_modules (pg), dist/ (main.js, parser-main.js, healthcheck.js)
#   /app/ingest/             pyproject.toml, uv.lock, .venv (the locked set, built here), extract_text.py,
#                            pull_files.mjs, fetch_signed.mjs, embed_corpus.mjs; root's, read by everyone
#   /opt/uv-python/          the Python 3.12 uv manages (bookworm's own is 3.11 and the lock wants 3.12)
#   /app/certs/prod-ca.crt   root's and 0444: the one pinned CA the worker verifies the pooler against
#   /exchange/               root:exchange, 0770, no sticky bit: `node` (worker) and `extract` (parser) are
#                            both in the group `exchange`, and either can remove what the other wrote.
#                            Compose mounts a tmpfs volume here with the same owner and mode.
#
# No secret is copied, passed as a build argument or set in the environment. The worker's two secret
# files arrive under /run/secrets when it starts.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.12.19

FROM ${UV_IMAGE} AS uv

# --- build: the bundle (esbuild over workspace-ingest/src; workspace/src's config, db and alive bundled in) ---
FROM ${NODE_IMAGE} AS build
WORKDIR /build
COPY workspace-ingest/package.json workspace-ingest/package-lock.json workspace-ingest/
RUN cd workspace-ingest && npm ci --no-audit --no-fund
COPY workspace-ingest/tsconfig.json workspace-ingest/
COPY workspace-ingest/src workspace-ingest/src
COPY workspace/src workspace/src
RUN cd workspace-ingest && npm run build && npm prune --omit=dev --no-audit --no-fund

# --- runtime ---
FROM ${NODE_IMAGE}

# The firewall's tools (iptables and ip6tables, ipset, dig from dnsutils, curl with the CA bundle for its
# end check) and pdftotext (poppler-utils) for extract_text.py. setpriv, which the entrypoint drops
# privileges with, is util-linux and already in the base image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      dnsutils \
      ipset \
      iptables \
      poppler-utils \
 && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /usr/local/bin/uv

# The parser's user, and the group both services share for /exchange. Same number for the user and its
# primary group; no home, no shell. `node` joins the group, so setpriv --init-groups gives the worker
# the group and it can remove the parser's files.
RUN groupadd --gid 1100 exchange \
 && useradd --uid 1100 --gid 1100 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin extract \
 && usermod --append --groups exchange node \
 && install -d -m 0770 -o root -g exchange /exchange

# The locked set, installed at build so `uv run --locked` needs no network at run time: a Python 3.12
# that uv manages (kept in /opt/uv-python), no cache left in the layer. Copied before the scripts, so a
# change to a script never re-downloads the libraries. Everything stays root's and is made readable by all.
WORKDIR /app
RUN mkdir -p /app/ingest /app/certs
COPY ingest/pyproject.toml ingest/uv.lock ingest/
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    UV_NO_CACHE=1
RUN uv python install 3.12 \
 && uv sync --locked --project /app/ingest \
 && chmod -R a+rX /opt/uv-python /app/ingest
# From here on nothing downloads: the parser has no network, and uv must not try.
ENV UV_PYTHON_DOWNLOADS=never \
    UV_OFFLINE=1 \
    PYTHONDONTWRITEBYTECODE=1

# Only what the two services run: the extractor and the helpers the bundle imports.
COPY ingest/extract_text.py ingest/pull_files.mjs ingest/fetch_signed.mjs ingest/embed_corpus.mjs ingest/

COPY --from=build /build/workspace-ingest/package.json workspace-ingest/package.json
COPY --from=build /build/workspace-ingest/node_modules workspace-ingest/node_modules
COPY --from=build /build/workspace-ingest/dist workspace-ingest/dist

# The pinned CA: a public certificate from the harness checkout's certs/ folder, root's and 0444.
COPY --from=harness-certs prod-ca.crt /app/certs/prod-ca.crt
RUN chmod 0444 /app/certs/prod-ca.crt

COPY docker/workspace-ingest/entrypoint.sh docker/workspace-ingest/init-firewall.sh /app/docker/workspace-ingest/
# A Windows checkout may hand over CRLF; a shebang line must end in LF.
RUN sed -i 's/\r$//' /app/docker/workspace-ingest/entrypoint.sh /app/docker/workspace-ingest/init-firewall.sh \
 && chmod 0755 /app/docker/workspace-ingest/entrypoint.sh /app/docker/workspace-ingest/init-firewall.sh

ENV NODE_ENV=production \
    WORKSPACE_DB_CA_FILE=/app/certs/prod-ca.crt

ENTRYPOINT ["/app/docker/workspace-ingest/entrypoint.sh"]
CMD ["node", "/app/workspace-ingest/dist/main.js"]
