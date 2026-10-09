/**
 * The app's icon (Phase 22, task 33; D-5, named exception 11): a square in the ink on the dark
 * ground, greys only. Drawn by `scripts/draw-mark.mjs`, derived into the Windows icon and the tray
 * image by `npm run icons`, and copied byte for byte into the web app's two icon files.
 *
 * The colours are the dark block's `--color-bg` and `--color-neutral-100` in
 * `web/src/app/globals.css`, so the file fails here when the tokens move and the icon is not
 * redrawn. Nothing here needs Electron or a native image library: the PNG is decoded with `zlib`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const DESKTOP = process.cwd();
const BUILD = join(DESKTOP, 'build');
const WEB_APP = join(DESKTOP, '..', 'web', 'src', 'app');
const GLOBALS = join(WEB_APP, 'globals.css');

const CANVAS = 120;
const MAX_CHANNEL_SPREAD = 2;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Image {
  width: number;
  height: number;
  colorType: number;
  pixels: Buffer;
}

/** One byte of a buffer, or an error: the project compiles with unchecked index reads off. */
function byte(buffer: Uint8Array, index: number): number {
  const value = buffer[index];
  if (value === undefined) throw new RangeError(`no byte at ${index} of ${buffer.length}`);
  return value;
}

/** 8-bit, non-interlaced, filter-none PNG as `draw-mark.mjs` writes it, or a filtered one. */
function decodePng(file: Buffer): Image {
  expect(file.subarray(0, 8).equals(PNG_SIGNATURE), 'a PNG signature').toBe(true);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  const idat: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = byte(data, 8);
      colorType = byte(data, 9);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  expect(bitDepth, 'bit depth').toBe(8);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bytesPerPixel;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = byte(raw, y * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const value = byte(raw, y * (stride + 1) + 1 + x);
      const left = x >= bytesPerPixel ? byte(out, y * stride + x - bytesPerPixel) : 0;
      const up = y > 0 ? byte(out, (y - 1) * stride + x) : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? byte(out, (y - 1) * stride + x - bytesPerPixel) : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  return { width, height, colorType, pixels: out };
}

/** `--name: #rrggbb;` out of the dark (`:root`) block of the stylesheet. */
function darkToken(name: string): readonly [number, number, number] {
  const stripped = readFileSync(GLOBALS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const open = stripped.indexOf(':root {');
  const block = stripped.slice(open, stripped.indexOf('\n}', open));
  const hex = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block)?.[1];
  if (hex === undefined) throw new Error(`${name} is not a plain hex in the dark block`);
  const channel = (from: number): number => Number.parseInt(hex.slice(from, from + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

const icon = decodePng(readFileSync(join(BUILD, 'icon.png')));
const pixelAt = (x: number, y: number): readonly [number, number, number, number] => {
  const at = (y * icon.width + x) * 4;
  return [byte(icon.pixels, at), byte(icon.pixels, at + 1), byte(icon.pixels, at + 2), byte(icon.pixels, at + 3)];
};

describe('build/icon.png', () => {
  it('decodes as an RGBA PNG, 120 by 120 as on main', () => {
    expect(icon.colorType).toBe(6);
    expect(icon.width).toBe(CANVAS);
    expect(icon.height).toBe(CANVAS);
  });

  it('every opaque pixel is a grey: its three channels are within 2 of each other', () => {
    let spread = 0;
    for (let y = 0; y < icon.height; y += 1) {
      for (let x = 0; x < icon.width; x += 1) {
        const [r, g, b, a] = pixelAt(x, y);
        if (a === 0) continue;
        spread = Math.max(spread, Math.max(r, g, b) - Math.min(r, g, b));
      }
    }
    expect(spread).toBeLessThanOrEqual(MAX_CHANNEL_SPREAD);
  });

  it("the corner pixel is the dark block's --color-bg, or clear", () => {
    const [r, g, b, a] = pixelAt(0, 0);
    if (a === 0) return;
    expect([r, g, b]).toEqual([...darkToken('--color-bg')]);
  });

  it("the centre pixel is the dark block's --color-neutral-100", () => {
    const [r, g, b, a] = pixelAt(CANVAS / 2, CANVAS / 2);
    expect(a).toBe(255);
    expect([r, g, b]).toEqual([...darkToken('--color-neutral-100')]);
  });

  it('is a square in the ink on the ground: two colours, the ink centred and the ground around it', () => {
    const colours = new Set<string>();
    for (let y = 0; y < icon.height; y += 1) {
      for (let x = 0; x < icon.width; x += 1) colours.add(pixelAt(x, y).join(','));
    }
    expect(colours.size).toBe(2);
    // A pixel a quarter in is inside the square; a pixel a tenth in is outside it.
    expect(pixelAt(CANVAS / 4 + 1, CANVAS / 2)).toEqual(pixelAt(CANVAS / 2, CANVAS / 2));
    expect(pixelAt(CANVAS / 10, CANVAS / 2)).toEqual(pixelAt(0, 0));
  });
});

describe('the derived and copied files', () => {
  it('build/icon.ico and build/tray-16.png are not empty', () => {
    expect(readFileSync(join(BUILD, 'icon.ico')).length).toBeGreaterThan(0);
    const tray = readFileSync(join(BUILD, 'tray-16.png'));
    expect(tray.length).toBeGreaterThan(0);
    expect(tray.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });

  it("the web app's two icon files are byte copies of the desktop's", () => {
    expect(readFileSync(join(WEB_APP, 'favicon.ico')).equals(readFileSync(join(BUILD, 'icon.ico')))).toBe(true);
    expect(readFileSync(join(WEB_APP, 'apple-icon.png')).equals(readFileSync(join(BUILD, 'icon.png')))).toBe(true);
  });
});
