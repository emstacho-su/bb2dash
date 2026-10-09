/**
 * Draw the app's icon (Phase 22, task 33; D-5, named exception 11): the mark of the top bar.
 * A square in the ink on the dark ground, in greys only. The shell's old mark was a lavender ring
 * on navy; after direction D the taskbar, the window's corner and the tray would carry the one hue
 * the direction removed.
 *
 *   node scripts/draw-mark.mjs      writes build/icon.png and the two web copies
 *   npm run icons                   then derives build/icon.ico and build/tray-16.png from it
 *
 * Both colours are read from the dark theme block of `web/src/app/globals.css`, so a restyle of the
 * ground or the ink is one re-run away: the ground is `--color-bg`, the ink is `--color-neutral-100`
 * (which `--color-accent` points at). No dependency: Node's `zlib` does the PNG.
 *
 * The square's size on its canvas is taste call T-10; the default is half the canvas, centred.
 * The two web icons are byte copies, as Phase 17 made them (a656af1): `apple-icon.png` is
 * `build/icon.png`, written by this script, and `favicon.ico` is `build/icon.ico`, copied by hand
 * after `npm run icons` (`make-icons.mjs` is not edited). `test/unit/app-mark.test.ts` holds both
 * copies byte for byte.
 */

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(HERE, '..', 'build');
const GLOBALS = join(HERE, '..', '..', 'web', 'src', 'app', 'globals.css');
const WEB_APPLE_ICON = join(HERE, '..', '..', 'web', 'src', 'app', 'apple-icon.png');

/** The canvas is 120 by 120, RGBA, as on `main`. */
export const CANVAS = 120;
/** The square's side, centred (taste call T-10). */
export const SQUARE = 60;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** 8-bit RGBA, non-interlaced PNG from a flat RGBA pixel buffer. */
function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]), pixels.subarray(y * width * 4, (y + 1) * width * 4)); // filter: none
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** `--name: #rrggbb;` out of the dark (`:root`) block of the stylesheet, comments taken out. */
function darkTokenHex(css, name) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const open = stripped.indexOf(':root {');
  if (open < 0) throw new Error('globals.css has no :root block');
  const block = stripped.slice(open, stripped.indexOf('\n}', open));
  const found = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block);
  if (found === null) throw new Error(`${name} is not a plain hex in the dark block of globals.css`);
  const hex = found[1];
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

/** The icon's pixels: the ground everywhere, the ink in a centred square. */
export function drawMark(ground, ink) {
  const pixels = Buffer.alloc(CANVAS * CANVAS * 4);
  const first = (CANVAS - SQUARE) / 2;
  const last = first + SQUARE;
  for (let y = 0; y < CANVAS; y += 1) {
    for (let x = 0; x < CANVAS; x += 1) {
      const inside = x >= first && x < last && y >= first && y < last;
      const [r, g, b] = inside ? ink : ground;
      pixels.set([r, g, b, 255], (y * CANVAS + x) * 4);
    }
  }
  return pixels;
}

function main() {
  const css = readFileSync(GLOBALS, 'utf8');
  const ground = darkTokenHex(css, '--color-bg');
  const ink = darkTokenHex(css, '--color-neutral-100');
  const png = encodePng(CANVAS, CANVAS, drawMark(ground, ink));
  const target = join(BUILD_DIR, 'icon.png');
  writeFileSync(target, png);
  copyFileSync(target, WEB_APPLE_ICON);
  console.log(`draw-mark: ${CANVAS}x${CANVAS}, ${SQUARE}px square, ground rgb(${ground}), ink rgb(${ink})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
