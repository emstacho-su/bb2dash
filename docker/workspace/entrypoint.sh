#!/usr/bin/env bash
#
# Phase 21: the Workspace container's entrypoint (brief 102 task 12; P-88). It starts as root and,
# in this order:
#
#   1. raises the firewall (init-firewall.sh, default-deny egress). If it cannot be raised,
#      nothing else runs: the container stops, and its restart policy tries again;
#   2. makes /run/workspace (0700, owned by node): the runner writes its MCP config and its
#      heartbeat file there, and the healthcheck reads the heartbeat;
#   3. drops to the `node` user with every capability gone, then runs the command (the runner).
#
# So no Node or `claude` process ever runs as root, and the NET_ADMIN and NET_RAW capabilities
# compose.yaml adds exist only for step 1. No secret is read here: the firewall reads the two
# database hosts from their files, the runner and the two MCP servers read their own.
# Exit 78 (EX_CONFIG) on a refusal.

set -euo pipefail

readonly EX_CONFIG=78
readonly FIREWALL=/app/docker/workspace/init-firewall.sh
readonly RUN_DIR=/run/workspace
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

# Made new on every start: a heartbeat file left by the last run would read as a live runner.
rm -rf "$RUN_DIR"
install -d -m "$RUN_DIR_MODE" -o "$RUN_USER" -g "$RUN_USER" "$RUN_DIR"

# setpriv changes the ids, not the environment: without these the runner would look for its
# home in root's.
export HOME="$RUN_HOME" USER="$RUN_USER" LOGNAME="$RUN_USER"

# The drop (brief 102, "Non-root and egress"): node's uid, gid and groups, nothing inheritable
# and an empty bounding set, so no child (the CLI, an MCP server, a hook) can regain a capability.
exec setpriv --reuid node --regid node --init-groups --inh-caps=-all --bounding-set=-all "$@"
