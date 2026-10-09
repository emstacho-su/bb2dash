/**
 * Wire shapes of the workspace store's two reads, frozen in
 * `workspace/test/fixtures/contract24/` (`search-row.json`, `attachment-read.json`,
 * `batch-request.json`). Every row is validated before it is handed on: a shape change
 * upstream surfaces as an error, not as silently empty fields.
 */

import { z } from 'zod';

export const KINDS = ['material', 'upload', 'memory'] as const;
export type Kind = (typeof KINDS)[number];

export const ATTACHMENT_KINDS = ['file', 'upload'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** One row of `workspace_search`, as `workspace-search` hands it on. */
export const workspaceHitSchema = z.object({
  kind: z.enum(KINDS),
  unit_id: z.number(),
  file_id: z.number().nullable(),
  document_id: z.number().nullable(),
  course_id: z.string().nullable(),
  title: z.string(),
  unit_kind: z.string(),
  unit_no: z.number(),
  part_no: z.number().nullable(),
  similarity: z.number().nullable(),
  score: z.number().nullable(),
  passage: z.string(),
  has_notes: z.boolean(),
});
export type WorkspaceHit = z.infer<typeof workspaceHitSchema>;

export const workspaceSearchBodySchema = z.object({ results: z.array(z.unknown()) });

export const attachmentUnitSchema = z.object({
  unit_id: z.number(),
  unit_kind: z.string(),
  unit_no: z.number(),
  text: z.string(),
});

/** What `workspace_attachment_read` returns: every key present in every state. */
export const attachmentReadSchema = z.object({
  kind: z.enum(ATTACHMENT_KINDS),
  id: z.number(),
  state: z.string(),
  title: z.string().nullable(),
  course_id: z.string().nullable(),
  units_total: z.number(),
  units_read: z.number(),
  chars_total: z.number(),
  chars_read: z.number(),
  units: z.array(attachmentUnitSchema),
  left_out_unit_ids: z.array(z.number()),
});
export type AttachmentRead = z.infer<typeof attachmentReadSchema>;

// ---------------------------------------------------------------- batch request

const MAX_QUERY_CHARS = 2_000;
const MAX_QUERIES = 12;
const MAX_ATTACHMENTS = 5;
const MAX_BATCH_LIMIT = 50;
const MAX_ATTACHMENT_CHARS = 1_000_000;
const MAX_COURSES = 20;
const MAX_COURSE_CHARS = 64;

const batchQuerySchema = z.object({
  q: z.string().trim().min(1).transform((q) => q.slice(0, MAX_QUERY_CHARS)),
  kinds: z.array(z.enum(KINDS)).min(1),
  courses: z.array(z.string().min(1).max(MAX_COURSE_CHARS)).max(MAX_COURSES).nullable(),
});

const batchAttachmentSchema = z.object({
  kind: z.enum(ATTACHMENT_KINDS),
  id: z.number().int().positive(),
  max_chars: z.number().int().positive().max(MAX_ATTACHMENT_CHARS),
});

export const batchRequestSchema = z.object({
  version: z.literal(1),
  queries: z.array(batchQuerySchema).max(MAX_QUERIES),
  limit: z.number().int().min(1).max(MAX_BATCH_LIMIT).default(10),
  /** Absent: the configured floor. Null: no floor. */
  min_similarity: z.number().min(0).max(1).nullable().optional(),
  attachments: z.array(batchAttachmentSchema).max(MAX_ATTACHMENTS).default([]),
});
export type BatchRequest = z.infer<typeof batchRequestSchema>;

// ---------------------------------------------------------------- batch answer

export const QUERY_STATES = ['ok', 'refused', 'failed'] as const;
export type QueryState = (typeof QUERY_STATES)[number];

export interface QueryAnswer {
  ok: boolean;
  state: QueryState;
  hits: WorkspaceHit[];
}

export interface BatchAnswer {
  version: 1;
  queries: QueryAnswer[];
  attachments: AttachmentRead[];
}
