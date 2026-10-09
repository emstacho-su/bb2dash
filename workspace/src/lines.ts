/**
 * The fixed sentences the runner writes itself (brief 109, What a failure looks like), so they do
 * not depend on the model. The wording is the PM's: `test/fixtures/contract24/lines.txt` is the
 * reference and a test compares this file with it.
 *
 * `{title}`, `{read}`, `{total}` and `{units}` are filled by `attachmentLine`.
 */

export const LINES = Object.freeze({
  empty: 'No passage of your course files or uploads matched this question, so this answer comes from general knowledge.',
  search_failed: 'I could not search your course files and uploads this time, so this answer does not draw on them.',
  attachment_not_ready: 'The attached file "{title}" has not been read yet, so this answer does not use it.',
  attachment_failed: 'The attached file "{title}" could not be read, so this answer does not use it.',
  attachment_missing: 'The attached file "{title}" is no longer there, so this answer does not use it.',
  attachment_cut: 'The attached file "{title}" was read in part: {read} of {total} {units}.',
});

export type LineKey = keyof typeof LINES;

export interface AttachmentLineFacts {
  readonly title: string;
  readonly read?: number;
  readonly total?: number;
  /** The unit's plural, such as `slides` or `pages`; `units` when the kinds differ. */
  readonly units?: string;
}

/** A fixed sentence with its places filled. A place with no value is left as written. */
export function attachmentLine(key: Exclude<LineKey, 'empty' | 'search_failed'>, facts: AttachmentLineFacts): string {
  const values: Record<string, string | undefined> = {
    title: facts.title,
    read: facts.read === undefined ? undefined : String(facts.read),
    total: facts.total === undefined ? undefined : String(facts.total),
    units: facts.units,
  };
  return LINES[key].replace(/\{(title|read|total|units)\}/g, (whole, name: string) => values[name] ?? whole);
}
