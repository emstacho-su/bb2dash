/**
 * bb2dash — grade model engine entry point (Phase 10b, R-12).
 *
 * Pure and deterministic: no I/O, no clock, no mutation of its input. The
 * signatures are the frozen Contract (`docs/planning/68_PHASE10B_grade_model.md`
 * §Engine); W-19 replaces the stub bodies and adds the implementation modules
 * beside this file.
 */

import type { ModelInput, ModelResult, SchemeInput, TargetResult } from './types';

export * from './types';

export const DEFAULT_TARGET_LETTER = 'A-';

const NOT_IMPLEMENTED = 'grade-model: not implemented (W-19)';

export function projectCourse(input: ModelInput): ModelResult {
  void input;
  throw new Error(NOT_IMPLEMENTED);
}

export function solveTarget(input: ModelInput, letter: string): TargetResult {
  void input;
  void letter;
  throw new Error(NOT_IMPLEMENTED);
}

export function letterFor(pct: number, scheme: SchemeInput): string | null {
  void pct;
  void scheme;
  throw new Error(NOT_IMPLEMENTED);
}
