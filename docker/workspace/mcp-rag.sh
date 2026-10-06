#!/usr/bin/env bash
#
# The harness `rag` MCP server inside the Workspace container (brief 102 task 12), started by the
# CLI from /run/workspace/mcp.json as `bash /app/mcp-rag/mcp-rag.sh`. Shaped on bb2dash-stack's
# scripts/mcp-rag.sh, with every path fixed to this image's layout.
#
# The Workspace service never has a DATABASE_URL in its environment: in bb2dash's own docs that
# name means the bb2dash database, and the rag server refuses a URL naming that project. The
# harness store's URL is read here, from the harness_database_url secret file, and handed to the
# server process alone as the DATABASE_URL it expects. The MCP config carries no value (it holds
# paths only), and nothing here prints the URL.
#
# TLS is set the way the live harness-jobs service sets it: DATABASE_SSL empty, so the connection
# is encrypted and the server's certificate is checked against the pinned CA in this image. The
# embedding model is the copy baked into the image: the firewall refuses the model's host, so a
# search must never need a download.

set -euo pipefail

readonly HERE=/app/mcp-rag
readonly SECRET_FILE=/run/secrets/harness_database_url
readonly SERVER="$HERE/dist/index.js"
readonly CA_CERT="$HERE/certs/prod-ca.crt"
readonly MODEL_DIR=/opt/fastembed
readonly EX_CONFIG=78

fail() {
  echo "mcp-rag: $*" >&2
  exit "$EX_CONFIG"
}

[ -r "$SECRET_FILE" ] || fail "$SECRET_FILE is not readable"
# Without the byte-order mark, CR or LF a Windows editor leaves behind.
url="$(LC_ALL=C sed '1s/^\xEF\xBB\xBF//' "$SECRET_FILE" | tr -d '\r\n')"
[ -n "$url" ] || fail "$SECRET_FILE is empty"

[ -r "$CA_CERT" ] || fail "$CA_CERT is not readable (the image is built with the harness certs/ folder)"
[ -f "$SERVER" ] || fail "$SERVER is missing (the image builds the harness mcp-server in its rag stage)"
[ -d "$MODEL_DIR" ] || fail "$MODEL_DIR is missing (the image bakes the embedding model at build time)"

DATABASE_URL="$url" \
  DATABASE_SSL="" \
  DATABASE_CA_CERT="$CA_CERT" \
  FASTEMBED_CACHE_DIR="$MODEL_DIR" \
  exec node "$SERVER"
