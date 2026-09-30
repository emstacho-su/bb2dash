#!/usr/bin/env node
// bb2dash :: scripts/validate-grading.mjs
// Launches the V-1 grading-validation session (brief 96 §Contract "V-1 tooling"; method in
// docs/planning/sprint-1-hub/briefs/63_GRADING_VALIDATION.md): a Claude Code session that sees ONLY
// the bb2dash materials MCP server and the file tools, confined by --restricted to its working
// directory <repo>/docs/planning (round 2, item 1), writing only the 96b verdict files.
//
//   node scripts/validate-grading.mjs [COURSE] [--export <path>] [--dry-run]
//
// The bb2dash server entry (command, args, env incl. the service key) is copied from
// ~/.claude.json into a temp file for --mcp-config (mode 0o600, deleted in `finally`), so no secret
// lives in the repo. Nothing here prints the entry's env or args.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The repo root, from this file's own location, never the caller's cwd (105 §3 residual). */
export const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export const BRIEF_PATH = 'sprint-1-hub/briefs/63_GRADING_VALIDATION.md';
export const TEMPLATE_PATH = 'sprint-2/evidence/96c_V1_VERDICT_TEMPLATE.md';
export const EXPORT_DIR = 'sprint-2/evidence';
export const EXPORT_PREFIX = '96a_GRADING_SCHEMA_EXPORT_';
export const VERDICT_DIR = 'sprint-2/verification';
export const VERDICT_PREFIX = '96b_GRADING_VALIDATION_';
/** The session's working directory, relative to the repo root; every path below is relative to it. */
export const SESSION_DIR = 'docs/planning';
const TEMP_PREFIX = 'bb2dash-validate-mcp-';
const TMP_PLACEHOLDER = '<tmp>';
const SERVER_NAME = 'bb2dash';
const CLAUDE_COMMAND = 'claude';
const COURSE_ID = /^[A-Z]{2,4}\.\d{3}(\.[a-z]+)?$/;

/** The built-in tools available at all (one argv element). */
export const TOOL_LIST = 'Read,Edit,Write,Glob,Grep';

export const ALLOWED_TOOLS = Object.freeze([
  'mcp__bb2dash__list_courses',
  'mcp__bb2dash__search_materials',
  'mcp__bb2dash__get_material_text',
  // A Read rule also governs Glob and Grep.
  'Read(./**)',
  // An Edit rule also governs Write; a Write(...) rule would be accepted and never consulted.
  `Edit(${VERDICT_DIR}/${VERDICT_PREFIX}*)`,
]);

export const DISALLOWED_TOOLS = Object.freeze([
  'Bash', 'PowerShell', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Agent',
  'mcp__plugin_supabase_supabase__*', 'mcp__Supabase__*', 'mcp__rag__*',
  'Read(./.env*)', 'Read(./**/.env*)', 'Read(./course context/**)',
]);

const SYSTEM_PROMPT =
  'You are confined to the bb2dash materials corpus and the validation documents. ' +
  'If a tool you need is unavailable, say so and stop; do not work around it.';

/** A failure the launcher names for Stack; main() prints its message and exits 1. */
export class LauncherError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LauncherError';
  }
}

// --- arguments ----------------------------------------------------------------------------------

export function parseArgs(argv) {
  const result = { course: '', exportPath: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--export') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new LauncherError('--export needs a path');
      result.exportPath = value;
      i += 1;
    } else if (arg.startsWith('--')) {
      throw new LauncherError(`unknown option ${arg}; usage: validate-grading [COURSE] [--export <path>] [--dry-run]`);
    } else {
      if (result.course) throw new LauncherError('give at most one course');
      if (!COURSE_ID.test(arg)) throw new LauncherError(`${JSON.stringify(arg)} is not a course id (e.g. IST.323, GEO.103.lecture)`);
      result.course = arg;
    }
  }
  return result;
}

// --- the server entry ---------------------------------------------------------------------------

/** Reads the config with JSON.parse (case-duplicate keys parse) and returns mcpServers.bb2dash. */
export function loadServerEntry({ configPath, fsImpl = fs }) {
  let text;
  try {
    text = fsImpl.readFileSync(configPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new LauncherError(`${configPath} not found; register the bb2dash MCP server first (mcp-server/README.md).`);
    }
    throw new LauncherError(`${configPath} could not be read (${e.code ?? 'error'}).`);
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    // Never echo the parser message: it can quote the file, which holds the service key.
    throw new LauncherError(`${configPath} could not be parsed as JSON.`);
  }
  const entry = config?.mcpServers?.[SERVER_NAME];
  if (!entry || typeof entry !== 'object') {
    throw new LauncherError(`No '${SERVER_NAME}' entry under mcpServers in ${configPath}.`);
  }
  if (typeof entry.command !== 'string' || entry.command.length === 0) {
    throw new LauncherError(`The '${SERVER_NAME}' entry in ${configPath} has no command.`);
  }
  return entry;
}

