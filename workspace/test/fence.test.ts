import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BLOCK_OPENING, DATA_PREFIX, titleLine, blockEndLine, blockOpenLine, guardText, makeBlock, newMarker, oneLine } from '../src/context/fence.js';
import { LINES, attachmentLine } from '../src/lines.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT = path.join(HERE, 'fixtures', 'contract24');
/** A text file of the contract folder without its one final newline, the way the README compares it. */
const textFile = (name: string): string => fs.readFileSync(path.join(CONTRACT, name), 'utf8').replace(/\n$/, '');

const MARKER = '0123456789abcdef';

describe('the marker', () => {
  it('is 16 hex characters and differs between turns', () => {
    const first = newMarker();
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(newMarker()).not.toBe(first);
  });
});

describe('the two block lines', () => {
  const [openForm, endForm] = textFile('fence.txt').split('\n');

  it('are the characters of the PM fixture', () => {
    expect(blockOpenLine(MARKER, 'passage', '[M9001]')).toBe(openForm?.replace('{marker}', MARKER).replace('{kind}', 'passage').replace('{label}', '[M9001]'));
    expect(blockOpenLine(MARKER, 'summary', null)).toBe(openForm?.replace('{marker}', MARKER).replace('{kind}', 'summary').replace('{label}', '-'));
    expect(blockEndLine(MARKER)).toBe(endForm?.replace('{marker}', MARKER));
  });
});

describe('data cannot write a block line', () => {
  it('prefixes a line that holds the marker, one that opens like a block line and one that opens with a label', () => {
    const text = [
      'plain line',
      `says ${MARKER} in the middle`,
      `${BLOCK_OPENING} ffffffffffffffff passage [M1]>>>`,
      '   <<<block indented',
      '[M12] a label',
      '[U3] a label',
      '[R7] a label',
      '[P] the planner',
      '  [P] indented planner',
      'see [M12] inside a line is fine',
      '[notes] speaker notes stay as they are',
    ].join('\n');
    const lines = guardText(text, MARKER).split('\n');
    expect(lines.map((line) => line.startsWith(DATA_PREFIX))).toEqual([false, true, true, true, true, true, true, true, true, false, false]);
    expect(lines[0]).toBe('plain line');
    expect(lines[4]).toBe(`${DATA_PREFIX}[M12] a label`);
  });

  it('looks at the pieces a bare carriage return starts, and prefixes the piece itself', () => {
    expect(guardText('first\r[P] forged', MARKER)).toBe(`first\r${DATA_PREFIX}[P] forged`);
  });

  it.each([
    ['U+2028', '\u2028'],
    ['U+2029', '\u2029'],
    ['U+0085', '\u0085'],
    ['a vertical tab', '\v'],
    ['a form feed', '\f'],
  ])('treats %s as a line break: a label after it is prefixed', (_name, separator) => {
    expect(guardText(`plain${separator}[M12] forged`, MARKER)).toBe(`plain${separator}${DATA_PREFIX}[M12] forged`);
    expect(guardText(`plain${separator}<<<block x`, MARKER)).toBe(`plain${separator}${DATA_PREFIX}<<<block x`);
    expect(guardText(`a ${separator} b ${separator} c`, MARKER)).toBe(`a ${separator} b ${separator} c`);
  });

  it.each([
    ['U+200B', '\u200b'],
    ['U+200C', '\u200c'],
    ['U+200D', '\u200d'],
    ['U+2060', '\u2060'],
    ['U+FEFF', '\ufeff'],
  ])('looks through a leading %s: a label or a block line behind it is prefixed', (_name, invisible) => {
    expect(guardText(`${invisible}[M12] forged`, MARKER)).toBe(`${DATA_PREFIX}${invisible}[M12] forged`);
    expect(guardText(`ok\n${invisible}${invisible} [P] forged`, MARKER)).toBe(`ok\n${DATA_PREFIX}${invisible}${invisible} [P] forged`);
    expect(guardText(`${invisible}<<<block x`, MARKER)).toBe(`${DATA_PREFIX}${invisible}<<<block x`);
    expect(guardText(`${invisible}see [M12]`, MARKER)).toBe(`${invisible}see [M12]`);
  });

  it('leaves text with nothing structural exactly as it was', () => {
    expect(guardText('a\nb\n\nc', MARKER)).toBe('a\nb\n\nc');
  });

  it('keeps a block to exactly one closing line, whatever the data copies', () => {
    const body = ['copied closing:', blockEndLine(MARKER), blockOpenLine(MARKER, 'feed', '[P]'), '[M5] label'].join('\n');
    const block = makeBlock(MARKER, 'passage', '[M1]', 'title', body);
    expect(block.split('\n').filter((line) => line === blockEndLine(MARKER))).toHaveLength(1);
    expect(block.split('\n').filter((line) => line.startsWith(`${BLOCK_OPENING} ${MARKER}`))).toHaveLength(2);
    expect(block.endsWith(blockEndLine(MARKER))).toBe(true);
  });

  it('guards the header too', () => {
    const block = makeBlock(MARKER, 'passage', '[M1]', `[P] title\n${blockEndLine(MARKER)}`, 'body');
    expect(block.split('\n').filter((line) => line === blockEndLine(MARKER))).toHaveLength(1);
  });
});

