/**
 * The local static fixture the e2e suite runs against.
 *
 * One server stands in for both origins the shell knows: `BB2DASH_APP_URL` (the
 * page the window loads) and `BB2DASH_SUPABASE_URL` (PostgREST). No test
 * reaches `*.supabase.co`, which is a DoD line and also the only way this suite
 * can run in a sandboxed session.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** The id the fake `agent_requests` row carries; the argv must quote exactly this. */
export const FIXTURE_REQUEST_ID = '4242';

const PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>bb2dash fixture</title></head>
  <body style="background:#12131a;color:#e8e8f0;font:16px system-ui">
    <h1>bb2dash e2e fixture</h1>
    <button id="sync">Sync</button>
    <button id="popup">Open a signed URL</button>
    <button id="leave">Outside link</button>
    <button id="redirect">Same-origin link that redirects out</button>
    <button id="embed">Send the frame outside</button>
    <p id="status">idle</p>
    <iframe id="frame" src="/frame" title="fixture frame" width="200" height="60"></iframe>
    <script>
      const status = document.getElementById('status');
      document.getElementById('sync').addEventListener('click', async () => {
        const response = await fetch('/rest/v1/agent_requests', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'sync' }),
        });
        status.textContent = 'posted ' + response.status;
      });
      document.getElementById('popup').addEventListener('click', () => {
        window.open('https://example.com/popup', '_blank');
      });
      document.getElementById('leave').addEventListener('click', () => {
        window.location.href = 'https://example.com/outside';
      });
      // P-shell-2: a same-origin navigation the server then 302s off the
      // allowlist. will-navigate sees the allowed origin and lets it start;
      // only will-redirect sees where it actually goes.
      document.getElementById('redirect').addEventListener('click', () => {
        window.location.href = '/redirect-out';
      });
      // P-shell-2: a subframe navigating itself out. will-navigate never fires
      // for a subframe; only will-frame-navigate does.
      document.getElementById('embed').addEventListener('click', () => {
        document.getElementById('frame').contentWindow.location.href =
          'https://example.com/embedded';
      });
      window.__preload = window.bb2dashDesktop;
    </script>
  </body>
</html>`;

/** What the iframe loads before a test sends it outside. */
const FRAME_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>frame</title></head>
<body style="background:#1c1d26;color:#e8e8f0;font:12px system-ui"><p id="frame-body">inside</p></body>
</html>`;

export interface FixtureServer {
  readonly url: string;
  readonly close: () => Promise<void>;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';

    if (path === '/rest/v1/agent_requests' && request.method === 'POST') {
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify([{ id: FIXTURE_REQUEST_ID }]));
      return;
    }
    if (path === '/rest/v1/agent_requests' && request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify([{ id: FIXTURE_REQUEST_ID, created_at: '2026-09-16T12:00:00Z' }]),
      );
      return;
    }
    if (path.startsWith('/rest/v1/')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('[]');
      return;
    }

    // P-shell-2: a same-origin URL that answers with a redirect off the allowlist.
    if (path === '/redirect-out') {
      response.writeHead(302, { location: 'https://example.com/redirected' });
      response.end();
      return;
    }
    if (path === '/frame') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(FRAME_PAGE);
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
