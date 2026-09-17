/**
 * C-5 — the `safeStorage` helper round-trips, and refuses rather than degrading
 * when the OS keyring is unavailable.
 *
 * `electron` is mocked: the module under test is the only main-process file in
 * the unit suite, and what is worth asserting is the refusal, not DPAPI.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { available: true };

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: (): boolean => state.available,
    // A stand-in transform: reversible, and visibly not the plaintext.
    encryptString: (plain: string): Buffer =>
      Buffer.from(`enc:${plain}`.split('').reverse().join(''), 'utf8'),
    decryptString: (buffer: Buffer): string =>
      buffer.toString('utf8').split('').reverse().join('').slice('enc:'.length),
  },
}));

// `vi.mock` is hoisted above this import, so `secret.ts` binds to the stub.
import {
  SecretUnavailableError,
  decryptSecret,
  encryptSecret,
  isSecretStorageAvailable,
} from '../../src/main/secret';

describe('secret storage', () => {
  beforeEach(() => {
    state.available = true;
  });

  it('round-trips a secret', () => {
    const token = 'a-token-that-must-not-land-on-disk';
    const encoded = encryptSecret(token);
    expect(encoded).not.toContain(token);
    expect(decryptSecret(encoded)).toBe(token);
  });

  it('round-trips an empty string', () => {
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('reports availability', () => {
    expect(isSecretStorageAvailable()).toBe(true);
    state.available = false;
    expect(isSecretStorageAvailable()).toBe(false);
  });

  it('refuses to encrypt when the keyring is unavailable', () => {
    state.available = false;
    expect(() => encryptSecret('x')).toThrowError(SecretUnavailableError);
  });

  it('refuses to decrypt when the keyring is unavailable', () => {
    state.available = false;
    expect(() => decryptSecret('x')).toThrowError(SecretUnavailableError);
  });
});
