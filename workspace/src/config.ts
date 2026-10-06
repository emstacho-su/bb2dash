/**
 * The runner's constants (brief 102, Contract, "The runner" and "Heartbeat, health and shutdown").
 * Every number the loop, the provider and the healthcheck share is named here.
 */

/** The one CLI version the image pins and the fixtures are recorded on; the init-line check compares against it. */
export const CLAUDE_CODE_VERSION = '2.1.289';

/** The CLI, found on PATH and spawned as an argv array, never through a shell. */
export const CLAUDE_BIN = 'claude';

/** In-image paths: the seam with the image (pinned by test/mcp-config.test.ts). */
export const PATHS = Object.freeze({
  /** The runner's own directory: created by the entrypoint, 0700, owned by `node`. */
  runDir: '/run/workspace',
  /** The MCP config the runner writes at start, mode 0600. */
  mcpConfig: '/run/workspace/mcp.json',
  /** Touched after every successful heartbeat; the healthcheck reads its age. */
  aliveFile: '/run/workspace/alive',
  settings: '/app/workspace/claude/settings.json',
  systemPrompt: '/app/workspace/prompts/system.md',
  /** The CLI's working directory: empty, so no project settings or memory files load. */
  turnCwd: '/app/turn',
  runnerDbUrlSecret: '/run/secrets/workspace_runner_db_url',
  oauthTokenSecret: '/run/secrets/claude_oauth_token',
});

/** How often the runner asks for the next queued request. */
export const POLL_INTERVAL_MS = 2000;
/** One turn at a time: the plan's limits are shared with the owner's own sessions. */
export const TURN_CONCURRENCY = 1;
/** Answer text is sent to the page in flushes this far apart. */
export const STREAM_FLUSH_MS = 250;
/** With no text flushed for this long, the runner asks whether the request is still claimed. */
export const CANCEL_POLL_MS = 2000;
/** A turn is killed here, under the database's 10-minute stale-claim sweep. */
export const TURN_TIMEOUT_MS = 8 * 60 * 1000;
/** The heartbeat's own timer, during turns too. */
export const HEARTBEAT_MS = 30_000;
/** With no heartbeat success for this long the runner exits non-zero, so the container restarts. */
export const DB_WATCHDOG_MS = 180_000;
/** The healthcheck passes while the alive file is younger than this. */
export const HEALTH_MAX_AGE_MS = 90_000;

/** At most this many stored messages are replayed on a fresh start. */
export const HISTORY_REPLAY = 20;
/** The replay with its framing stays within this many bytes of UTF-8 (96 KiB). */
export const REPLAY_MAX_BYTES = 96 * 1024;
/** The kernel's limit on one argument; the prompt element stays under it. */
export const ARG_MAX_BYTES = 131_072;

/** `workspace_stream()` refuses a delta longer than this; the runner splits first. */
export const STREAM_DELTA_MAX_CHARS = 16_000;
/** `workspace_finish()` stores at most this much content; the runner cuts first and logs. */
export const CONTENT_MAX_CHARS = 100_000;
/** Only the first calls of a turn are stored, in call order. */
export const TOOL_CALLS_MAX = 20;
/** A stored tool call's `query` is cut here. */
export const TOOL_QUERY_MAX_CHARS = 200;

/** The per-answer cost cap (`WORKSPACE_TURN_BUDGET_USD`): its default and the range it is refused outside. */
export const TURN_BUDGET_DEFAULT_USD = 1.0;
export const TURN_BUDGET_MIN_USD = 0.01;
export const TURN_BUDGET_MAX_USD = 1.0;
