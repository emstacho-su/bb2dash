/**
 * bb2dash — the grade feature's fixed strings.
 *
 * Phase 10b froze a page of them: the "Our model" heading, three projection
 * names, the what-if note, the solver's four sentences, the agrees/differs
 * pair, the muted-part sentence and the reasons a model was not computed.
 * Phase 12b (G-1, P-grades-3) removed every feature they belonged to.
 *
 * What is left is the "Counts toward…" picker, which survives because the
 * figure still needs Blackboard's columns linked to the syllabus. The figure's
 * own strings live beside the component that renders them
 * (`components/grades/GradedSoFarFigure.tsx`), so a reader of that file can see
 * every word it can say without following an import.
 */

/** The picker's own label, on a column with no confirmed syllabus rule. */
export const LINK_LABEL = 'Counts toward…';

/** The picker's "this column counts toward nothing" choice. */
export const LINK_NOT_GRADED = 'Not graded';

/** Marks a link V-1 recorded but did not sign off. */
export const LINK_UNSURE = 'unsure';
