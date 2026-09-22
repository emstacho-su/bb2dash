'use client';

/**
 * The assignment detail, as one body (R-05; Phase 12b T-2).
 *
 * What it shows: the synced facts, the grade component the item counts toward,
 * the rest of its series, the late and AI policies verbatim, the planner block
 * Stack owns, and — since Phase 10a — the submission block: Blackboard's
 * submission status, the attempts it recorded, the files that actually went in,
 * and the drop zone for staging one to attach.
 *
 * What it still does NOT show: any score. The body is about the work, not the
 * mark (Requirements §6.2 #4, Stack's answer 6); scores live on the Grades
 * screens.
 *
 * Unknowns read "not recorded" rather than being hidden or filled in.
 *
 * ONE BODY, TWO SURFACES. `AssignmentPopout` mounts this inside the `?item=`
 * modal shell; `/course/[id]/assignment/[…]` mounts the same component on a
 * page of its own. Neither owns any markup the other copies — the only
 * difference is the frame around it.
 */

import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import { courseCodeFromId } from '@/lib/queries.today';
// S-1 (P-grades-7): the one status vocabulary, and the one menu that knows
// what to do with a retired value still stored on a row.
import { statusLabel } from '@/lib/progress-status';
import { useCourse, type ProgressStatus } from '@/lib/queries';
import {
  useAssignment,
  useAssignmentProgress,
  useAssignmentSeries,
  useGradeComponent,
  useGradingScheme,
} from '@/lib/queries.popout';
import {
  QueryState,
  isQueryUnresolved,
  queryStateText,
} from '@/components/shared/QueryState';
import { AssignmentPlannerBlock } from './AssignmentPlannerBlock';
import {
  NOT_RECORDED,
  dueDateText,
  formatClock,
  formatDate,
} from './assignment-detail-format';
import { SubmissionBlock } from './SubmissionBlock';
import styles from './Popout.module.css';

/**
 * A status label. The view types `status` loosely (string | null), so an
 * unrecognised value is shown as itself rather than swallowed.
 */
function statusText(status: string | null | undefined): string {
  const key = status ?? 'not_started';
  return statusLabel(key as ProgressStatus) ?? key.replace(/_/g, ' ');
}

