/**
 * Derive the shell's icons from `build/icon.png` (Q4: the eclipse-ring logo
 * Stack picked, 120x120 RGBA).
 *
 * Output:
 *   build/icon.ico     16, 32, 48, 256 — electron-builder's Windows icon
 *   build/tray-16.png  the tray image (C-12)
 *
 * Dependency-free on purpose: the alternative is a native image library in the
 * dependency tree of a package whose whole job is to open a window, for a
 * script that runs about once a phase. Node's `zlib` does the PNG halves and
 * the ICO container is a 6-byte header plus a 16-byte entry per image.
 *
 * Run with `npm run icons`. The outputs are committed, so a normal build never
 * runs this.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
const SOURCE = join(BUILD_DIR, 'icon.png');
const ICO_SIZES = [16, 32, 48, 256];
const TRAY_SIZE = 16;
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

/** 8-bit RGBA, non-interlaced PNG -> `{ width, height, pixels }`. */
function decodePng(file) {
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');

  let offset = 8;
  let header = null;
  const idat = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (header === null) throw new Error('no IHDR');
  if (header.bitDepth !== 8 || header.colorType !== 6 || header.interlace !== 0) {
    throw new Error(
      `only 8-bit non-interlaced RGBA is supported (got depth ${header.bitDepth}, ` +
        `colour type ${header.colorType}, interlace ${header.interlace})`,
    );
  }

  const { width, height } = header;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);

    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? out[x - 4] : 0;
      const b = prior === null ? 0 : prior[x];
      const c = prior === null || x < 4 ? 0 : prior[x - 4];
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`unknown filter ${filter} on row ${y}`);
      }
      out[x] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

/** Bilinear, on premultiplied alpha so a transparent edge does not darken. */
function resize(image, size) {
  const out = Buffer.alloc(size * size * 4);
  const scaleX = image.width / size;
  const scaleY = image.height / size;

  for (let y = 0; y < size; y += 1) {
    const sy = Math.min(image.height - 1, (y + 0.5) * scaleY - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(image.height - 1, y0 + 1);
    const wy = sy - y0;

    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(image.width - 1, (x + 0.5) * scaleX - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(image.width - 1, x0 + 1);
      const wx = sx - x0;

      const corners = [
        { index: (y0 * image.width + x0) * 4, weight: (1 - wx) * (1 - wy) },
        { index: (y0 * image.width + x1) * 4, weight: wx * (1 - wy) },
        { index: (y1 * image.width + x0) * 4, weight: (1 - wx) * wy },
        { index: (y1 * image.width + x1) * 4, weight: wx * wy },
      ];

      let alpha = 0;
      const premultiplied = [0, 0, 0];
      for (const { index, weight } of corners) {
        const a = image.pixels[index + 3] / 255;
        alpha += a * weight;
        for (let channel = 0; channel < 3; channel += 1) {
          premultiplied[channel] += image.pixels[index + channel] * a * weight;
        }
      }

      const target = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        out[target + channel] = alpha === 0 ? 0 : Math.round(premultiplied[channel] / alpha);
      }
      out[target + 3] = Math.round(alpha * 255);
    }
  }

  return { width: size, height: size, pixels: out };
}

function encodePng(image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    image.pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICONDIR + one ICONDIRENTRY per image, each payload a whole PNG (Vista+). */
function buildIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let offset = directory.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory[entry] = image.size >= 256 ? 0 : image.size;
    directory[entry + 1] = image.size >= 256 ? 0 : image.size;
    directory[entry + 2] = 0; // palette size
    directory[entry + 3] = 0; // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(image.png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
  });

  return Buffer.concat([directory, ...images.map((image) => image.png)]);
}

const source = decodePng(readFileSync(SOURCE));
console.log(`source ${SOURCE}: ${source.width}x${source.height}`);

const icoImages = ICO_SIZES.map((size) => ({ size, png: encodePng(resize(source, size)) }));
writeFileSync(join(BUILD_DIR, 'icon.ico'), buildIco(icoImages));
console.log(`wrote build/icon.ico (${ICO_SIZES.join(', ')})`);

writeFileSync(join(BUILD_DIR, `tray-${TRAY_SIZE}.png`), encodePng(resize(source, TRAY_SIZE)));
console.log(`wrote build/tray-${TRAY_SIZE}.png`);
