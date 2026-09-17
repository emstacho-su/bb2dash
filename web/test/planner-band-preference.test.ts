/**
 * The Assignments band's memory (P-planner-1), on its own.
 *
 * Same contract as the sidebar's: the default is a real answer, a junk value is
 * not, and a browser that refuses storage still renders a planner.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BAND_DEFAULT,
  PLANNER_BAND_STORAGE_KEY,
  readStoredBand,
  resolveBand,
  toggleBand,
  writeStoredBand,
} from '@/components/planner/band-preference';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('BAND_DEFAULT', () => {
  it('is closed — Stack asked for the band hidden on arrival', () => {
    expect(BAND_DEFAULT).toBe('closed');
  });
});

describe('readStoredBand', () => {
  it('returns the stored state', () => {
    window.localStorage.setItem(PLANNER_BAND_STORAGE_KEY, 'open');
    expect(readStoredBand()).toBe('open');
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredBand()).toBeNull();
  });

  it('returns null for a value it does not recognise', () => {
    window.localStorage.setItem(PLANNER_BAND_STORAGE_KEY, 'ajar');
    expect(readStoredBand()).toBeNull();
  });

  it('returns null instead of throwing when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });
    expect(readStoredBand()).toBeNull();
  });
});

describe('writeStoredBand', () => {
  it('remembers the choice under its own key', () => {
    writeStoredBand('open');
    expect(window.localStorage.getItem(PLANNER_BAND_STORAGE_KEY)).toBe('open');
  });

  it('stays quiet when storage is full or blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeStoredBand('closed')).not.toThrow();
  });
});

describe('resolveBand', () => {
  it('lets a stored choice beat the default', () => {
    expect(resolveBand('open')).toBe('open');
    expect(resolveBand('closed')).toBe('closed');
  });

  it('falls back to closed with no stored choice', () => {
    expect(resolveBand(null)).toBe('closed');
  });
});

describe('toggleBand', () => {
  it('flips the state and is its own inverse', () => {
    expect(toggleBand('closed')).toBe('open');
    expect(toggleBand('open')).toBe('closed');
    expect(toggleBand(toggleBand('open'))).toBe('open');
  });
});