/** True when the command's basename, lower-cased with any .exe dropped, is `node`. */
export function isNodeCommand(command) {
  const base = String(command).split(/[\\/]/).pop().toLowerCase();
  return base.replace(/\.exe$/, '') === 'node';
}

/** Checks a Node entry's build exists; any other command (docker) is accepted as is. */
export function checkServerBuild(entry, fsImpl = fs) {
  if (!isNodeCommand(entry.command)) {
    const base = String(entry.command).split(/[\\/]/).pop();
    return `command accepted: ${base}`;
  }
  const script = Array.isArray(entry.args) ? entry.args[0] : undefined;
  if (typeof script !== 'string' || !fsImpl.existsSync(script)) {
    throw new LauncherError(`bb2dash server build missing: ${script ?? '(no args[0])'}. Run 'npm run build' in mcp-server/.`);
  }
  return 'build found';
}

// --- prompt -------------------------------------------------------------------------------------

/** GEO.103's lecture and recitation share one verdict file. */
export function verdictPathFor(course) {
  const base = course.startsWith('GEO.103') ? 'GEO.103' : course;
  return `${VERDICT_DIR}/${VERDICT_PREFIX}${base}.md`;
}

export function buildPrompt({ course, exportPath }) {
  const scope = course
    ? `Validate course ${course} only. Write its verdict file to ${verdictPathFor(course)}.`
    : `Validate every course in the brief's order, one at a time, stopping for Stack between courses. ` +
      `Write each course's verdict file to ${VERDICT_DIR}/${VERDICT_PREFIX}<course_id>.md ` +
      `(GEO.103 lecture and recitation share ${verdictPathFor('GEO.103')}).`;
  return [
    'You are the V-1 grading-validation session for bb2dash.',
    `Read ${BRIEF_PATH} in full (the method), then ${TEMPLATE_PATH} (the verdict file's shape; it supersedes brief 63's table and questions row), then the export ${exportPath} (the claim under test).`,
    scope,
    'Use ONLY the bb2dash MCP tools (list_courses, search_materials, get_material_text) as evidence. Never fill a gap from general knowledge; write "not in materials".',
    'Walk every open row and the questions block with Stack before writing his call and his why. Grading only.',
  ].join('\n');
}

/** The session's working directory: <repo>/docs/planning (round 2, item 1). */
export function sessionRootOf(repoRoot) {
  return path.join(repoRoot, ...SESSION_DIR.split('/'));
}

/** Newest 96a export by name (names carry the ISO date), relative to docs/planning; null if none. */
export function findNewestExport(repoRoot, fsImpl = fs) {
  const dir = path.join(sessionRootOf(repoRoot), EXPORT_DIR);
  let names;
  try {
    names = fsImpl.readdirSync(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const exports = names.filter((n) => n.startsWith(EXPORT_PREFIX) && n.endsWith('.md')).sort();
  return exports.length ? `${EXPORT_DIR}/${exports.at(-1)}` : null;
}

/**
 * An --export path (absolute, or relative to the repo root), made relative to docs/planning; it
 * must exist under docs/planning/, the session's working directory and all it can read.
 */
export function resolveExportArg(exportArg, repoRoot, fsImpl = fs) {
  const absolute = path.resolve(repoRoot, exportArg);
  const relative = path.relative(sessionRootOf(repoRoot), absolute).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || relative === '..' || path.isAbsolute(relative)) {
    throw new LauncherError(`--export must be a file under ${SESSION_DIR}/ (the session can read nothing else): ${exportArg}`);
  }
  if (!fsImpl.existsSync(absolute)) throw new LauncherError(`--export file not found: ${exportArg}`);
  return relative;
}

// --- argv ---------------------------------------------------------------------------------------

export function buildClaudeArgv({ mcpConfigPath, prompt }) {
  return [
    '--strict-mcp-config', '--mcp-config', mcpConfigPath,
    '--restricted', '--tools', TOOL_LIST,
    '--allowedTools', ALLOWED_TOOLS.join(','),
    '--disallowedTools', DISALLOWED_TOOLS.join(','),
    '--append-system-prompt', SYSTEM_PROMPT,
    prompt,
  ];
}

function formatArgv(argv) {
  return [CLAUDE_COMMAND, ...argv].map((a) => (/^[\w./:<>=-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');
}

// --- temp file ----------------------------------------------------------------------------------

function writeTempConfig(entry, tmpDir, fsImpl = fs) {
  const file = path.join(tmpDir, `${TEMP_PREFIX}${crypto.randomBytes(16).toString('hex')}.json`);
  const body = JSON.stringify({ mcpServers: { [SERVER_NAME]: entry } });
  // 'wx': never follow or reuse an existing file. NTFS ignores the mode; the file is in the user's own %TEMP%.
  fsImpl.writeFileSync(file, body, { mode: 0o600, flag: 'wx' });
  return file;
}

function removeQuietly(file, fsImpl = fs) {
  try {
    fsImpl.rmSync(file, { force: true });
  } catch (e) {
    process.stderr.write(`validate-grading: could not delete the temp config ${file}: ${e.code ?? e.message}\n`);
  }
}

/** Default spawn: inherits the terminal, resolves with claude's exit code. */
function spawnClaude(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = nodeSpawn(command, args, { ...options, stdio: 'inherit', shell: false });
    child.once('error', (e) => reject(new LauncherError(`could not start ${command}: ${e.message}`)));
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1)));
  });
}

