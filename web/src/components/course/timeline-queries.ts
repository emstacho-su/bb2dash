/**
 * The timeline's one read of its own (R3-4): the course's files that belong to
 * a session or to an assignment, with the three routes the Open ladder needs.
 *
 * Everything else the timeline shows comes through existing course queries:
 * sessions, work items, the term, `v_content_tree` (content-linked assignment
 * files) and `v_course_stream`, whose announcement arm is the course-scoped
 * announcement list with the bell's unread flag (110).
 *
 * My-submission files are left out: they are Stack's work, shown in the
 * assignment popout's submission block, not course material. Superseded rows
 * are left out too, as every other file list does.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { shellCacheKey } from '@/lib/course-dimension';
import type { TimelineFile } from './timeline-model';

const TIMELINE_FILE_COLUMNS =
  'id, session_id, assignment_id, file_name, bucket, mime_type, storage_path, source_url, local_path';

export const timelineKeys = {
  files: (shellIds: readonly string[]) => ['course-timeline-files', shellCacheKey(shellIds)] as const,
};

export function courseTimelineFilesOptions(shellIds: string[]) {
  return queryOptions({
    queryKey: timelineKeys.files(shellIds),
    queryFn: async (): Promise<TimelineFile[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('bb_files')
        .select(TIMELINE_FILE_COLUMNS)
        .in('course_id', shellIds)
        .is('superseded_by', null)
        .neq('bucket', 'my_submissions')
        .or('session_id.not.is.null,assignment_id.not.is.null')
        .order('file_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TimelineFile[];
    },
    enabled: shellIds.length > 0,
    staleTime: 15 * 60 * 1000,
  });
}

export function useCourseTimelineFiles(shellIds: string[]) {
  return useQuery(courseTimelineFilesOptions(shellIds));
}
