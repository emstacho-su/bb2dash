import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { startAliveBeat } from '../src/alive-beat.js';
import { ALIVE_TOUCH_MS } from '../src/constants.js';
import { tempDir } from './helpers.js';

describe('the alive file', () => {
  it('is touched every 10 s', () => {
    expect(ALIVE_TOUCH_MS).toBe(10_000);
  });

  it('is touched from its own thread, so a blocked main thread (a synchronous extraction) does not stop it', async () => {
    const file = path.join(tempDir(), 'alive');
    const beat = startAliveBeat(file, 25);
    try {
      const deadline = Date.now() + 5000;
      while (!fs.existsSync(file) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
      expect(fs.existsSync(file)).toBe(true);
      const old = new Date(Date.now() - 60_000);
      fs.utimesSync(file, old, old);
      // Block this thread the way execFileSync does.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
      expect(Date.now() - fs.statSync(file).mtimeMs).toBeLessThan(30_000);
    } finally {
      beat.stop();
    }
  });
});
