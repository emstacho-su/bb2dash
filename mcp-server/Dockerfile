# bb2dash materials MCP server as an image (brief 100 task 17, R-91).
#
# stdio only: no port, no daemon. A host Claude Code starts one container per session with
# `docker run -i --rm` (README, "Register with Claude Code"), and the container exits when the
# client closes stdin. Non-root. The service key is never in a layer, a build arg or the
# environment: it is mounted read-only at /run/secrets/bb2dash_mcp_service_key and the server
# reads it from the path SUPABASE_SERVICE_ROLE_FILE names (src/env-file.ts).
#
#   docker build -t bb2dash-mcp:local mcp-server
#   docker compose --profile mcp build bb2dash-mcp        (the same image, from the repo root)

FROM node:22-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
# Owned by root and only readable by `node`: the server never writes to its own files.
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/dist ./dist
USER node
ENTRYPOINT ["node", "dist/index.js"]