export function AssignmentDetailBody({ assignmentId }: { assignmentId: string }) {
  const assignmentQ = useAssignment(assignmentId);
  const progressQ = useAssignmentProgress(assignmentId);
  const assignment = assignmentQ.data ?? null;
  const courseId = assignment?.course_id;

  const courseQ = useCourse(courseId ?? '');
  const componentQ = useGradeComponent(assignment?.component_id);
  const schemeQ = useGradingScheme(courseId);
  const seriesQ = useAssignmentSeries(courseId, assignment?.series_key);

  if (assignmentQ.isPending) {
    return <p className={styles.state}>Loading assignment…</p>;
  }
  if (assignmentQ.isError) {
    return (
      <p className={styles.problem} role="alert">
        Could not load this assignment: {(assignmentQ.error as Error).message}
      </p>
    );
  }
  if (!assignment) {
    return <p className={styles.state}>No assignment with id {assignmentId}.</p>;
  }

  const component = componentQ.data ?? null;
  const scheme = schemeQ.data ?? null;
  const series = seriesQ.data ?? [];
  const course = courseQ.data ?? null;
  const clock = formatClock(assignment.due_at);

  return (
    <>
      <div className={styles.breadcrumb}>
        <span className={tokens.tagAccent}>{courseCodeFromId(assignment.course_id)}</span>
        {component && <span className={tokens.tagNeutral}>{component.name}</span>}
        {assignment.sequence_no != null && (
          <span className={tokens.mono}>#{assignment.sequence_no}</span>
        )}
        {assignment.confidence !== 'confirmed' && (
          <span className={tokens.tagOutline}>{assignment.confidence}</span>
        )}
      </div>

      <div>
        <h2 className={styles.title}>{assignment.title}</h2>
        <div className={styles.subTitle}>
          <span>{assignment.type.replace(/_/g, ' ')}</span>
          {assignment.is_group && <span>· group work</span>}
          {assignment.is_extra_credit && <span>· extra credit</span>}
        </div>
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={tokens.kicker}>Due</span>
          {/* Most rows record only the instant; `dueDateText` reads the day
              off it in New York rather than saying "not recorded" next to a
              perfectly good clock time (PM walk). */}
          <span className={styles.factValue}>
            {dueDateText(assignment.due_date, assignment.due_at)}
          </span>
          <span className={styles.factNote}>
            {clock || assignment.due_rule || 'time not recorded'}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={tokens.kicker}>Points</span>
          <span className={styles.factValue}>
            {assignment.points_possible == null ? NOT_RECORDED : assignment.points_possible}
          </span>
          <span className={styles.factNote}>
            {queryStateText(componentQ, 'the grade component') ??
              (component
                ? `${component.name}${component.points != null ? ` · ${component.points} pts` : ''}${
                    component.weight_pct != null ? ` · ${component.weight_pct}% of the grade` : ''
                  }`
                : 'no grade component recorded')}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={tokens.kicker}>Source</span>
          <span className={styles.factValue}>{assignment.source.replace(/_/g, ' ')}</span>
          <span className={styles.factNote}>{assignment.source_ref ?? NOT_RECORDED}</span>
        </div>
      </div>

      <section className={styles.block}>
        <span className={tokens.kicker}>Instructions</span>
        {assignment.description ? (
          <p className={styles.prose}>{assignment.description}</p>
        ) : (
          <p className={styles.missing}>No description was captured for this item.</p>
        )}
      </section>

      {assignment.series_key && series.length > 1 && (
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <span className={tokens.kicker}>Series · {assignment.series_key}</span>
            <span className={styles.footerNote}>{series.length} items</span>
          </div>
          <div className={styles.series}>
            {series.map((sibling) => (
              <div
                key={`${sibling.item_kind}:${sibling.item_id}`}
                className={
                  sibling.item_id === assignmentId
                    ? `${styles.seriesItem} ${styles.seriesItemCurrent}`
                    : styles.seriesItem
                }
              >
                <span className={styles.seriesTitle}>{sibling.title}</span>
                <span className={styles.seriesMeta}>
                  {sibling.due_on ? formatDate(sibling.due_on) : 'no date'} ·{' '}
                  {statusText(sibling.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.block}>
        <span className={tokens.kicker}>Late policy</span>
        {isQueryUnresolved(schemeQ) ? (
          <QueryState query={schemeQ} of="the late policy" className={styles.missing} />
        ) : scheme?.late_policy ? (
          <p className={styles.prose}>{scheme.late_policy}</p>
        ) : (
          <p className={styles.missing}>No late policy is recorded for this course.</p>
        )}
      </section>

      <section className={styles.block}>
        <span className={tokens.kicker}>AI policy</span>
        {isQueryUnresolved(schemeQ) ? (
          <QueryState query={schemeQ} of="the AI policy" className={styles.missing} />
        ) : scheme?.ai_policy ? (
          <p className={styles.prose}>{scheme.ai_policy}</p>
        ) : (
          <p className={styles.missing}>No AI policy is recorded for this course.</p>
        )}
      </section>

      <AssignmentPlannerBlock assignmentId={assignmentId} progressQ={progressQ} />

      {/* Its own <section>; the popout's `.block` spacing lives inside it. */}
      <SubmissionBlock
        assignmentId={assignmentId}
        courseId={assignment.course_id}
        blackboardUrl={course?.bb_url ?? null}
      />

      <div className={styles.footer}>
        <span className={styles.footerLinks}>
          <Link className={tokens.btnGhost} href={`/course/${assignment.course_id}/grades`}>
            Grades →
          </Link>
          {course?.bb_url ? (
            <a
              className={tokens.btnSecondary}
              href={course.bb_url}
              target="_blank"
              rel="noreferrer"
              title="Course-level link — Blackboard has no stable per-item URL here."
            >
              Open in Blackboard ↗ <span className={styles.footerNote}>(course)</span>
            </a>
          ) : (
            <span className={styles.footerNote}>No Blackboard link recorded for this course.</span>
          )}
        </span>
      </div>
    </>
  );
}