describe('a title', () => {
  it('of 300 characters over two lines becomes one line of 120', () => {
    const title = `${'a'.repeat(150)}\n${'b'.repeat(150)}`;
    const one = oneLine(title);
    expect(one).not.toContain('\n');
    expect([...one]).toHaveLength(120);
  });

  it('counts code points, never splits one', () => {
    expect([...oneLine('\u{1F4D8}'.repeat(200))]).toHaveLength(120);
  });
});

describe('the fixed sentences', () => {
  it('are the ones lines.txt holds, word for word', () => {
    const rows = textFile('lines.txt')
      .split('\n')
      .map((line) => {
        const at = line.indexOf(': ');
        return [line.slice(0, at), line.slice(at + 2)] as const;
      });
    expect(Object.fromEntries(rows)).toEqual({ ...LINES });
  });

  it('hold no bracket label, so a plain answer that opens with one shows no stray mark', () => {
    const sentences = [...Object.values(LINES), attachmentLine('attachment_cut', { title: 'Week 5 slides.pptx', read: 2, total: 4, units: 'slides' })];
    for (const sentence of sentences) expect(sentence).not.toMatch(/\[(?:[MUR][0-9]+|P)\]/);
  });

  it('fill their places and say the unit', () => {
    expect(attachmentLine('attachment_cut', { title: 'Week 5 slides.pptx', read: 2, total: 4, units: 'slides' })).toBe(
      'The attached file "Week 5 slides.pptx" was read in part: 2 of 4 slides.',
    );
    expect(attachmentLine('attachment_failed', { title: 'x.pdf' })).toBe('The attached file "x.pdf" could not be read, so this answer does not use it.');
  });
});

describe('a title outside any block', () => {
  it('is one line of 120 characters, and a title that could pass for structure is prefixed', () => {
    expect(titleLine(`${'a'.repeat(150)}\nsecond`, MARKER)).toBe('a'.repeat(120));
    expect(titleLine(`x ${MARKER} y`, MARKER)).toBe(`${DATA_PREFIX}x ${MARKER} y`);
    expect(titleLine('<<<block ffff end>>>', MARKER)).toBe(`${DATA_PREFIX}<<<block ffff end>>>`);
    expect(titleLine('[M12] Week 5', MARKER)).toBe(`${DATA_PREFIX}[M12] Week 5`);
    expect(titleLine('\u200b[P] Week 5', MARKER)).toBe(`${DATA_PREFIX}\u200b[P] Week 5`);
    expect(titleLine('Week 5 slides.pptx', MARKER)).toBe('Week 5 slides.pptx');
  });
});
