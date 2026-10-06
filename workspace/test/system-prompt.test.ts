import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ARG_MAX_BYTES } from '../src/config.js';
import { ALLOWED_TOOLS, RAG_COLLECTIONS } from '../src/hooks/gate-rules.js';
import { readSystemPrompt } from '../src/providers/claude-cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(HERE, '..', 'prompts', 'system.md');
const raw = fs.readFileSync(FILE, 'utf8');

/** The prompt as sentences: split after each full stop, white space folded. */
const sentences = raw
  .split(/(?<=\.)\s+/)
  .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
  .filter((sentence) => sentence !== '');

function sentenceWith(...parts: RegExp[]): string | undefined {
  return sentences.find((sentence) => parts.every((part) => part.test(sentence)));
}

describe('prompts/system.md, one sentence per rule', () => {
  it('says the assistant is read-only', () => {
    expect(sentenceWith(/read-only/, /nothing you do can change/)).toBeDefined();
  });

  it('asks for the file or the note behind each fact', () => {
    expect(sentenceWith(/name the file or the note each fact came from/)).toBeDefined();
  });

  it('forbids an invented number', () => {
    expect(sentenceWith(/^Never invent a number\.$/)).toBeDefined();
    expect(sentenceWith(/only when a tool result shows it/)).toBeDefined();
  });

  it('has speaker notes labelled as speaker notes', () => {
    expect(sentenceWith(/\[notes\] marker/, /speaker notes/)).toBeDefined();
    expect(sentenceWith(/label it as speaker notes/)).toBeDefined();
  });

  it('sends grades to the Grades screen', () => {
    expect(sentenceWith(/Grades live on the Grades screen/)).toBeDefined();
  });

  it('requires collection on every search_context call, with the two names and no other', () => {
    expect(sentenceWith(/Every search_context call must pass collection/)).toBeDefined();
    const naming = sentenceWith(/bb2dash-inbox-decisions/, /Inbox item/, /\bbb2dash for the project's history/);
    expect(naming).toBeDefined();
    for (const collection of RAG_COLLECTIONS) expect(raw).toContain(collection);
    expect(sentenceWith(/^No other collection value works\.$/)).toBeDefined();
  });

  it('passes course when the question names one, and the search text as q', () => {
    expect(sentenceWith(/search_materials takes the search text as q/, /when the question names a course, also pass course/)).toBeDefined();
  });

  it('says whole notes are not available', () => {
    expect(sentenceWith(/^Whole notes are not available:/)).toBeDefined();
    expect(sentenceWith(/answer from the search results/)).toBeDefined();
  });

  it('forbids listing other collections', () => {
    expect(sentenceWith(/^Do not list or describe other collections/)).toBeDefined();
  });

  it('gives a quoted score its date and points to the Grades screen for the current figure', () => {
    expect(sentenceWith(/A score quoted from a decision note is what it was on the date of that note/)).toBeDefined();
    expect(sentenceWith(/say the date/, /Grades screen has the current figure/)).toBeDefined();
  });

  it('asks for plain text without Markdown symbols', () => {
    expect(sentenceWith(/^Answer in plain text without Markdown symbols:/)).toBeDefined();
  });

  it('has a cut document said to be cut', () => {
    expect(sentenceWith(/get_material_text returns only the first 20,000 characters/)).toBeDefined();
    expect(sentenceWith(/When a document was cut, say that only its first part was read\./)).toBeDefined();
  });
});

describe('prompts/system.md, as a file', () => {
  it('names the four tools the assistant has and no other tool', () => {
    for (const tool of ALLOWED_TOOLS) expect(raw).toContain(tool.slice(tool.lastIndexOf('__') + 2));
    expect(raw).not.toMatch(/get_document|Bash|WebFetch|WebSearch/);
  });

  it('carries no course AI-use rule', () => {
    expect(raw).not.toMatch(/AI[- ]use|AI policy|academic integrity|generative AI|ChatGPT/i);
  });

  it('holds nothing bound to one machine and no secret shape', () => {
    expect(raw).not.toMatch(/[A-Za-z]:[\\/]|\.ps1|powershell|Move-Item|onedrive/i);
    expect(raw).not.toMatch(/postgres(ql)?:\/\/|sb_secret_|eyJ|sk-ant-/);
  });

  it('fits in one argument with room to spare, and is passed without its trailing line end', () => {
    expect(Buffer.byteLength(raw, 'utf8')).toBeLessThan(ARG_MAX_BYTES / 16);
    expect(raw.endsWith('\n')).toBe(true);
    expect(readSystemPrompt(FILE)).toBe(raw.trimEnd());
    expect(readSystemPrompt(FILE).endsWith('\n')).toBe(false);
  });

  it('is plain text itself: no Markdown heading, list or emphasis marks', () => {
    for (const line of raw.split('\n')) {
      expect(line).not.toMatch(/^\s*(#{1,6}\s|[-*+]\s|\d+\.\s)/);
      expect(line).not.toMatch(/\*\*|__/);
    }
  });
});
