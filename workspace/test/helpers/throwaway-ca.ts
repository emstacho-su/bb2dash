/**
 * Certificates made for one test run and thrown away with it: a certificate authority and server
 * certificates it signs, built with node:crypto and a few lines of DER. Nothing here is read from a
 * file or written to one, and no key outlives the process, so no real key can be among them.
 */

import { generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

const TAG = { integer: 0x02, bitString: 0x03, octetString: 0x04, oid: 0x06, utf8: 0x0c, utcTime: 0x17, sequence: 0x30, set: 0x31 } as const;
/** Context tags of a v3 certificate: [0] the version, [3] the extensions; [2] a DNS name in subjectAltName. */
const CONTEXT = { version: 0xa0, extensions: 0xa3, dnsName: 0x82 } as const;
const OID = {
  ecdsaWithSha256: [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02],
  commonName: [0x55, 0x04, 0x03],
  subjectAltName: [0x55, 0x1d, 0x11],
  basicConstraints: [0x55, 0x1d, 0x13],
} as const;
const BOOLEAN_TRUE = Buffer.from([0x01, 0x01, 0xff]);
const X509_V3 = Buffer.from([0x02]);
const SERIAL_BYTES = 8;
const SERIAL_FIRST_BYTE_MASK = 0x7f;
const SHORT_LENGTH_MAX = 0x7f;
const ONE_BYTE_MAX = 0xff;
const VALID_FOR_MS = 60 * 60 * 1000;
const PEM_LINE_CHARS = 64;

function der(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  let head: number[];
  if (body.length <= SHORT_LENGTH_MAX) head = [tag, body.length];
  else if (body.length <= ONE_BYTE_MAX) head = [tag, 0x81, body.length];
  else head = [tag, 0x82, body.length >> 8, body.length & ONE_BYTE_MAX];
  return Buffer.concat([Buffer.from(head), body]);
}

const sequence = (...parts: Buffer[]): Buffer => der(TAG.sequence, ...parts);
const oid = (bytes: readonly number[]): Buffer => der(TAG.oid, Buffer.from(bytes));
/** A random positive INTEGER in its shortest form: the first byte is 0x01 to 0x7f, so it needs no padding and reads as no sign. */
function serialNumber(): Buffer {
  const bytes = randomBytes(SERIAL_BYTES);
  bytes[0] = ((bytes[0] ?? 0) & SERIAL_FIRST_BYTE_MASK) | 0x01;
  return der(TAG.integer, bytes);
}
const nameOf = (commonName: string): Buffer => sequence(der(TAG.set, sequence(oid(OID.commonName), der(TAG.utf8, Buffer.from(commonName, 'utf8')))));

function utcTime(at: Date): Buffer {
  const two = (value: number): string => String(value % 100).padStart(2, '0');
  const text = `${two(at.getUTCFullYear())}${two(at.getUTCMonth() + 1)}${two(at.getUTCDate())}${two(at.getUTCHours())}${two(at.getUTCMinutes())}${two(at.getUTCSeconds())}Z`;
  return der(TAG.utcTime, Buffer.from(text, 'ascii'));
}

const extension = (id: readonly number[], value: Buffer, critical = false): Buffer =>
  sequence(oid(id), ...(critical ? [BOOLEAN_TRUE] : []), der(TAG.octetString, value));

function toPem(certificate: Buffer): string {
  const lines = certificate.toString('base64').match(new RegExp(`.{1,${PEM_LINE_CHARS}}`, 'g')) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

interface CertificateInput {
  readonly subject: string;
  readonly issuer: string;
  readonly subjectKey: KeyObject;
  readonly signingKey: KeyObject;
  readonly extensions: readonly Buffer[];
}

function certificate(input: CertificateInput): string {
  const now = Date.now();
  const signature = sequence(oid(OID.ecdsaWithSha256));
  const body = sequence(
    der(CONTEXT.version, der(TAG.integer, X509_V3)),
    serialNumber(),
    signature,
    nameOf(input.issuer),
    sequence(utcTime(new Date(now - VALID_FOR_MS)), utcTime(new Date(now + VALID_FOR_MS))),
    nameOf(input.subject),
    input.subjectKey.export({ type: 'spki', format: 'der' }),
    der(CONTEXT.extensions, sequence(...input.extensions)),
  );
  const signed = sign('sha256', body, input.signingKey);
  return toPem(sequence(body, signature, der(TAG.bitString, Buffer.from([0x00]), signed)));
}

const newKeys = () => generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

export interface ServerCertificate {
  /** The server's certificate, PEM. */
  readonly cert: string;
  /** Its private key, PEM: in memory only. */
  readonly key: string;
}

export interface ThrowawayCa {
  /** The authority's own certificate, PEM: what a client pins. */
  readonly certPem: string;
  /** A certificate for a server of that host name, signed by this authority. */
  issueFor(hostName: string): ServerCertificate;
}

/** A new certificate authority with a new key, valid for an hour either side of now. */
export function makeThrowawayCa(commonName: string): ThrowawayCa {
  const authority = newKeys();
  const certPem = certificate({
    subject: commonName,
    issuer: commonName,
    subjectKey: authority.publicKey,
    signingKey: authority.privateKey,
    extensions: [extension(OID.basicConstraints, sequence(BOOLEAN_TRUE), true)],
  });
  return {
    certPem,
    issueFor(hostName) {
      const server = newKeys();
      const cert = certificate({
        subject: hostName,
        issuer: commonName,
        subjectKey: server.publicKey,
        signingKey: authority.privateKey,
        extensions: [extension(OID.subjectAltName, sequence(der(CONTEXT.dnsName, Buffer.from(hostName, 'ascii'))))],
      });
      return { cert, key: server.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
    },
  };
}
