// bb2dash :: scripts/lib/accept-proofs-shapes.mjs
// What an id, a time and a planner fingerprint look like, and the names that hold text. One list
// each, read on the way in (a parameter is refused unless it is of its type) and on the way out
// (`detail` keeps a string only when it is one of these shapes). No side effects on import.

/** A lower-case uuid. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** An ISO time with its zone, to the microsecond at most. */
export const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** Whether a text is an ISO time that is also a real moment (not the 40th of a 13th month). */
export const isTime = (raw) => ISO_TIME.test(raw) && !Number.isNaN(Date.parse(raw));

/** The time form the fingerprint is written in: UTC, to the microsecond. */
const STAMP = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z`;

/** The planner fingerprint, as the proof `planner-fingerprint` returns it and `planner-unchanged` takes it. */
export const FINGERPRINT = new RegExp(`^ap=(none|${STAMP}),rp=(none|${STAMP}),n=\\d{1,9},at=${STAMP}$`);

/**
 * Names that hold what someone typed or what a model answered: columns, and keys of a json value.
 * A statement that names one is refused (accept-proofs-lint.mjs, with two narrow exceptions), and
 * a row that carries one as a key, at any depth, fails its proof (accept-proofs-detail.mjs).
 */
export const TEXT_NAMES = Object.freeze(['content', 'prompt', 'title', 'query', 'note', 'history', 'params', 'result', 'description', 'answer']);
