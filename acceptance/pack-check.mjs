// bb2dash :: acceptance/pack-check.mjs
//
// The rules an acceptance pack is held to (acceptance/README.md), as functions that return the
// problems in plain lines. `packProblems()` runs them all; acceptance.test.mjs calls it for every
// pack under acceptance/<NN>/ and shows each rule failing on a pack that breaks it.
//
// A pack is four files: acceptance/<NN>/manifest.json, playbook.md and proofs.json, and the
// browser tests in web/e2e/accept<NN>.spec.ts. The rules are about how they agree: a step names a
// test that exists, a proof that exists, evidence its test really writes; a stage has its section
// in the playbook; and nothing in the pack quotes an answer, because answers quote course material
// and this repository is public.

import fs from 'node:fs';
import path from 'node:path';

import { coerceParam, parseParamSpec, validatePack } from '../scripts/accept-proofs.mjs';
import { validate } from './schema-lite.mjs';

/** A quoted passage longer than this is refused unless it is one of the five questions. */
export const QUOTE_MAX_CHARS = 60;

const PHASE_DIR = /^[0-9]{1,2}[a-z]?$/;
/** `carry:<step or saved name>.<field>`: a value the host read earlier in the run. */
const CARRY = /^carry:([a-z0-9][a-z0-9_-]*)\.([a-z][a-z0-9_]*)$/;
const SAVE_NAME = /^[a-z][a-z0-9_]*$/;
/** How the browser-test file declares a test: its title, then the shots it takes. */
const DECLARED_TEST = /acceptStep\(\s*'([^']+)',\s*\{\s*shots:\s*\[([^\]]*)\]/g;
const QUESTION = /export const QUESTION_(?:LOOKUP|DECISION|DOCUMENT|STANDARD|DEEP)\s*=\s*(['"])((?:(?!\1).)+)\1;/gs;
const QUOTED = /"([^"\n]+)"|“([^”\n]+)”/g;

/* ---------------------------------------------------------------------------------------------
 * Reading a pack
 * ------------------------------------------------------------------------------------------ */

