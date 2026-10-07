/**
 * A stand-in for the first second of a session-pooler connection, on the loopback interface: it
 * accepts the client's SSLRequest, does the TLS handshake with the certificate it was given, and
 * greets a client whose handshake passed. It speaks no SQL and holds no data.
 */

import net from 'node:net';
import tls from 'node:tls';

import type { ServerCertificate } from './throwaway-ca.js';

/** The code a Postgres client sends, as its first eight bytes, to ask for TLS. */
const SSL_REQUEST_CODE = 80877103;
const SSL_REQUEST_BYTES = 8;
const ACCEPT_TLS = 'S';
const INT32_BYTES = 4;
/** A startup message opens with its length and the protocol version. */
const STARTUP_HEADER_BYTES = 2 * INT32_BYTES;
/** AuthenticationOk, then ReadyForQuery (idle): the two messages that end a client's connect(). */
const GREETING = Buffer.concat([Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0]), Buffer.from([0x5a, 0, 0, 0, 5, 0x49])]);
const LOOPBACK = '127.0.0.1';

export interface FakePooler {
  readonly port: number;
  /** The startup parameters (user, database, application_name…) of each client that got through the handshake, in order. */
  readonly startups: ReadonlyArray<Readonly<Record<string, string>>>;
  close(): Promise<void>;
}

/** The `name\0value\0` pairs of a startup message. */
function startupParameters(message: Buffer): Record<string, string> {
  const fields = message.subarray(STARTUP_HEADER_BYTES).toString('utf8').split('\u0000');
  const parameters: Record<string, string> = {};
  for (let at = 0; at + 1 < fields.length && fields[at] !== ''; at += 2) parameters[fields[at] ?? ''] = fields[at + 1] ?? '';
  return parameters;
}

export interface FakePoolerOptions extends ServerCertificate {
  /** Certificates sent after the server's own, the way the real pooler sends its issuer. */
  readonly chain?: readonly string[];
}

export function startFakePooler(options: FakePoolerOptions): Promise<FakePooler> {
  const startups: Array<Record<string, string>> = [];
  const open = new Set<net.Socket>();
  const secureContext = tls.createSecureContext({ key: options.key, cert: [options.cert, ...(options.chain ?? [])].join('') });

  const server = net.createServer((socket) => {
    open.add(socket);
    socket.on('close', () => open.delete(socket));
    socket.on('error', () => undefined);
    socket.once('data', (first) => {
      if (first.length !== SSL_REQUEST_BYTES || first.readInt32BE(INT32_BYTES) !== SSL_REQUEST_CODE) {
        socket.destroy();
        return;
      }
      socket.write(ACCEPT_TLS);
      const secure = new tls.TLSSocket(socket, { isServer: true, secureContext });
      // A client that refuses the certificate ends the handshake with an alert: that is the test, not a fault.
      secure.on('error', () => undefined);
      secure.once('data', (startup: Buffer) => {
        startups.push(startupParameters(startup));
        secure.write(GREETING);
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('the fake pooler has no port'));
        return;
      }
      resolve({
        port: address.port,
        startups,
        close: () =>
          new Promise<void>((done) => {
            for (const socket of open) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
