/**
 * Named values of the ingest worker and the parser's loop (Phase 24a, brief 109, "Uploads and
 * extraction" and the freeze amendment F-3). The parser's side imports this file, so it names no
 * secret and no network address beyond the project's host, which the worker checks links against.
 */

/** The project's host: a signed link is followed only on this host, over https. */
export const PROJECT_HOST = 'goultdzqcavefcgnifdy.supabase.co';
export const SUPABASE_URL = `https://${PROJECT_HOST}`;
/** The edge function the embed call goes to (workspace-embed, `verify_jwt` on). */
export const EMBED_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/workspace-embed`;
/** A signed link's path up to the object key. The key is `u/<sha256>`, made inside the register call. */
export const SIGNED_PATH_PREFIX = '/storage/v1/object/sign/workspace-uploads/';
export const STORAGE_KEY_PREFIX = 'u/';

/** The bucket's own limit: 20 MiB a file. */
export const MAX_UPLOAD_BYTES = 20_971_520;
/** More units than this, or more characters in all, is `too_many_units`. */
export const MAX_UNITS = 1_000;
export const MAX_TOTAL_CHARS = 1_500_000;

/** The exchange volume, mounted by the worker and the parser's service and no other. */
export const EXCHANGE_DIR = '/exchange';
/** The locked Python project the parser runs `extract_text.py` from (the image copies `ingest/` here). */
export const INGEST_DIR = '/app/ingest';
/** The limit passed to `extractUnits` in its `run` argument, as `sync/src/files.ts` does. */
export const EXTRACT_LIMIT_MS = 300_000;
/** The worker's wait for an answer: the parser's limit and 30 s for the hand-over. None is `extract_timeout`. */
export const EXTRACT_WAIT_MS = 330_000;
/** The most of an answer the worker reads, as data. A larger one is `extract_failed`. */
export const ANSWER_MAX_BYTES = 64 * 1024 * 1024;
/** How often each side looks at the exchange folder. */
export const EXCHANGE_POLL_MS = 500;
/** The parser touches its alive file this often; the service's healthcheck reads its age. */
export const ALIVE_TOUCH_MS = 10_000;
/** An alive file older than this is unhealthy (three missed touches). */
export const ALIVE_MAX_AGE_MS = 35_000;

/** The worker asks for the next document this often when nothing was handed out. */
export const WORKER_POLL_MS = 5_000;
/** The worker's heartbeat reaches the database and touches its own alive file. */
export const HEARTBEAT_MS = 30_000;
export const WORKER_ALIVE_MAX_AGE_MS = 90_000;

/** The embed loop's parameters, as `embed.json` shows them. */
export const EMBED_LIMIT = 40;
export const EMBED_MAX_PARTS = 3;

/** The role the worker logs in as: four functions, no table grant. */
export const INGEST_ROLE = 'workspace_ingest_runner';

/** The ten error codes of a failed upload (brief 109, "Error codes of a failed upload"). */
export const ERROR_CODES = [
  'too_large',
  'bad_type',
  'bad_bytes',
  'no_text',
  'extract_timeout',
  'extract_failed',
  'too_many_units',
  'link_expired',
  'download_failed',
  'embed_failed',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const PARSED_MIME_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
});
export const TEXT_MIMES: ReadonlySet<string> = new Set(['text/plain', 'text/markdown']);
/** What the parser will open: the four extensions `extract_text.py` reads. */
export const PARSED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx'] as const;

/** The unit a text file becomes. */
export const TEXT_UNIT_KIND = 'doc';
export const TEXT_UNIT_NO = 1;
