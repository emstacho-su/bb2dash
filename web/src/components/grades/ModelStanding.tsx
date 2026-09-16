'use client';

/**
 * "Our model" (Phase 10b, R-12) — the one container every figure bb2dash
 * computes is rendered in.
 *
 * Under Blackboard's own header, on both `/grades` and the course tab. It says
 * either the standing (graded so far, then zeros on the rest and best case, a
 * one-line explanation, any part left out, and how it compares with
 * Blackboard's number) or, for a course the model cannot speak for, exactly
 * why. Every sentence comes from `grade-model/labels.ts`; rounding happens
 * here, once (`grade-model-format.ts`).
 *
 * The course tab passes the solver and the Reset button as `children`, so the
 * numbers they print sit inside the same labelled container — the honesty rule
 * is structural, not a styling convention.
 */

import type { ReactNode } from 'react';
import type { Agreement, ComputedResult, ModelResult } from '@/lib/grade-model/types';
import {
  AGREES_TEXT,
  DELTA_REASON_TEXT,
  MODEL_LABEL,
  PROJECTION_LABEL,
  WHAT_IF_NOTE,
  differsText,
  mutedText,
  notComputableText,
} from '@/lib/grade-model/labels';
import {
  agreementDeltaText,
  agreementUnitText,
  explanationText,
  mutedPartNames,
  type PartComponent,
  standingText,
  unlinkedCountText,
} from '@/lib/grade-model-format';
import styles from './GradeModel.module.css';

function AgreementLine({ agreement }: { agreement: Agreement }) {
  if (agreement.status === 'agrees') {
    return <p className={styles.line}>{AGREES_TEXT}</p>;
  }
  return (
    <div>
      <p className={styles.line}>
        {differsText(agreementDeltaText(agreement), agreementUnitText(agreement.unit))}
      </p>
      <ul className={styles.reasons}>
        {agreement.reasons.map((reason) => (
          <li key={reason}>{DELTA_REASON_TEXT[reason]}</li>
        ))}
      </ul>
    </div>
  );
}

function ComputedStanding({
  result,
  realResult,
  components,
}: {
  result: ComputedResult;
  realResult: ModelResult | null;
  components: readonly PartComponent[];
}) {
  const { graded_so_far: graded, zeros_on_rest: zeros, best_case: best } = result.standings;
  const muted = mutedPartNames(result.components, components);

  return (
    <>
      <div className={styles.headlineRow}>
        <span className={styles.headline}>{standingText(graded)}</span>
        <span className={styles.note}>{PROJECTION_LABEL.graded_so_far}</span>
        {result.usesHypotheticals && <span className={styles.whatIfNote}>{WHAT_IF_NOTE}</span>}
      </div>
      <p className={styles.line}>
        {PROJECTION_LABEL.zeros_on_rest} {standingText(zeros)} · {PROJECTION_LABEL.best_case}{' '}
        {standingText(best)}
      </p>
      <p className={styles.note}>{explanationText(result.components, realResult, components)}</p>
      {muted.length > 0 && <p className={styles.note}>{mutedText(muted)}</p>}
      {result.agreement && <AgreementLine agreement={result.agreement} />}
      {result.unlinkedScoredKeys.length > 0 && (
        <p className={styles.note}>{unlinkedCountText(result.unlinkedScoredKeys.length)}</p>
      )}
    </>
  );
}

export function ModelStanding({
  result,
  realResult,
  components,
  error = null,
  loading = false,
  children,
}: {
  /** The engine's answer; null while its inputs load or when it failed. */
  result: ModelResult | null;
  /** The same course with no what-if values (`runModel`), so only real scores count a part as graded (R3-2). */
  realResult: ModelResult | null;
  /** The scheme's components, so the wording counts parts, not pieces (R2-12). */
  components: readonly PartComponent[];
  /** Why the model could not be computed or its rows could not be read. */
  error?: string | null;
  loading?: boolean;
  /** Course tab only: the solver and Reset, inside the same container. */
  children?: ReactNode;
}) {
  return (
    <section className={styles.model} aria-label={MODEL_LABEL} data-model="">
      <span className={styles.kicker} aria-hidden="true">
        {MODEL_LABEL}
      </span>
      {error ? (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      ) : loading || result === null ? (
        <p className={styles.note}>loading…</p>
      ) : result.state === 'not_computable' ? (
        <p className={styles.line}>{notComputableText(result.reason, result.unscoredManual)}</p>
      ) : (
        <ComputedStanding result={result} realResult={realResult} components={components} />
      )}
      {children}
    </section>
  );
}