/** The phases that have a pack: the folders of acceptance/ named like a phase. */
export function listPacks(acceptanceDir) {
  return fs
    .readdirSync(acceptanceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && PHASE_DIR.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export const specPathOf = (phase) => `web/e2e/accept${phase}.spec.ts`;

/** The four files of one pack, read from the working tree. A missing file is an error that names it. */
export function loadPack(repo, phase) {
  const read = (relative) => {
    const file = path.join(repo, relative);
    if (!fs.existsSync(file)) throw new Error(`pack ${phase}: ${relative} is missing`);
    return fs.readFileSync(file, 'utf8');
  };
  return {
    phase,
    manifest: JSON.parse(read(`acceptance/${phase}/manifest.json`)),
    proofs: JSON.parse(read(`acceptance/${phase}/proofs.json`)),
    playbook: read(`acceptance/${phase}/playbook.md`),
    specText: read(specPathOf(phase)),
  };
}

/** Each test the browser-test file declares, in order: its title and the labels of the shots it takes. */
export function specTests(specText) {
  return [...specText.matchAll(DECLARED_TEST)].map(([, title, shots]) => ({
    title,
    shots: [...shots.matchAll(/'([^']+)'/g)].map((match) => match[1]),
  }));
}

export const specTitles = (specText) => specTests(specText).map((declared) => declared.title);

/** The acceptance script's five questions, as the browser tests ask them (`web/e2e/walk21.lib.ts`). */
export function questionsOf(repo) {
  const text = fs.readFileSync(path.join(repo, 'web', 'e2e', 'walk21.lib.ts'), 'utf8');
  return [...text.matchAll(QUESTION)].map((match) => match[2]);
}

/* ---------------------------------------------------------------------------------------------
 * What the rules read from a manifest
 * ------------------------------------------------------------------------------------------ */

const stagesOfKind = (manifest, kind) => manifest.stages.filter((stage) => stage.kind === kind);
const stageIndex = (manifest, id) => manifest.stages.findIndex((stage) => stage.id === id);
const stepsOfKind = (manifest, kind) => manifest.steps.filter((step) => step.kind === kind);

/** A `db.proof` action as the proof it runs: its name, the name it saves under, its values. */
function proofOfAction(action) {
  const { name, save, ...values } = action.with ?? {};
  return { name, save, values };
}

const sameValues = (left, right) => JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());

/** Whether a host stage runs this proof with exactly these values. */
function stageRunsProof(stage, proof) {
  return stage.actions.some((action) => {
    if (action.action !== 'db.proof') return false;
    const run = proofOfAction(action);
    return run.name === proof.name && sameValues(run.values, proof.with ?? {});
  });
}

function duplicates(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

/* ---------------------------------------------------------------------------------------------
 * The rules
 * ------------------------------------------------------------------------------------------ */

function identityProblems({ phase, manifest }) {
  const problems = [];
  if (manifest.phase !== phase) problems.push(`manifest.json: phase is "${manifest.phase}" in acceptance/${phase}/`);
  for (const id of duplicates(manifest.stages.map((stage) => stage.id))) problems.push(`manifest.json: stage id "${id}" is used twice`);
  for (const id of duplicates(manifest.steps.map((step) => step.id))) problems.push(`manifest.json: step id "${id}" is used twice`);
  return problems;
}

function proofsFileProblems({ proofs }) {
  try {
    validatePack(proofs);
    return [];
  } catch (error) {
    return [`proofs.json: ${error.message}`];
  }
}

/** What an automated step's evidence must be: its facts file, and one picture per shot its test takes. */
function evidenceProblems(step, declared, specPath) {
  const problems = [];
  const facts = `${step.id}.json`;
  if (!step.evidence.includes(facts)) problems.push(`step ${step.id}: its evidence does not list ${facts}`);
  const taken = declared.shots.map((label) => `${step.id}-${label}.png`);
  for (const file of step.evidence.filter((name) => name !== facts && !taken.includes(name))) {
    const label = new RegExp(`^${step.id}-(.+)\\.png$`).exec(file)?.[1];
    problems.push(
      label === undefined
        ? `step ${step.id}: evidence "${file}" is neither ${facts} nor ${step.id}-<label>.png`
        : `step ${step.id}: ${specPath} takes no shot labelled "${label}" (${file})`,
    );
  }
  for (const file of taken.filter((name) => !step.evidence.includes(name))) {
    problems.push(`step ${step.id}: its evidence does not list ${file}, which its test takes`);
  }
  return problems;
}

function autoStepProblems({ phase, manifest, specText }) {
  const specPath = specPathOf(phase);
  const declared = new Map(specTests(specText).map((test) => [test.title, test]));
  const problems = [];
  for (const step of stepsOfKind(manifest, 'auto')) {
    const stage = manifest.stages.find((candidate) => candidate.id === step.stage);
    if (stage === undefined) problems.push(`step ${step.id}: stage "${step.stage}" does not exist`);
    else if (stage.kind !== 'sandbox') problems.push(`step ${step.id}: stage "${step.stage}" is a ${stage.kind} stage, not a sandbox stage`);
    else if (!stage.tests.includes(step.test)) problems.push(`step ${step.id}: test "${step.test}" is not in the tests of stage "${step.stage}"`);
    if (!step.test.startsWith(`${step.id} `)) problems.push(`step ${step.id}: the title "${step.test}" does not start with the step id`);
    if (!declared.has(step.test)) problems.push(`step ${step.id}: ${specPath} holds no test titled "${step.test}"`);
    else problems.push(...evidenceProblems(step, declared.get(step.test), specPath));
  }
  return problems;
}

/** Each test of each sandbox stage belongs to exactly one step, and the file holds no test that no stage runs. */
function testCoverageProblems({ phase, manifest, specText }) {
  const problems = [];
  const staged = new Set();
  for (const stage of stagesOfKind(manifest, 'sandbox')) {
    for (const title of stage.tests) {
      staged.add(title);
      const steps = stepsOfKind(manifest, 'auto').filter((step) => step.test === title).length;
      if (steps !== 1) problems.push(`stage ${stage.id}: the test "${title}" is named by ${steps} steps`);
    }
  }
  for (const title of specTitles(specText).filter((declared) => !staged.has(declared))) {
    problems.push(`${specPathOf(phase)}: the test "${title}" is in no sandbox stage`);
  }
  return problems;
}

/** One use of a proof (by a step, or by a host action) against what proofs.json declares for it. */
function proofUseProblems(label, name, values, proofs) {
  if (name === undefined) return [`${label}: a db.proof action names no proof`];
  if (!Object.hasOwn(proofs, name)) return [`${label}: proofs.json holds no proof named "${name}"`];
  const declared = proofs[name].params ?? {};
  const problems = [];
  for (const key of Object.keys(values).filter((given) => !Object.hasOwn(declared, given))) {
    problems.push(`${label}: proof "${name}" has no parameter "${key}"`);
  }
  for (const [key, type] of Object.entries(declared)) {
    let spec;
    try {
      spec = parseParamSpec(type);
    } catch {
      continue; // proofs.json's own problem, reported once by proofsFileProblems
    }
    if (!Object.hasOwn(values, key)) {
      if (!spec.optional) problems.push(`${label}: proof "${name}" is not given "${key}"`);
      continue;
    }
    if (CARRY.test(String(values[key]))) continue;
    try {
      coerceParam(spec, String(values[key]));
    } catch (error) {
      problems.push(`${label}: proof "${name}", parameter "${key}": ${error.message}`);
    }
  }
  return problems;
}

function proofProblems({ manifest, proofs }) {
  const problems = [];
  const hostStages = stagesOfKind(manifest, 'host');
  for (const stage of hostStages) {
    for (const action of stage.actions.filter((entry) => entry.action === 'db.proof')) {
      const run = proofOfAction(action);
      if (run.save !== undefined && !SAVE_NAME.test(String(run.save))) problems.push(`stage ${stage.id}: "${run.save}" is not a name to save under`);
      problems.push(...proofUseProblems(`stage ${stage.id}`, run.name, run.values, proofs));
    }
  }
  for (const step of manifest.steps.filter((candidate) => candidate.proofs !== undefined)) {
    for (const proof of step.proofs) {
      problems.push(...proofUseProblems(`step ${step.id}`, proof.name, proof.with ?? {}, proofs));
      if (step.kind === 'auto') {
        const after = hostStages.filter((stage) => stageIndex(manifest, stage.id) > stageIndex(manifest, step.stage));
        if (!after.some((stage) => stageRunsProof(stage, proof))) {
          problems.push(`step ${step.id}: no host stage after "${step.stage}" runs its proof "${proof.name}" with the same values`);
        }
      } else if (!hostStages.some((stage) => stage.id === step.stage && stageRunsProof(stage, proof))) {
        problems.push(`step ${step.id}: stage "${step.stage}" does not run its proof "${proof.name}" with the same values`);
      }
    }
  }
  return problems;
}

function hostStepProblems({ manifest }) {
  const problems = [];
  for (const step of stepsOfKind(manifest, 'host')) {
    const stage = manifest.stages.find((candidate) => candidate.id === step.stage);
    if (stage === undefined) problems.push(`step ${step.id}: stage "${step.stage}" does not exist`);
    else if (stage.kind !== 'host') problems.push(`step ${step.id}: stage "${step.stage}" is a ${stage.kind} stage, not a host stage`);
    else {
      const run = stage.actions.map((action) => action.action);
      for (const action of (step.actions ?? []).filter((name) => !run.includes(name))) {
        problems.push(`step ${step.id}: stage "${step.stage}" does not run the action "${action}"`);
      }
    }
    if (step.actions === undefined && step.proofs === undefined) problems.push(`step ${step.id}: a host step names at least one action or proof`);
  }
  return problems;
}

/** A carried value comes from a step whose stage has already run, or from a proof saved earlier. */
function carryProblems({ manifest }) {
  const problems = [];
  const saved = new Set();
  const stageOfStep = new Map(stepsOfKind(manifest, 'auto').map((step) => [step.id, stageIndex(manifest, step.stage)]));
  manifest.stages.forEach((stage, index) => {
    for (const action of stage.actions ?? []) {
      for (const value of Object.values(action.with ?? {})) {
        const reference = CARRY.exec(String(value));
        if (reference === null) continue;
        const [, source] = reference;
        if (saved.has(source)) continue;
        if (!stageOfStep.has(source)) problems.push(`stage ${stage.id}: "${value}" names no earlier step and no saved proof`);
        else if (stageOfStep.get(source) >= index || stageOfStep.get(source) === -1) problems.push(`stage ${stage.id}: "${value}" is read before step ${source} has run`);
      }
      if (action.action === 'db.proof' && action.with?.save !== undefined) saved.add(String(action.with.save));
    }
  });
  return problems;
}

function deadlineProblems({ manifest }) {
  const problems = [];
  manifest.stages.forEach((stage, index) => {
    if (stage.deadline === undefined) return;
    const before = manifest.stages[index - 1];
    const runs = before?.kind === 'host' && before.actions.some((action) => action.action === stage.deadline.after);
    if (!runs) {
      problems.push(`stage ${stage.id}: its deadline counts from "${stage.deadline.after}", which the stage before it ("${before?.id ?? 'none'}") does not run`);
    }
  });
  return problems;
}

/** The playbook's sections, by the stage each `## Stage: <id>` heading names. */
function playbookSections(playbook) {
  const sections = new Map();
  let current = null;
  for (const line of playbook.split(/\r?\n/)) {
    const heading = /^## Stage: (.+?)\s*$/.exec(line);
    if (heading !== null) {
      current = heading[1];
      sections.set(current, '');
    } else if (/^#{1,2} /.test(line)) {
      current = null;
    } else if (current !== null) {
      sections.set(current, `${sections.get(current)}${line}\n`);
    }
  }
  return sections;
}

function playbookProblems({ manifest, playbook }) {
  const problems = [];
  const sections = playbookSections(playbook);
  const sandbox = stagesOfKind(manifest, 'sandbox');
  for (const stage of sandbox) {
    if (!sections.has(stage.id)) {
      problems.push(`playbook.md: no "## Stage: ${stage.id}" section`);
      continue;
    }
    for (const title of stage.tests.filter((test) => !sections.get(stage.id).includes(`\`${test}\``))) {
      problems.push(`playbook.md: the section of stage "${stage.id}" does not name the test \`${title}\``);
    }
  }
  for (const id of [...sections.keys()].filter((heading) => !sandbox.some((stage) => stage.id === heading))) {
    problems.push(`playbook.md: "## Stage: ${id}" names no sandbox stage`);
  }
  return problems;
}

/** Every string of a JSON value, at any depth. */
function stringsOf(value) {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(stringsOf);
}

function quoteProblems(file, text, questions) {
  return [...text.matchAll(QUOTED)]
    .map((match) => match[1] ?? match[2])
    .filter((passage) => passage.length > QUOTE_MAX_CHARS && !questions.includes(passage))
    .map((passage) => `${file}: quotes a passage of ${passage.length} characters that is not one of the five questions`);
}

/** Kept simple on purpose: a pack does not quote an answer. No block quote, and no long quoted passage. */
function courseTextProblems({ manifest, playbook }, questions) {
  const problems = [];
  if (/^\s*>/m.test(playbook)) problems.push('playbook.md: holds a block quote (a line that starts with ">")');
  problems.push(...quoteProblems('playbook.md', playbook, questions));
  for (const text of stringsOf(manifest)) problems.push(...quoteProblems('manifest.json', text, questions));
  return problems;
}

function waivedProblems({ manifest }, repo) {
  return stepsOfKind(manifest, 'waived')
    .filter((step) => step.stands_on !== undefined && !fs.existsSync(path.join(repo, step.stands_on)))
    .map((step) => `step ${step.id}: stands on ${step.stands_on}, which is not in the repository`);
}

/**
 * Every problem of one pack, as plain lines; none when the pack is whole. A manifest that breaks
 * its schema is reported alone: the other rules read a manifest of the right shape.
 */
export function packProblems(pack, { repo, manifestSchema }) {
  const shape = validate(manifestSchema, pack.manifest).map((line) => `manifest.json: ${line}`);
  if (shape.length > 0) return shape;
  return [
    ...identityProblems(pack),
    ...proofsFileProblems(pack),
    ...autoStepProblems(pack),
    ...testCoverageProblems(pack),
    ...hostStepProblems(pack),
    ...proofProblems(pack),
    ...carryProblems(pack),
    ...deadlineProblems(pack),
    ...playbookProblems(pack),
    ...courseTextProblems(pack, questionsOf(repo)),
    ...waivedProblems(pack, repo),
  ];
}
