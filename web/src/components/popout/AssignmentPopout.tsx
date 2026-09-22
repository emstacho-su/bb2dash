'use client';

/**
 * Assignment popout (R-05) — artboard 04-assignment, ported to the top-nav
 * shell and opened by `?item=assignment:<id>` on any screen.
 *
 * Phase 12b (T-2) moved everything this file used to render into
 * `AssignmentDetailBody`, so the popout and the full-details page under the
 * course are the same markup rather than two copies of it. What is left here is
 * the name the rest of the app opens: `ItemPopout` mounts this inside
 * `PopoutShell`, and nothing about that changed.
 */

import { AssignmentDetailBody } from './AssignmentDetailBody';

export function AssignmentPopout({ assignmentId }: { assignmentId: string }) {
  return <AssignmentDetailBody assignmentId={assignmentId} />;
}
