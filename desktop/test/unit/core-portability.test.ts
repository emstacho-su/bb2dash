/**
 * C-13 (R-28) — `desktop/src/core/` is plain Node. Nothing under it may import
 * `electron`, so the whole of it lifts into a container later behind the
 * `Notifier` / `Launcher` / `WatermarkStore` interfaces without a rewrite.
 *
 * The grep is the contract; the import below is the proof that it runs.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = join(process.cwd(), 'src', 'core');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

const CORE_FILES = walk(CORE);

describe('src/core imports nothing from electron', () => {
  it('has files to check at all', () => {
    expect(CORE_FILES.length).toBeGreaterThan(0);
  });

  it.each([
    ['an ESM import', /from\s+['"]electron(\/[^'"]*)?['"]/],
    ['a require', /require\(\s*['"]electron(\/[^'"]*)?['"]\s*\)/],
    ['a bare import', /^\s*import\s+['"]electron(\/[^'"]*)?['"]/m],
    ['a dynamic import', /import\(\s*['"]electron(\/[^'"]*)?['"]\s*\)/],
  ])('has no %s of electron', (_label, pattern) => {
    const offenders = CORE_FILES.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map(
      (file) => relative(process.cwd(), file),
    );
    expect(offenders).toEqual([]);
  });

  it('reads no Node filesystem module either (C-13: only through WatermarkStore)', () => {
    const offenders = CORE_FILES.filter((file) =>
      /from\s+['"]node:fs(\/promises)?['"]|require\(\s*['"](node:)?fs['"]/.test(
        readFileSync(file, 'utf8'),
      ),
    ).map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
