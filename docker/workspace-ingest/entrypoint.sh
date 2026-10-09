#!/usr/bin/env bash
#
# Phase 24a: the ingest worker's entrypoint (service `workspace-ingest`; freeze amendment F-3). It
# starts as root and, in this order:
#
#   1. raises the firewall (init-firewall.sh, default-deny egress, generated from the Workspace's by
#      fork-firewall.mjs). If it cannot be raised, nothing else runs: the container stops, and its
#      restart policy tries again;
#   2. makes /run/ingest (0700, owned by node): the worker touches its heartbeat file there, and the
#      healthcheck reads it;
#   3. drops to the `node` user with every capability gone, then runs the command (the worker).
#
# So no Node process ever runs as root, and the NET_ADMIN and NET_RAW capabilities compose.yaml adds
# exist only for step 1. No secret is read here: the firewall reads the database host from its file, the
# worker reads its two secrets itself. `node` is also in the group `exchange` (docker/workspace-ingest/
# Dockerfile), so it can remove what the parser wrote in /exchange. The parser service
# (`workspace-extract`) does NOT use this entrypoint: compose overrides it, and it has no root step.
# Exit 78 (EX_CONFIG) on a refusal.

set -euo pipefail

readonly EX_CONFIG=78
readonly FIREWALL=/app/docker/workspace-ingest/init-firewall.sh
readonly RUN_DIR=/run/ingest
readonly RUN_DIR_MODE=0700
readonly RUN_USER=node
readonly RUN_HOME=/home/node

fail() {
  echo "entrypoint: $*" >&2
  exit "$EX_CONFIG"
}

[ "$(id -u)" = 0 ] || fail "started as uid $(id -u), not root: the firewall cannot be raised, so nothing runs"
[ "$#" -gt 0 ] || fail "no command to run"

"$FIREWALL" >&2 || fail "the firewall could not be raised, so nothing runs without it"

# Made new on every start: a heartbeat file left by the last run would read as a live worker.
rm -rf "$RUN_DIR"
install -d -m "$RUN_DIR_MODE" -o "$RUN_USER" -g "$RUN_USER" "$RUN_DIR"

export HOME="$RUN_HOME" USER="$RUN_USER" LOGNAME="$RUN_USER"

# --init-groups: node's groups from /etc/group, `exchange` among them. No capability survives.
exec setpriv --reuid node --regid node --init-groups --inh-caps=-all --bounding-set=-all "$@"
