import { describe, expect, it } from 'vitest';
import {
  formatCourses,
  formatEmptyResults,
  formatMaterialText,
  formatSearchResults,
  formatTextNotFound,
  truncate,
  type SearchContext,
} from '../src/format.js';
import { COURSES, makeHit, makeText } from './helpers.js';

const context: SearchContext = { q: 'risk assessment', course: null, mode: 'hybrid', limit: 10, minSimilarity: 0.78 };

describe('formatSearchResults', () => {
  it('leads with the count and explains the two scores', () => {
    const out = formatSearchResults(context, { hits: [makeHit()], floorApplied: true });
    expect(out).toMatch(/^1 result for "risk assessment"/);
    expect(out).toContain('similarity');
    expect(out).toContain('ordering only');
  });

  it('renders every field an agent needs to follow up', () => {
    const out = formatSearchResults(context, { hits: [makeHit()], floorApplied: true });
    expect(out).toContain('IST.323');
    expect(out).toContain('lecture_slides');
    expect(out).toContain('slide 28');
    expect(out).toContain('text_id: 495');
    expect(out).toContain('similarity: 0.8912');
    expect(out).toContain('Lecture3');
    expect(out).toContain('get_material_text');
  });

  it('labels a hit below the floor as a keyword match rather than hiding it', () => {
    const out = formatSearchResults(context, { hits: [makeHit({ similarity: 0.61 })], floorApplied: true });
    expect(out).toContain('0.6100');
    expect(out).toMatch(/below the 0.78 floor/);
    expect(out).toMatch(/keyword/i);
  });

  it('says when the server did not apply the floor (v2 search function)', () => {
    const out = formatSearchResults(context, { hits: [makeHit()], floorApplied: false });
    expect(out).toMatch(/floor was not applied server-side/i);
  });

  it('shows rank for fts hits and n/a similarity', () => {
    const out = formatSearchResults({ ...context, mode: 'fts' }, {
      hits: [makeHit({ score: null, similarity: null, rank: 0.06 })],
      floorApplied: false,
    });
    expect(out).toContain('rank: 0.06');
    expect(out).toContain('similarity: n/a');
  });

  it('flags speaker notes in an excerpt', () => {
    const out = formatSearchResults(context, {
      hits: [makeHit({ excerpt: 'Slide body [notes] private instructor commentary' })],
      floorApplied: true,
    });
    expect(out).toMatch(/\[notes\]/);
    expect(out).toMatch(/speaker notes/i);
  });
});

describe('formatEmptyResults', () => {
  it('states that an empty result is a real answer', () => {
    const out = formatEmptyResults(context, []);
    expect(out).toContain('Nothing relevant');
    expect(out).toMatch(/not a failure|not an error/);
    expect(out).toContain('0.78');
  });

  it('lists the real course ids when a course filter was used', () => {
    const out = formatEmptyResults({ ...context, course: 'IST323' }, COURSES);
    expect(out).toContain('IST.323');
    expect(out).toContain('Intro to Cybersecurity');
    expect(out).toMatch(/exact/i);
  });

  it('suggests lowering the floor only when a floor is in play', () => {
    expect(formatEmptyResults(context, [])).toMatch(/min_similarity/);
    expect(formatEmptyResults({ ...context, minSimilarity: null }, [])).not.toMatch(/lower `min_similarity`/i);
  });
});

describe('formatMaterialText', () => {
  it('renders the unit with its file context and warns about [notes]', () => {
    const out = formatMaterialText(makeText());
    expect(out).toContain('# Lecture3');
    expect(out).toContain('IST.323');
    expect(out).toContain('slide 28');
    expect(out).toContain('text_id: 495');
    expect(out).toContain('Risk assessment');
    expect(out).toMatch(/speaker notes/i);
  });

  it('does not warn when there are no notes', () => {
    expect(formatMaterialText(makeText({ text: 'plain' }))).not.toMatch(/speaker notes/i);
  });

  it('truncates very long units and says so', () => {
    const out = formatMaterialText(makeText({ text: 'x'.repeat(50_000) }));
    expect(out.length).toBeLessThan(30_000);
    expect(out).toContain('truncated');
  });
});

