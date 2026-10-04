#!/usr/bin/env node
/**
 * End-to-end smoke test over stdio, the transport Claude Code uses.
 *
 * Host mode (the default) spawns dist/index.js with this Node. `--docker` spawns
 * the image exactly as the README's registration recipe does: `docker run -i --rm`
 * with the key file bind-mounted read-only at /run/secrets/bb2dash_mcp_service_key
 * and SUPABASE_SERVICE_ROLE_FILE naming it, so the key never reaches a command
 * line or the container's environment. Never prints a key.
 *
 *   npm run build && node scripts/smoke.mjs --env-file <bb2dash .env>
 *   node scripts/smoke.mjs --docker --key-file <host path of bb2dash_mcp_service_key>
 *   node scripts/smoke.mjs --docker --key-file <any non-empty file> --tools-only
 *
 * Host mode reads SUPABASE_SERVICE_ROLE_FILE or SUPABASE_SERVICE_ROLE from the
 * environment, or from the env file given as --env-file. Docker mode takes
 * --key-file, else $SECRETS_DIR/bb2dash_mcp_service_key, and --image (default
 * bb2dash-mcp:local). SUPABASE_URL defaults to the bb2dash project in both.
 * --tools-only stops after startup and the tool listing, which needs no network
 * and no real key; the full run searches the live corpus.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '..', 'dist', 'index.js');

const DEFAULT_SUPABASE_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
const DEFAULT_IMAGE = 'bb2dash-mcp:local';
const SECRET_NAME = 'bb2dash_mcp_service_key';
const CONTAINER_KEY_PATH = `/run/secrets/${SECRET_NAME}`;
const EXPECTED_TOOLS = ['get_material_text', 'list_courses', 'search_materials'];

function fail(message) {
  console.error(`smoke: ${message}`);
  process.exit(2);
}

function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) out[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
  return out;
}

const args = process.argv.slice(2);
function option(name) {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (!value || value.startsWith('--')) fail(`${name} needs a value.`);
  return value;
}
const docker = args.includes('--docker');
const toolsOnly = args.includes('--tools-only');

/** Host mode: dist/index.js under this Node, the key by file path or by value. */
function hostServer() {
  const envFile = option('--env-file');
  const env = { ...(envFile ? readEnvFile(envFile) : {}), ...process.env };
  const keyFile = env.SUPABASE_SERVICE_ROLE_FILE;
  const key = env.SUPABASE_SERVICE_ROLE ?? env.SUPABASE_SERVICE_KEY;
  if (!keyFile && !key) {
    fail('set SUPABASE_SERVICE_ROLE_FILE or SUPABASE_SERVICE_ROLE, or pass --env-file <bb2dash .env>.');
  }
  return {
    label: `host ${entry}`,
    params: {
      command: process.execPath,
      args: [entry],
      env: {
        SUPABASE_URL: env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
        ...(keyFile ? { SUPABASE_SERVICE_ROLE_FILE: keyFile } : { SUPABASE_SERVICE_ROLE: key }),
      },
      stderr: 'pipe',
    },
  };
}

/** Docker mode: the registration recipe's `docker run`, the key file mounted read-only. */
function dockerServer() {
  const image = option('--image') ?? DEFAULT_IMAGE;
  const keyFile = option('--key-file') ?? (process.env.SECRETS_DIR ? join(process.env.SECRETS_DIR, SECRET_NAME) : undefined);
  if (!keyFile) fail('--docker needs --key-file <path>, or SECRETS_DIR set.');
  if (!existsSync(keyFile)) fail(`the key file ${keyFile} does not exist.`);
  const url = process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
  return {
    label: `docker ${image}`,
    params: {
      command: 'docker',
      args: [
        'run', '-i', '--rm',
        '--mount', `type=bind,source=${resolve(keyFile)},target=${CONTAINER_KEY_PATH},readonly`,
        '-e', `SUPABASE_URL=${url}`,
        '-e', `SUPABASE_SERVICE_ROLE_FILE=${CONTAINER_KEY_PATH}`,
        image,
      ],
      stderr: 'pipe',
    },
  };
}

const server = docker ? dockerServer() : hostServer();
console.log(`smoke: ${server.label}${toolsOnly ? ' (tools only)' : ''}`);

const textOf = (result) => result.content.map((part) => part.text ?? '').join('\n');
const head = (text, lines = 14) => text.split('\n').slice(0, lines).join('\n');

const transport = new StdioClientTransport(server.params);
const client = new Client({ name: 'bb2dash-smoke', version: '0.0.0' });

transport.stderr?.on('data', (chunk) => process.stderr.write(`  [server] ${chunk}`));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function liveChecks() {
  const courses = await client.callTool({ name: 'list_courses', arguments: {} });
  const coursesText = textOf(courses);
  check('list_courses', !courses.isError && /IST\.323/.test(coursesText));
  console.log(head(coursesText, 12));

  const started = Date.now();
  const cia = await client.callTool({
    name: 'search_materials',
    arguments: { q: 'CIA triad confidentiality integrity availability', limit: 3 },
  });
  const ciaText = textOf(cia);
  const firstTextId = /text_id: (\d+)/.exec(ciaText)?.[1];
  check('search_materials: CIA triad hits IST.323', !cia.isError && /IST\.323/.test(ciaText), `${Date.now() - started} ms`);
  console.log(head(ciaText, 16));

  const bread = await client.callTool({
    name: 'search_materials',
    arguments: { q: 'banana bread recipe with walnuts', limit: 3 },
  });
  const breadText = textOf(bread);
  const breadEmpty = /Nothing relevant/.test(breadText);
  const breadLabelled = /below the 0\.78 floor/.test(breadText);
  check('search_materials: off-topic is empty (v3) or labelled below-floor (v2)', !bread.isError && (breadEmpty || breadLabelled));
  console.log(head(breadText, 6));

  const wrongCourse = await client.callTool({ name: 'search_materials', arguments: { q: 'syllabus', course: 'IST323' } });
  check('search_materials: bad course id lists real ids', !wrongCourse.isError && /Courses that exist/.test(textOf(wrongCourse)));

  if (firstTextId) {
    const unit = await client.callTool({ name: 'get_material_text', arguments: { text_id: Number(firstTextId) } });
    const unitText = textOf(unit);
    check(`get_material_text ${firstTextId}`, !unit.isError && /text_id: /.test(unitText));
    console.log(head(unitText, 10));
  } else {
    check('get_material_text', false, 'no text_id from the search to follow up');
  }

  const missing = await client.callTool({ name: 'get_material_text', arguments: { text_id: 999999999 } });
  check('get_material_text: missing id is not an error', !missing.isError && /not an error/.test(textOf(missing)));
}

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check('three tools advertised', names.join(',') === EXPECTED_TOOLS.join(','), names.join(', '));
  if (!toolsOnly) await liveChecks();
} catch (error) {
  check('smoke run', false, error instanceof Error ? error.message : String(error));
} finally {
  await client.close().catch(() => {});
}

console.log(failures === 0 ? '\nsmoke: all checks passed' : `\nsmoke: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
