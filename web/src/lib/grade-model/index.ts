/**
 * bb2dash — grade model engine entry point.
 *
 * Pure and deterministic: no I/O, no clock, no mutation of its input.
 *
 * Phase 10b's public surface was `projectCourse` / `solveTarget` / `itemStates`
 * over three projections, a what-if scenario and an agrees-with-Blackboard
 * sentence. Phase 12b (G-1, P-grades-3) removed that layer on Stack's pick —
 * "keep the engine's math, remove the layer around it". What the app reads now
 * is `gradedSoFar()` in `@/lib/graded-so-far`, which composes the pieces below;
 * this module re-exports the arithmetic and its vocabulary, nothing more.
 *
 * The implementation still lives in the modules beside this one: `items.ts`
 * (what counts), `prepare.ts` (the shared preparation), `tree.ts` (children,
 * extra credit, capacity), `aggregations/` (one module per syllabus rule),
 * `evaluate.ts` + `project.ts` (totals and standings), `checks.ts` (the order
 * of checks), `letter.ts`.
 */

export * from './types';
export {
  componentResults,
  evaluateCourse,
  evaluateModel,
  standingFor,
  standingOf,
} from './project';
export { letterForPct as letterFor } from './letter';
