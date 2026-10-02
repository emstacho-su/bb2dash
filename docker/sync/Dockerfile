# Phase 14 — the sync image. This first cut is the noVNC spike (brief 100 task 4): Chromium headful on
# Xvfb, shown through x11vnc + noVNC, as the non-root `pwuser` under Playwright's seccomp profile.
# W-56 grows it into the runner's image (task 15) and deletes `spike/`.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

ARG PLAYWRIGHT_VERSION=1.63.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund "playwright@${PLAYWRIGHT_VERSION}" \
 && mkdir -p /home/pwuser/bb-profile \
 && chown -R pwuser:pwuser /app /home/pwuser/bb-profile

COPY --chown=pwuser:pwuser entrypoint.sh /app/docker/sync/entrypoint.sh
COPY --chown=pwuser:pwuser spike/session-age.mjs /app/docker/sync/spike/session-age.mjs
# A Windows checkout may hand over CRLF; the shebang line must end in LF.
RUN sed -i 's/\r$//' /app/docker/sync/entrypoint.sh && chmod 0755 /app/docker/sync/entrypoint.sh

USER pwuser
ENV DISPLAY=:99 \
    BB_PROFILE_DIR=/home/pwuser/bb-profile

EXPOSE 6080
ENTRYPOINT ["/app/docker/sync/entrypoint.sh"]
CMD ["node", "/app/docker/sync/spike/session-age.mjs"]
