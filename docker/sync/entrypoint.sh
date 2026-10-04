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
readonly PROFILE_DIR="${BB_PROFILE_DIR:-/home/pwuser/bb-profile}"
readonly X_LOCK="/tmp/.X${DISPLAY_NUM#:}-lock"
readonly X_SOCKET="/tmp/.X11-unix/X${DISPLAY_NUM#:}"
readonly X_READY_TRIES=50
readonly UTF8_BOM=$'\xef\xbb\xbf'

fail() {
  echo "entrypoint: $*" >&2
  exit 1
}

# `-r`, not `-s`: a file this user cannot read still has a size.
[ -r "$PASSWORD_FILE" ] || fail "secret file $PASSWORD_FILE is missing or not readable by $(id -un) (uid $(id -u))"

# A copy without the BOM, CR or LF a Windows editor or PowerShell redirect leaves behind; VNC compares
# the first 8 bytes, so a BOM alone would make the password unusable. Only this user can read the copy.
umask 077
readonly CLEAN_PASSWORD_FILE="$(mktemp)"
password="$(tr -d '\r\n' < "$PASSWORD_FILE")"
password="${password#"$UTF8_BOM"}"
[ -n "$password" ] || fail "secret file $PASSWORD_FILE is empty"
printf '%s' "$password" > "$CLEAN_PASSWORD_FILE"
unset password

# What the previous run of this container left behind. `docker compose restart` keeps /tmp, so both the
# lock and the socket are stale; the socket has to go too, or the readiness loop below passes before the
# new Xvfb is listening.
rm -f "$X_LOCK" "$X_SOCKET"

# Chromium's own lock names the host and pid that held the profile. This container is the only thing
# that ever opens the profile and nothing has started a browser yet, so a lock found here is from a
# browser that was killed, and leaving it would refuse the profile after a recreate.
rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket"

Xvfb "$DISPLAY_NUM" -screen 0 "$SCREEN_GEOMETRY" -nolisten tcp &
for _ in $(seq "$X_READY_TRIES"); do
  [ -S "$X_SOCKET" ] && break
  sleep 0.1
done
[ -S "$X_SOCKET" ] || fail "Xvfb did not come up on $DISPLAY_NUM"

# x11vnc reads the password from the file itself, so it never appears in a process argument.
x11vnc -display "$DISPLAY_NUM" -localhost -rfbport "$VNC_PORT" -passwdfile "$CLEAN_PASSWORD_FILE" \
  -forever -shared -noxdamage -quiet -bg -o /tmp/x11vnc.log \
  || fail "x11vnc did not start; see /tmp/x11vnc.log"

websockify --web "$NOVNC_WEB_ROOT" "$NOVNC_PORT" "localhost:${VNC_PORT}" >/tmp/websockify.log 2>&1 &

exec "$@"