// --- run ----------------------------------------------------------------------------------------

/**
 * @param {string[]} argv  arguments after the script name
 * @param {object} deps    injectable: configPath, homeDir, tmpDir, repoRoot, spawn, fsImpl,
 *                         stdout, stderr, signals ({on, off}) — tests never touch the real ones
 * @returns {Promise<number>} the exit code
 */
export async function run(argv, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  const homeDir = deps.homeDir ?? os.homedir();
  const configPath = deps.configPath ?? path.join(homeDir, '.claude.json');
  const tmpDir = deps.tmpDir ?? os.tmpdir();
  const repoRoot = deps.repoRoot ?? REPO_ROOT;
  const sessionRoot = sessionRootOf(repoRoot);
  const spawn = deps.spawn ?? spawnClaude;
  const stdout = deps.stdout ?? process.stdout;
  const signals = deps.signals ?? process;

  const args = parseArgs(argv);
  const entry = loadServerEntry({ configPath, fsImpl });
  const serverState = checkServerBuild(entry, fsImpl);
  const exportPath = args.exportPath
    ? resolveExportArg(args.exportPath, repoRoot, fsImpl)
    : findNewestExport(repoRoot, fsImpl);

  if (args.dryRun) {
    const prompt = buildPrompt({ course: args.course, exportPath: exportPath ?? `${EXPORT_DIR}/${EXPORT_PREFIX}<date>.md (none found yet)` });
    stdout.write(`${formatArgv(buildClaudeArgv({ mcpConfigPath: TMP_PLACEHOLDER, prompt }))}\n`);
    stdout.write(`cwd: ${sessionRoot}\n`);
    stdout.write(`export: ${exportPath ?? 'none found (a launch would refuse; generate it or pass --export)'}\n`);
    stdout.write(`server: ${SERVER_NAME} (${serverState})\n`);
    return 0;
  }
  if (!exportPath) {
    throw new LauncherError(`no ${SESSION_DIR}/${EXPORT_DIR}/${EXPORT_PREFIX}*.md found; generate the export (brief 96 task 15) or pass --export <path>.`);
  }

  const prompt = buildPrompt({ course: args.course, exportPath });
  const tmp = writeTempConfig(entry, tmpDir, fsImpl);
  // Ctrl-C reaches claude through the shared console; holding SIGINT here keeps node alive until
  // claude exits, so `finally` runs. The exit hook is a last resort if node is torn down anyway.
  const onInterrupt = () => {};
  const onExit = () => removeQuietly(tmp, fsImpl);
  signals.on('SIGINT', onInterrupt);
  signals.on('exit', onExit);
  try {
    return await spawn(CLAUDE_COMMAND, buildClaudeArgv({ mcpConfigPath: tmp, prompt }), { cwd: sessionRoot });
  } finally {
    removeQuietly(tmp, fsImpl);
    signals.off('SIGINT', onInterrupt);
    signals.off('exit', onExit);
  }
}

async function main() {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (e) {
    const message = e instanceof LauncherError ? e.message : `unexpected error: ${e?.message ?? e}`;
    process.stderr.write(`validate-grading: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
