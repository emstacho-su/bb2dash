// bb2dash :: scripts/accept-proofs-kit.mjs
// What the two test files of the proofs script share: Phase 21's pack as the working tree has it,
// a command line for one proof, and what the migrations say a table's columns are. No test here.

import fs from 'node:fs';
import path from 'node:path';

export const REPO = path.resolve(import.meta.dirname, '..');
export const PACK_21 = JSON.parse(fs.readFileSync(path.join(REPO, 'acceptance', '21', 'proofs.json'), 'utf8'));
export const SHA = '4ed9eee0c1a2b3c4d5e6f708192a3b4c5d6e7f80';

/** The command line of one proof: `21 <name> --sha <commit> --param key=value …`. */
export const argvFor = (name, params = {}) => [
  '21',
  name,
  '--sha',
  SHA,
  ...Object.entries(params).flatMap(([key, value]) => ['--param', `${key}=${value}`]),
];

const MIGRATIONS = path.join(REPO, 'db', 'migrations');
const NOT_A_COLUMN = new Set(['constraint', 'check', 'unique', 'primary', 'foreign', 'references', 'exclude', 'like']);

/** The columns the migrations give a table: its `create table` block, and every later `add column`. */
export function columnsOf(table) {
  const columns = new Set();
  for (const file of fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const created = new RegExp(`^create table (?:if not exists )?(?:public\\.)?${table} \\(\\r?\\n([\\s\\S]*?)^\\);`, 'm').exec(sql);
    for (const line of created ? created[1].split(/\r?\n/) : []) {
      const word = /^\s+([a-z_][a-z0-9_]*)\s/.exec(line)?.[1];
      if (word && !NOT_A_COLUMN.has(word)) columns.add(word);
    }
    const added = new RegExp(`alter table (?:public\\.)?${table}\\s+add column (?:if not exists )?([a-z_][a-z0-9_]*)`, 'g');
    for (const match of sql.matchAll(added)) columns.add(match[1]);
  }
  return columns;
}
