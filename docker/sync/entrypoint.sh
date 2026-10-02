#!/usr/bin/env bash
# Phase 14 — the sync container's display stack (P-103): Xvfb, x11vnc bound to localhost inside the
# container, and noVNC/websockify on 6080. The host publishes 6080 on 127.0.0.1 only (compose.yaml).
# The VNC password comes from the `novnc_password` secret file and is never in the environment.
set -euo pipefail

readonly DISPLAY_NUM="${DISPLAY:-:99}"
readonly SCREEN_GEOMETRY="${SCREEN_GEOMETRY:-1440x900x24}"
readonly VNC_PORT=5900
readonly NOVNC_PORT=6080
readonly NOVNC_WEB_ROOT=/usr/share/novnc
readonly PASSWORD_FILE="${NOVNC_PASSWORD_FILE:-/run/secrets/novnc_password}"
readonly X_READY_TRIES=50

fail() {
  echo "entrypoint: $*" >&2
  exit 1
}

[ -s "$PASSWORD_FILE" ] || fail "secret file $PASSWORD_FILE is missing or empty"

# A stale lock from the previous run of this container would stop Xvfb after `docker compose restart`.
rm -f "/tmp/.X${DISPLAY_NUM#:}-lock"

Xvfb "$DISPLAY_NUM" -screen 0 "$SCREEN_GEOMETRY" -nolisten tcp &
for _ in $(seq "$X_READY_TRIES"); do
  [ -S "/tmp/.X11-unix/X${DISPLAY_NUM#:}" ] && break
  sleep 0.1
done
[ -S "/tmp/.X11-unix/X${DISPLAY_NUM#:}" ] || fail "Xvfb did not come up on $DISPLAY_NUM"

# x11vnc reads the password from the secret file itself, so it never appears in a process argument.
x11vnc -display "$DISPLAY_NUM" -localhost -rfbport "$VNC_PORT" -passwdfile "$PASSWORD_FILE" \
  -forever -shared -noxdamage -quiet -bg -o /tmp/x11vnc.log \
  || fail "x11vnc did not start"

websockify --web "$NOVNC_WEB_ROOT" "$NOVNC_PORT" "localhost:${VNC_PORT}" >/tmp/websockify.log 2>&1 &

exec "$@"
