#!/usr/bin/env bash
# bb2dash :: docker/walk/entry.sh
# The walk box, inside its container (brief 103, task 0). scripts/walk-box.mjs is the only caller:
#
#   bash /src/docker/walk/entry.sh all  <spec>... -- [playwright arguments]   a new box, then the walk
#   bash /src/docker/walk/entry.sh walk <spec>... -- [playwright arguments]   the walk alone, in a kept box
#
# What is mounted: the worktree under test at /src (read-only), the test login file at
# /work/.env.testing (read-only; login.mjs reads it with its own parser and it is never copied or
# printed), the run's output folder at /out, and npm's download cache at /npm-cache.
#
# What the environment says: WALK_BOX_MODE (build: this worktree's web app is built and served
# here; url: the host in WALK_BASE_URL is walked and nothing is built), WALK_BASE_URL, WALK_OUT
# (this call's folder under /out), WALK_SHOTS (1: specs may shoot, into $WALK_OUT/shots), and for a
# build the web app's two public settings.
#
# all:  copy web/ to /work/web, npm ci, then for a build: npm run build and next start on port 3000.
# walk: take e2e/ from the worktree as it is now (so a spec edited after the build is the one that
#       runs), wait for the server, sign in (every walk signs in again: a saved session lasts an
#       hour), run Playwright, and copy its output folder to $WALK_OUT/results.
#
# Exit: Playwright's own code (0 passed, 1 tests failed), or one of these when the box itself broke,
# so a walk that found something is never mistaken for a box that did not start:
#   70 called wrongly   71 copy   72 npm ci   73 build   74 server   75 sign-in   76 results
set -euo pipefail

readonly SRC_WEB=/src/web
readonly WORK=/work
readonly WORK_WEB="$WORK/web"
readonly LOGIN_FILE="$WORK/.env.testing"
readonly NPM_CACHE=/npm-cache
readonly BOX_OUT=/out
readonly PORT=3000
readonly READY_LIMIT_S=120
readonly PROBE_TIMEOUT_MS=5000
readonly LOG_TAIL_LINES=40
readonly SERVER_LOG="$BOX_OUT/next.log"
readonly SERVER_PID_FILE="$WORK/next.pid"

readonly E_USAGE=70 E_COPY=71 E_INSTALL=72 E_BUILD=73 E_SERVER=74 E_LOGIN=75 E_RESULTS=76

readonly MODE="${WALK_BOX_MODE:-build}"
readonly BASE_URL="${WALK_BASE_URL:-http://localhost:$PORT}"
readonly OUT="${WALK_OUT:-$BOX_OUT}"

# What a build must not inherit from the checkout: installed packages and build output made on
# another system, a saved session, an earlier run's results, and any env file (the build's settings
# come from the environment only).
readonly COPY_EXCLUDES=(
  --anchored
  --exclude=./node_modules
  --exclude=./.next
  --exclude=./out
  --exclude=./coverage
  --exclude=./.vercel
  --exclude=./e2e/.auth
  --exclude=./e2e/.results
  --exclude='./.env*'
  --exclude='./*.tsbuildinfo'
)

say() {
  printf '[walk-box] %s\n' "$*"
}

fail() {
  local code="$1"
  shift
  printf '[walk-box] FAILED: %s\n' "$*" >&2
  exit "$code"
}

# One step of the box. A step that fails ends the box with that step's own code. The step runs on
# the left of `||`, where bash does not stop at a failing line, so every step below joins its
# commands with `&&` and says so itself when one fails.
step() {
  local code="$1" what="$2"
  shift 2
  say "$what"
  "$@" || fail "$code" "$what"
}

copy_web() {
  mkdir -p "$WORK_WEB" &&
    tar -C "$SRC_WEB" "${COPY_EXCLUDES[@]}" -cf - . | tar -C "$WORK_WEB" -xf -
}

# Everything in e2e/ but the saved session and the last results is replaced by the checkout's.
refresh_e2e() {
  find "$WORK_WEB/e2e" -mindepth 1 -maxdepth 1 ! -name .auth ! -name .results -exec rm -rf {} + &&
    tar -C "$SRC_WEB/e2e" --anchored --exclude=./.auth --exclude=./.results -cf - . | tar -C "$WORK_WEB/e2e" -xf -
}

install_packages() {
  (cd "$WORK_WEB" && npm ci --cache "$NPM_CACHE" --prefer-offline --no-audit --no-fund)
}

# Names only: a value is never printed. docker's --env-file takes each line as written, so a value
# in quotes arrives with its quotes and the build would carry them.
check_settings() {
  local name
  for name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
    if [ -z "${!name:-}" ]; then
      say "the web env file does not set $name"
      return 1
    fi
  done
  case "$NEXT_PUBLIC_SUPABASE_URL" in
    https://*) ;;
    *)
      say "NEXT_PUBLIC_SUPABASE_URL does not start with https:// (is the value in quotes?)"
      return 1
      ;;
  esac
}

