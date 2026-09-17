/**
 * C-5 — the `safeStorage` helper.
 *
 * The MVP does not use it: the poller reads the web session's cookie and holds
 * the token in memory only, so there is no secret at rest to protect. It is
 * written and tested anyway because the moment anything in main needs to keep a
 * credential — R-28's container token, a future own-token poller — this is the
 * only way it may do so, and reviewing it later under time pressure is how a
 * plaintext token ends up on disk.
 *
 * On Windows the key is DPAPI-protected: safe from other Windows accounts, not
 * from other programs running as Stack. Encryption is unavailable until
 * `app.whenReady()`, and callers must handle that rather than fall back to
 * plaintext.
 */

import { safeStorage } from 'electron';

export class SecretUnavailableError extends Error {
  constructor() {
    super('OS-backed encryption is unavailable; refusing to store a secret in plaintext');
    this.name = 'SecretUnavailableError';
  }
}

export function isSecretStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Plaintext in, base64 ciphertext out. Throws rather than degrading. */
export function encryptSecret(plain: string): string {
  if (!isSecretStorageAvailable()) throw new SecretUnavailableError();
  return safeStorage.encryptString(plain).toString('base64');
}

/** The inverse. A ciphertext this machine cannot read is an error, not an empty string. */
export function decryptSecret(encoded: string): string {
  if (!isSecretStorageAvailable()) throw new SecretUnavailableError();
  return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
}
