/**
 * The pure part of the search layer: snippet scrubbing (a hard CLAUDE.md rule —
 * a professor's speaker notes must never render as slide content), the
 * keyword-match label, and the part hint.
 */

import { describe, expect, it } from 'vitest';
import {
  FIRST_LABELLED_PART,
  SEMANTIC_SIMILARITY_MIN,
  isKeywordMatch,
  matchedPart,
  scrubSnippet,
} from '@/lib/queries.search';

describe('scrubSnippet — speaker notes', () => {
  it('cuts everything from the [notes] marker to the end', () => {
    const out = scrubSnippet('What is a system?\n[notes] Hoffer et al., remind them about the quiz.');
    expect(out.text).toBe('What is a system?');
    expect(out.notesHidden).toBe(true);
    expect(out.notesOnly).toBe(false);
  });

  it('tolerates the marker variants the corpus actually contains', () => {
    for (const marker of ['[notes]', '[note]', '[ notes: ]', '[NOTES]']) {
      const out = scrubSnippet(`Slide body\n${marker} private commentary`);
      expect(out.text).toBe('Slide body');
      expect(out.notesHidden).toBe(true);
    }
  });

  it('reports notesOnly when nothing survives the cut', () => {
    const out = scrubSnippet('[notes] The whole unit is the professor\u2019s notes.');
    expect(out.text).toBe('');
    expect(out.notesOnly).toBe(true);
  });

  it('leaves a snippet with no notes untouched apart from whitespace', () => {
    const out = scrubSnippet('Confidentiality, integrity, availability.');
    expect(out).toEqual({
      text: 'Confidentiality, integrity, availability.',
      notesHidden: false,
      notesOnly: false,
    });
  });

  it('treats null, undefined and empty input as an empty snippet', () => {
    for (const raw of [null, undefined, '']) {
      expect(scrubSnippet(raw)).toEqual({ text: '', notesHidden: false, notesOnly: false });
    }
  });
});

describe('scrubSnippet — page furniture', () => {
  it('drops "Page N" headers, with or without a trailing document code', () => {
    const out = scrubSnippet('       Page 2                                        9B21E001\nThe case begins here.');
    expect(out.text).toBe('The case begins here.');
  });

  it('drops a lone slide or page number line but keeps a number inside a sentence', () => {
    const out = scrubSnippet('Terms\n4\nThe exam is worth 40 points.');
    expect(out.text).toBe('Terms\nThe exam is worth 40 points.');
  });

  it('keeps a number line longer than a page number', () => {
    expect(scrubSnippet('12345').text).toBe('12345');
  });

  it('normalises vertical tabs, blank runs and doubled spaces', () => {
    const out = scrubSnippet('** Final Exam **\u000b\n\n\nTuesday    May 5');
    expect(out.text).toBe('** Final Exam **\nTuesday May 5');
  });
});

describe('isKeywordMatch — the 0.80 boundary', () => {
  it('uses 0.80, the valley between the semantic and lexical clusters', () => {
    expect(SEMANTIC_SIMILARITY_MIN).toBe(0.8);
  });

  it('is true just below the floor and false at or above it', () => {
    expect(isKeywordMatch({ similarity: 0.7999 })).toBe(true);
    expect(isKeywordMatch({ similarity: 0.79 })).toBe(true);
    expect(isKeywordMatch({ similarity: SEMANTIC_SIMILARITY_MIN })).toBe(false);
    expect(isKeywordMatch({ similarity: 0.8001 })).toBe(false);
    expect(isKeywordMatch({ similarity: 0.9 })).toBe(false);
  });

  it('is true when the row carries no similarity — an unembedded unit is a keyword hit', () => {
    // The wire shape for a unit with no embedding: hybrid_search_file_text
    // returns the row with a null similarity, not a missing field.
    expect(isKeywordMatch({ similarity: null })).toBe(true);
  });
});

describe('matchedPart', () => {
  it('names a part only from part 2 on', () => {
    expect(FIRST_LABELLED_PART).toBe(2);
    expect(matchedPart({ part_no: 3 })).toBe(3);
    expect(matchedPart({ part_no: FIRST_LABELLED_PART })).toBe(2);
  });

  it('says nothing for part 1, a missing part, or a pre-021 backend', () => {
    expect(matchedPart({ part_no: 1 })).toBeNull();
    expect(matchedPart({ part_no: null })).toBeNull();
    expect(matchedPart({})).toBeNull();
  });
});