build_app() {
  (cd "$WORK_WEB" && NEXT_TELEMETRY_DISABLED=1 npm run build)
}

# In the background, with nothing of this call's own held open: in a kept box the server outlives
# the call that started it.
start_server() {
  cd "$WORK_WEB" || return 1
  NEXT_TELEMETRY_DISABLED=1 nohup npx next start -p "$PORT" > "$SERVER_LOG" 2>&1 < /dev/null &
  echo "$!" > "$SERVER_PID_FILE"
}

server_alive() {
  [ -f "$SERVER_PID_FILE" ] && kill -0 "$(cat "$SERVER_PID_FILE")" 2> /dev/null
}

answers_200() {
  node -e '
    const [url, limit] = process.argv.slice(1);
    fetch(url, { signal: AbortSignal.timeout(Number(limit)) }).then(
      (response) => process.exit(response.status === 200 ? 0 : 1),
      () => process.exit(1),
    );
  ' "$1" "$PROBE_TIMEOUT_MS"
}

server_log_tail() {
  say "the end of the server's log ($SERVER_LOG):"
  tail -n "$LOG_TAIL_LINES" "$SERVER_LOG" >&2 || say "there is no server log"
}

wait_ready() {
  local deadline=$((SECONDS + READY_LIMIT_S))
  until answers_200 "http://localhost:$PORT/login"; do
    if ! server_alive; then
      say "the server is not running"
      server_log_tail
      return 1
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      say "http://localhost:$PORT/login did not answer 200 within ${READY_LIMIT_S}s"
      server_log_tail
      return 1
    fi
    sleep 1
  done
}

# login.mjs types the test login into the form and prints neither value. When it fails, what the
# page was doing is told from the outside: whether /login still answers, and the server's log.
sign_in() {
  if [ "$MODE" != url ]; then unset WALK_VERCEL_SHARE; fi
  if (cd "$WORK_WEB" && WALK_BASE_URL="$BASE_URL" node e2e/login.mjs); then return 0; fi
  if answers_200 "$BASE_URL/login"; then
    say "$BASE_URL/login answers 200, so the form was served and the sign-in did not land"
  else
    say "$BASE_URL/login does not answer 200"
  fi
  if [ "$MODE" != url ]; then server_log_tail; fi
  return 1
}

run_specs() {
  (
    cd "$WORK_WEB" &&
      WALK_BASE_URL="$BASE_URL" WALK_SHOT_DIR="$OUT/shots" WALK_SHOTS="${WALK_SHOTS:-0}" \
        npx playwright test -c e2e/playwright.config.ts "${SPECS[@]}" "${EXTRA[@]}"
  )
}

# Playwright empties its output folder at the start of each run, so what is copied is this walk's.
keep_results() {
  rm -rf "$OUT/results" || return 1
  mkdir -p "$OUT/results" || return 1
  if [ -d "$WORK_WEB/e2e/.results" ]; then cp -r "$WORK_WEB/e2e/.results/." "$OUT/results/"; fi
}

prepare() {
  [ -f "$LOGIN_FILE" ] || fail "$E_COPY" "the test login file is not mounted at $LOGIN_FILE"
  step "$E_COPY" "copying web/ to $WORK_WEB" copy_web
  step "$E_INSTALL" "npm ci" install_packages
  if [ "$MODE" = url ]; then return 0; fi
  step "$E_BUILD" "checking the web app's two public settings" check_settings
  step "$E_BUILD" "npm run build" build_app
  step "$E_SERVER" "starting next on port $PORT" start_server
}

walk() {
  [ -d "$WORK_WEB/node_modules" ] || fail "$E_USAGE" "this box was never prepared: there is no $WORK_WEB/node_modules"
  mkdir -p "$OUT" || fail "$E_RESULTS" "the output folder $OUT could not be made"
  step "$E_COPY" "taking e2e/ from the worktree as it is now" refresh_e2e
  if [ "$MODE" != url ]; then step "$E_SERVER" "waiting for http://localhost:$PORT/login" wait_ready; fi
  step "$E_LOGIN" "signing in at $BASE_URL" sign_in

  say "playwright test ${SPECS[*]} ${EXTRA[*]}"
  local code=0
  run_specs || code=$?
  if ! keep_results; then
    say "Playwright's output folder could not be copied to $OUT/results"
    if [ "$code" -eq 0 ]; then code="$E_RESULTS"; fi
  fi
  say "playwright ended with exit code $code"
  exit "$code"
}

phase="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi
SPECS=()
EXTRA=()
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--" ]; then
    shift
    EXTRA=("$@")
    break
  fi
  SPECS+=("$1")
  shift
done
[ "${#SPECS[@]}" -gt 0 ] || fail "$E_USAGE" "no spec was named"

case "$phase" in
  all)
    prepare
    walk
    ;;
  walk)
    walk
    ;;
  *)
    fail "$E_USAGE" "the first argument is all or walk, not \"$phase\""
    ;;
esac