describe('formatTextNotFound / formatCourses / truncate', () => {
  it('not-found echoes the id and is not phrased as an error', () => {
    const out = formatTextNotFound(42);
    expect(out).toContain('42');
    expect(out).toMatch(/not an error/);
  });

  it('courses render as a table with ids first', () => {
    const out = formatCourses(COURSES);
    expect(out).toContain('ECN.304');
    expect(out).toContain('IM&T Capstone');
    expect(out).toMatch(/3 courses/);
  });

  it('truncate is a no-op under the limit', () => {
    expect(truncate('abc', 10)).toBe('abc');
    expect(truncate('abcdef', 3)).toContain('truncated');
  });
});


describe('sub-floor labels depend on how the row got here', () => {
  const low = makeHit({ similarity: 0.61 });

  it('hybrid with the floor applied: a literal keyword hit', () => {
    const out = formatSearchResults(context, { hits: [low], floorApplied: true });
    expect(out).toMatch(/literal keyword match/);
  });

  it('hybrid without the floor applied (v2 function): could be either, and says so', () => {
    const out = formatSearchResults(context, { hits: [low], floorApplied: false });
    expect(out).toMatch(/server did not apply it/);
    expect(out).not.toMatch(/literal keyword match/);
  });

  it('vector mode: a weak semantic match, never called a keyword hit', () => {
    const out = formatSearchResults({ ...context, mode: 'vector' }, { hits: [low], floorApplied: false });
    expect(out).toMatch(/weak semantic match/);
    expect(out).not.toMatch(/keyword match/);
  });

  it('an unembedded unit in hybrid mode is labelled keyword-only evidence', () => {
    const out = formatSearchResults(context, { hits: [makeHit({ similarity: null })], floorApplied: true });
    expect(out).toMatch(/no embedding/);
  });
});

describe('excerpt provenance (migrations 021/024)', () => {
  function excerptLine(hit: Parameters<typeof makeHit>[0], mode: SearchContext['mode'] = 'hybrid'): string {
    const out = formatSearchResults({ ...context, mode }, { hits: [makeHit(hit)], floorApplied: true });
    return out.split('\n').find((line) => line.startsWith('- excerpt:')) ?? '';
  }

  it('describes the excerpt by mode first: fts is a headline over the whole unit', () => {
    // snippet_source is 'fts_headline' in fts mode too, but nothing was sliced
    // there — reading the source alone would claim a passage that does not exist.
    expect(excerptLine({ snippetSource: 'fts_headline', partNo: 4 }, 'fts')).toBe(
      '- excerpt: keyword headline over the whole unit',
    );
  });

  it('describes a vector hit as the full unit text, naming the part that matched', () => {
    expect(excerptLine({ snippetSource: 'vector_part', partNo: null }, 'vector')).toBe('- excerpt: full unit text');
    expect(excerptLine({ snippetSource: 'vector_part', partNo: 3 }, 'vector')).toBe(
      '- excerpt: full unit text — part 3 matched',
    );
  });

  it('calls a hybrid fts_headline or vector_part excerpt the matched passage', () => {
    expect(excerptLine({ snippetSource: 'fts_headline' })).toBe('- excerpt: matched passage');
    expect(excerptLine({ snippetSource: 'vector_part' })).toBe('- excerpt: matched passage');
  });

  it('calls a hybrid unit_head excerpt the unit head and warns the match may be further in', () => {
    const line = excerptLine({ snippetSource: 'unit_head' });
    expect(line).toContain('unit head');
    expect(line).not.toContain('matched passage');
    expect(line).not.toContain('older server');
    expect(line).toMatch(/further in/);
  });

  it('says the server is older when a hybrid row carries no snippet_source at all', () => {
    const line = excerptLine({ snippetSource: null });
    expect(line).toContain('unit head (older server)');
    expect(line).toMatch(/further in/);
  });

  it('names the part when the snippet was cut from part 2 or later', () => {
    expect(excerptLine({ snippetSource: 'vector_part', partNo: 3 })).toBe('- excerpt: matched passage (part 3)');
  });

  it('does not name part 1 or a whole-unit snippet — both are the head of the unit', () => {
    expect(excerptLine({ snippetSource: 'fts_headline', partNo: 1 })).not.toContain('part');
    expect(excerptLine({ snippetSource: 'fts_headline', partNo: null })).not.toContain('part');
  });
});
