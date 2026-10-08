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
# Nothing login.mjs prints is passed on. A step of the sign-in that fails prints Playwright's
# message, which carries the value being typed or the address with the share token (sign_in).
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
#   77 the walk ran past its time limit and was stopped
set -euo pipefail

readonly SRC_WEB=/src/web
readonly WORK=/work
readonly WORK_WEB="$WORK/web"
readonly LOGIN_FILE="$WORK/.env.testing"
readonly NPM_CACHE=/npm-cache
readonly BOX_OUT=/out
readonly PORT=3000
readonly READY_LIMIT_S=120
# A box whose host script was killed is watched by nobody, so every step that waits on something
# has a limit of its own, and the box ends and removes itself either way: npm ci (the network),
# the build (the compiler), the server (READY_LIMIT_S), the sign-in and the walk (a browser). A
# step that runs past its limit is sent TERM, and KILL after KILL_AFTER_S more. Added up, a box
# ends within two hours whatever happens inside it.
readonly INSTALL_LIMIT_S=900
readonly BUILD_LIMIT_S=900
readonly SIGN_IN_LIMIT_S=300
readonly WALK_LIMIT_S=3600
readonly KILL_AFTER_S=30
# What `timeout` ends with when it stopped the command: 124 after TERM, 137 after KILL.
readonly TIMED_OUT=124 KILLED=137
readonly PROBE_TIMEOUT_MS=5000
readonly LOG_TAIL_LINES=40
readonly SERVER_LOG="$BOX_OUT/next.log"
readonly SERVER_PID_FILE="$WORK/next.pid"

readonly E_USAGE=70 E_COPY=71 E_INSTALL=72 E_BUILD=73 E_SERVER=74 E_LOGIN=75 E_RESULTS=76 E_LIMIT=77

# Playwright's own names for the calls web/e2e/login.mjs makes, in the order it makes them. A
# failed sign-in is told by one of these names and by nothing login.mjs printed (sign_in).
readonly LOGIN_CALLS=(
  browserType.launch
  browser.newContext
  browserContext.newPage
  page.goto
  locator.fill
  locator.click
  page.waitForURL
  page.waitForLoadState
  browserContext.storageState
)

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
  (
    cd "$WORK_WEB" &&
      timeout --kill-after="$KILL_AFTER_S" "$INSTALL_LIMIT_S" npm ci --cache "$NPM_CACHE" --prefer-offline --no-audit --no-fund
  )
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
  (
    cd "$WORK_WEB" &&
      NEXT_TELEMETRY_DISABLED=1 timeout --kill-after="$KILL_AFTER_S" "$BUILD_LIMIT_S" npm run build
  )
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

# Which call of login.mjs failed, in fixed words: one of Playwright's own names from LOGIN_CALLS,
# the field when it was one of the two, and whether it timed out. $1 is what login.mjs printed.
# It is only tested against fixed patterns here, and no part of it is printed.
failed_login_step() {
  local said="$1" call where="" how=""
  for call in "${LOGIN_CALLS[@]}"; do
    case "$said" in
      *"login.mjs failed: $call: "*)
        case "$said" in *"locator('#email')"*) where=" on #email" ;; esac
        case "$said" in *"locator('#password')"*) where=" on #password" ;; esac
        case "$said" in *"login.mjs failed: $call: Timeout "*) how=" (timed out)" ;; esac
        printf '%s%s%s' "$call" "$where" "$how"
        return 0
        ;;
    esac
  done
  printf 'a step login.mjs does not name'
}

# login.mjs types the test login into the form. Nothing it prints is passed on, on any path: when
# a step fails it prints Playwright's message, and that message carries the value that was being
# typed (`fill("...")` in its call log) or the whole address that was being opened, share token
# included. So all it prints is caught in a variable that lives for this function only. A failed
# sign-in is told by the name of the call that failed, and from the outside: whether /login still
# answers, and the server's log.
sign_in() {
  if [ "$MODE" != url ]; then unset WALK_VERCEL_SHARE; fi
  local said code=0
  said="$(cd "$WORK_WEB" && WALK_BASE_URL="$BASE_URL" timeout --kill-after="$KILL_AFTER_S" "$SIGN_IN_LIMIT_S" node e2e/login.mjs 2>&1)" || code=$?
  if [ "$code" -eq 0 ]; then return 0; fi
  if [ "$code" -eq "$TIMED_OUT" ] || [ "$code" -eq "$KILLED" ]; then
    say "the sign-in ran past its limit of ${SIGN_IN_LIMIT_S}s and was stopped"
  else
    say "login.mjs ended with exit code $code at: $(failed_login_step "$said")"
  fi
  say "what login.mjs printed is not shown: a failed step's message can carry the login or the share token"
  if answers_200 "$BASE_URL/login"; then
    say "$BASE_URL/login answers 200, so the form was served and the sign-in did not land"
  else
    say "$BASE_URL/login does not answer 200"
  fi
  if [ "$MODE" != url ]; then server_log_tail; fi
  return 1
}

# The whole walk has one limit, whatever the number of specs: every test has its own
# (playwright.config.ts), and their sum has none.
run_specs() {
  (
    cd "$WORK_WEB" &&
      WALK_BASE_URL="$BASE_URL" WALK_SHOT_DIR="$OUT/shots" WALK_SHOTS="${WALK_SHOTS:-0}" \
        timeout --kill-after="$KILL_AFTER_S" "$WALK_LIMIT_S" npx playwright test -c e2e/playwright.config.ts "${SPECS[@]}" "${EXTRA[@]}"
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
  local code=0 began="$SECONDS"
  run_specs || code=$?
  # 137 is also what a process killed for memory ends with: it is the limit only when the time is up.
  if [ "$code" -eq "$TIMED_OUT" ] || { [ "$code" -eq "$KILLED" ] && [ "$((SECONDS - began))" -ge "$WALK_LIMIT_S" ]; }; then
    say "the walk ran past its limit of ${WALK_LIMIT_S}s and was stopped"
    code="$E_LIMIT"
  fi
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
