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
    <p id="status">idle</p>
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
      window.__preload = window.bb2dashDesktop;
    </script>
  </body>
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
