#!/usr/bin/env node
/**
 * End-to-end smoke test against the LIVE project.
 *
 * Spawns dist/index.js over stdio with the MCP SDK client — the same transport
 * Claude Code uses — and exercises all three tools. Reads SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE from the environment, or from an env file given as
 * --env-file (default: the bb2dash repo .env). Never prints a key.
 *
 *   npm run build && node scripts/smoke.mjs [--env-file C:/path/.env]
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '..', 'dist', 'index.js');

function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) out[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
  return out;
}

const args = process.argv.slice(2);
const envFileIndex = args.indexOf('--env-file');
const envFile = envFileIndex >= 0 ? args[envFileIndex + 1] : 'C:/Users/estac/projects/bb2dash/.env';
const fileEnv = process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY)
  ? {}
  : readEnvFile(envFile);
const env = { ...fileEnv, ...process.env };

if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_KEY)) {
  console.error('smoke: SUPABASE_URL and SUPABASE_SERVICE_ROLE are required (env or --env-file).');
  process.exit(2);
}

const textOf = (result) => result.content.map((part) => part.text ?? '').join('\n');
const head = (text, lines = 14) => text.split('\n').slice(0, lines).join('\n');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  env: {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE: env.SUPABASE_SERVICE_ROLE ?? env.SUPABASE_SERVICE_KEY,
    PATH: process.env.PATH ?? '',
  },
  stderr: 'pipe',
});
const client = new Client({ name: 'bb2dash-smoke', version: '0.0.0' });

transport.stderr?.on('data', (chunk) => process.stderr.write(`  [server] ${chunk}`));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  check('three tools advertised', tools.length === 3, tools.map((t) => t.name).join(', '));

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
} catch (error) {
  check('smoke run', false, error instanceof Error ? error.message : String(error));
} finally {
  await client.close().catch(() => {});
}

console.log(failures === 0 ? '\nsmoke: all checks passed' : `\nsmoke: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
