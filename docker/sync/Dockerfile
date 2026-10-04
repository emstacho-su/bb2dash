# Phase 14 — the sync image (brief 100 task 15; R-82, R-89, R-94, P-102). The runner (`sync/`, W-55)
# drives Chromium headful on Xvfb, shown through x11vnc + noVNC for Stack's Duo login, as the non-root
# `pwuser` under Playwright's seccomp profile. It also runs task 14's locked extractor
# (`uv run --locked --project ingest`, pdftotext from poppler-utils) and `ingest/embed_corpus.mjs`.
#
# Built from the repo root (compose.yaml's `context: .`); the root `.dockerignore` is an allow-list.
# No secret is copied, passed as a build argument or set in the environment: the runner and the
# entrypoint read their files from /run/secrets at run time.

ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.12.19

FROM ${UV_IMAGE} AS uv

# --- build: the runner's bundle (esbuild over sync/src; desktop/src/core/sync-id.ts is bundled in) ---
FROM ${PLAYWRIGHT_IMAGE} AS build
WORKDIR /app
COPY sync/package.json sync/package-lock.json sync/
RUN cd sync && npm ci --no-audit --no-fund
COPY sync/tsconfig.json sync/
COPY sync/src sync/src
COPY desktop/src/core/sync-id.ts desktop/src/core/sync-id.ts
RUN cd sync && npm run build && npm prune --omit=dev --no-audit --no-fund

# --- runtime ---
FROM ${PLAYWRIGHT_IMAGE}

# The display stack (P-103), as the spike ran it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify \
 && rm -rf /var/lib/apt/lists/*

# Task 14: pdftotext for extract_text.py. Noble's python3 is 3.12, which `requires-python` pins.
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils \
 && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /usr/local/bin/uv

# The profile and the course-files mount points exist here, owned by pwuser, so a fresh named
# volume takes that owner; pwuser owns ingest/ so `uv` can make ingest/.venv in it.
WORKDIR /app
RUN mkdir -p /home/pwuser/bb-profile "/app/course context" /app/ingest \
 && chown pwuser:pwuser /home/pwuser/bb-profile "/app/course context" /app/ingest

# Task 14's locked set, installed at build so the runner's `uv run --locked` needs no network:
# noble's Python 3.12, never a downloaded one, no cache left in the layer. Copied before the scripts,
# so a change to a script never re-downloads the libraries.
COPY ingest/pyproject.toml ingest/uv.lock ingest/
USER pwuser
ENV UV_PYTHON_DOWNLOADS=never \
    UV_NO_CACHE=1
RUN uv sync --locked --project /app/ingest
USER root

COPY --from=build /app/sync/package.json sync/package.json
COPY --from=build /app/sync/node_modules sync/node_modules
COPY --from=build /app/sync/dist sync/dist
# Only what the runner runs (the crawler, the extractor, the pull helpers, the signed fetch, the embed
# loop) and task 14's in-image check (its test and fixtures). Not ingest's notes, eval or other scripts.
COPY ingest/bb_crawler.js ingest/extract_text.py ingest/pull_files.mjs ingest/fetch_signed.mjs \
     ingest/embed_corpus.mjs ingest/extract_text.test.mjs ingest/
COPY ingest/fixtures/extract/ ingest/fixtures/extract/
COPY docker/sync/entrypoint.sh docker/sync/entrypoint.sh
# A Windows checkout may hand over CRLF; the shebang line must end in LF.
RUN sed -i 's/\r$//' docker/sync/entrypoint.sh && chmod 0755 docker/sync/entrypoint.sh

USER pwuser
ENV DISPLAY=:99 \
    BB_PROFILE_DIR=/home/pwuser/bb-profile \
    COURSE_FILES_DIR="/app/course context" \
    UV_OFFLINE=1

EXPOSE 6080
ENTRYPOINT ["/app/docker/sync/entrypoint.sh"]
CMD ["node", "sync/dist/main.js"]
