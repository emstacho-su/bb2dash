#!/usr/bin/env node
/**
 * install-skills.mjs — one source for bb2dash's four repo skills (brief 100 task 19, P-49).
 *
 *   node scripts/install-skills.mjs [--target <dir>] [--check]
 *
 * `skills/<name>/` in this checkout is the source of truth for bb-course-map, bb-course-pull,
 * bb-sync and inbox-apply. Claude Code loads user skills from `~/.claude/skills`, and a stale
 * copy there (or a claude.ai-synced one) silently runs old instructions, so this copies each
 * skill's files into the target (default `<home>/.claude/skills`) and verifies every copy by
 * SHA-256: drift is a failed hash, not a guess. The pattern is agentic-harness's
 * `hooks/install-checkpoint.mjs`.
 *
 * `--check` writes nothing and exits 1 when an installed file is missing or differs. A file in
 * the target that the repo does not have is reported and left alone: this never deletes. It never
 * commits either; it only writes into the target folder.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE_ROOT = path.resolve(HERE, '..', 'skills');
export const SKILLS = Object.freeze(['bb-course-map', 'bb-course-pull', 'bb-sync', 'inbox-apply']);

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;
const USAGE = 'usage: node scripts/install-skills.mjs [--target <dir>] [--check]';

/** Claude Code's user skills folder. */
export function defaultTarget(home = os.homedir()) {
  return path.join(home, '.claude', 'skills');
}

export function parseArgs(argv) {
  const options = { target: '', check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') {
      i += 1;
      if (i >= argv.length) return { ok: false, error: '--target needs a value' };
      options.target = argv[i];
    } else if (arg === '--check') {
      options.check = true;
    } else {
      return { ok: false, error: `unknown option ${arg}` };
    }
  }
  return { ok: true, options };
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Files under `dir`, as forward-slash paths relative to it, sorted. */
function filesUnder(dir, prefix = '') {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...filesUnder(path.join(dir, entry.name), relative));
    else if (entry.isFile()) found.push(relative);
  }
  return found.sort();
}

/** Every source file of every skill; throws before anything is written if a skill is absent. */
function sourceFiles(sourceRoot, skills) {
  return skills.flatMap((skill) => {
    const dir = path.join(sourceRoot, skill);
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) throw new Error(`skill source missing: ${path.join(dir, 'SKILL.md')}`);
    return filesUnder(dir).map((file) => `${skill}/${file}`);
  });
}

/**
 * Plan, and unless `check`, apply. Returns each file's action (`create`, `update`, `unchanged`),
 * the target's extra files, and `drift`: how many files are missing or differ before any write.
 */
export function installSkills({ sourceRoot = SOURCE_ROOT, target, check = false, skills = SKILLS }) {
  const planned = sourceFiles(sourceRoot, skills).map((relative) => {
    const source = path.join(sourceRoot, ...relative.split('/'));
    const destination = path.join(target, ...relative.split('/'));
    const sourceHash = sha256(source);
    const installed = fs.existsSync(destination) ? sha256(destination) : '';
    const action = installed === sourceHash ? 'unchanged' : installed ? 'update' : 'create';
    return { path: relative, source, destination, sourceHash, action };
  });

  const known = new Set(planned.map((file) => file.path));
  const extras = skills.flatMap((skill) => {
    const dir = path.join(target, skill);
    if (!fs.existsSync(dir)) return [];
    return filesUnder(dir).map((file) => `${skill}/${file}`).filter((file) => !known.has(file));
  });

  if (!check) {
    for (const file of planned) {
      if (file.action === 'unchanged') continue;
      fs.mkdirSync(path.dirname(file.destination), { recursive: true });
      fs.copyFileSync(file.source, file.destination);
      if (sha256(file.destination) !== file.sourceHash) throw new Error(`verification failed for ${file.destination}`);
    }
  }

  return {
    target,
    check,
    files: planned.map(({ path: relative, action }) => ({ path: relative, action })),
    extras,
    drift: planned.filter((file) => file.action !== 'unchanged').length,
  };
}

const CHECK_LABEL = Object.freeze({ create: 'missing', update: 'differs', unchanged: 'same' });

export function run(argv, { out = console.log, err = console.error, home, sourceRoot, skills } = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    err(`error: ${parsed.error}\n${USAGE}`);
    return EXIT_USAGE;
  }
  const target = parsed.options.target || defaultTarget(home);
  try {
    const result = installSkills({
      target,
      check: parsed.options.check,
      ...(sourceRoot ? { sourceRoot } : {}),
      ...(skills ? { skills } : {}),
    });
    for (const file of result.files) {
      const label = result.check ? CHECK_LABEL[file.action] : file.action;
      out(`  ${label.padEnd(9)} ${file.path}`);
    }
    for (const extra of result.extras) out(`  extra     ${extra} (not in the repo; left alone)`);
    if (result.check) {
      out(result.drift === 0 ? `install-skills --check: ${target} in sync` : `install-skills --check: ${result.drift} file(s) drift in ${target}`);
      return result.drift === 0 ? EXIT_OK : EXIT_FAILED;
    }
    out(`install-skills: ${result.drift} file(s) written to ${target}, each verified by SHA-256`);
    return EXIT_OK;
  } catch (error) {
    err(`error: ${error.message}`);
    return EXIT_FAILED;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(run(process.argv.slice(2)));
