// bb2dash :: acceptance/acceptance.test.mjs
//
//   node --test acceptance/acceptance.test.mjs
//
// Holds every acceptance pack under acceptance/<NN>/ to the rules in acceptance/README.md, with no
// dependency and no network: the manifest against its schema, every automated step against the
// browser-test file it names, every proof against proofs.json, every sandbox stage against the
// playbook, the rule that a pack quotes no course text, and the rule that a playbook writes the
// page's texts as the app has them. The rules themselves are in pack-check.mjs; each one is shown
// to fail on a pack that breaks it, because a check that cannot fail guards nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate } from './schema-lite.mjs';
import { QUOTE_MAX_CHARS, listPacks, loadPack, packProblems, questionsByName, questionsOf, specTitles } from './pack-check.mjs';
import { statePathFrom } from '../web/e2e/login-state.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(REPO, relative), 'utf8'));
const readText = (relative) => fs.readFileSync(path.join(REPO, relative), 'utf8');

const MANIFEST_SCHEMA = readJson('acceptance/manifest.schema.json');
const REPORT_SCHEMA = readJson('acceptance/report.schema.json');
const PACKS = listPacks(HERE);

/** A deep copy a test may break. */
const copyOf = (value) => JSON.parse(JSON.stringify(value));

/** Pack 21 with one thing changed, and the problems the rules then report. */
function problemsAfter(change) {
  const pack = loadPack(REPO, '21');
  const broken = { ...pack, manifest: copyOf(pack.manifest), proofs: copyOf(pack.proofs) };
  const changed = change(broken) ?? broken;
  return packProblems(changed, { repo: REPO, manifestSchema: MANIFEST_SCHEMA });
}

const stageOf = (manifest, id) => manifest.stages.find((stage) => stage.id === id);
const stepOf = (manifest, id) => manifest.steps.find((step) => step.id === id);
/** md5 as Postgres computes it: of the text's UTF-8 bytes, in lower-case hex. */
const md5 = (text) => createHash('md5').update(text, 'utf8').digest('hex');

/** What the host offers every run under its own name: the time the run started, on the host's clock. */
const RUN_START = 'carry:run.started_at';

/* ---------------------------------------------------------------------------------------------
 * The validator
 * ------------------------------------------------------------------------------------------ */

test('the validator reports a wrong type, a missing key, an extra key and a pattern that does not hold', () => {
  const schema = {
    type: 'object',
    required: ['id', 'count'],
    additionalProperties: false,
    properties: { id: { type: 'string', pattern: '^[a-z]+$' }, count: { type: 'integer', minimum: 0, maximum: 1 } },
  };
  assert.deepEqual(validate(schema, { id: 'walk', count: 1 }), []);
  assert.deepEqual(validate(schema, { id: 'Walk', count: 2, more: true }), [
    '$.id: "Walk" does not match ^[a-z]+$',
    '$.count: 2 is above the maximum 1',
    '$.more: not an allowed key',
  ]);
  assert.deepEqual(validate(schema, { id: 7 }), ['$.count: missing', '$.id: expected string, got integer']);
  assert.deepEqual(validate(schema, []), ['$: expected object, got array']);
});

test('the validator follows $ref, const, enum, items and oneOf', () => {
  const schema = {
    type: 'array',
    minItems: 1,
    items: { $ref: '#/$defs/stage' },
    $defs: {
      stage: {
        oneOf: [
          { type: 'object', required: ['kind'], additionalProperties: false, properties: { kind: { const: 'prepare' } } },
          {
            type: 'object',
            required: ['kind', 'tests'],
            additionalProperties: false,
            properties: { kind: { const: 'sandbox' }, tests: { type: 'array', minItems: 1, items: { enum: ['a', 'b'] } } },
          },
        ],
      },
    },
  };
  assert.deepEqual(validate(schema, [{ kind: 'prepare' }, { kind: 'sandbox', tests: ['a'] }]), []);
  assert.deepEqual(validate(schema, []), ['$: fewer than 1 item(s)']);
  const problems = validate(schema, [{ kind: 'sandbox', tests: ['c'] }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^\$\[0\]: matches none of the 2 allowed shapes/);
  assert.match(problems[0], /\$\[0\]\.tests\[0\]: "c" is not one of a, b/);
});

test('the validator refuses a schema keyword it does not check', () => {
  assert.throws(() => validate({ type: 'string', format: 'uri' }, 'x'), /does not check the keyword "format"/);
  assert.throws(() => validate({ $ref: '#/$defs/missing' }, 'x'), /no such definition/);
});

test('the validator refuses $ref beside another keyword: what stood beside it was skipped without a word', () => {
  const $defs = { short: { type: 'string', maxLength: 3 } };
  const idIs = (schema) => ({ type: 'object', properties: { id: schema }, $defs });
  // This property promised a short text AND lower-case letters; only the first was ever checked.
  assert.throws(() => validate(idIs({ $ref: '#/$defs/short', pattern: '^[a-z]+$' }), { id: 'A1' }), /"\$ref" stands alone, and here it is beside "pattern" \(at \$\.id\)/);
  assert.throws(() => validate(idIs({ type: 'integer', $ref: '#/$defs/short' }), { id: 'abc' }), /"\$ref" stands alone, and here it is beside "type" \(at \$\.id\)/);
  // A description beside it is refused too: the rule is one sentence, with no list of exceptions to keep.
  assert.throws(() => validate(idIs({ $ref: '#/$defs/short', description: 'a short id' }), { id: 'abc' }), /"\$ref" stands alone, and here it is beside "description"/);
  // It is thrown when the schema is used, as an unknown keyword is: a value that never reaches the place does not trip it.
  assert.deepEqual(validate(idIs({ $ref: '#/$defs/short', pattern: '^[a-z]+$' }), {}), []);
  // Alone, it is followed.
  assert.deepEqual(validate(idIs({ $ref: '#/$defs/short' }), { id: 'abcd' }), ['$.id: longer than 3 character(s)']);
});

test("the validator reads a value's own keys and a schema's own keywords, not what every object inherits", () => {
  const schema = { type: 'object', required: ['constructor', 'toString', 'id'], properties: { id: { type: 'string' } } };
  // Every object answers to "constructor" and "toString": a value that holds neither key is missing both.
  assert.deepEqual(validate(schema, { id: 'walk' }), ['$.constructor: missing', '$.toString: missing']);
  assert.deepEqual(validate(schema, { id: 'walk', constructor: 1, toString: 2 }), []);
  // A schema for a key of that name is not applied to what the value merely inherits.
  assert.deepEqual(validate({ type: 'object', properties: { constructor: { type: 'string' } } }, {}), []);
  assert.deepEqual(validate({ type: 'object', properties: { constructor: { type: 'string' } } }, { constructor: 7 }), ['$.constructor: expected string, got integer']);
  // And a keyword of that name is still a keyword this file does not check.
  assert.throws(() => validate({ type: 'string', constructor: 1 }, 'x'), /does not check the keyword "constructor"/);
  assert.throws(() => validate({ type: 'string', hasOwnProperty: true }, 'x'), /does not check the keyword "hasOwnProperty"/);
  assert.throws(() => validate({ $ref: '#/$defs/toString', $defs: {} }, 'x'), /stands alone|no such definition/);
});

/* ---------------------------------------------------------------------------------------------
 * The two schemas
 * ------------------------------------------------------------------------------------------ */

/** The manifest of the interface spec, completed just enough to be whole. */
const SPEC_MANIFEST = {
  schema: 1,
  phase: '21',
  base_url: 'https://web-xi-ten-uy9xk6c6p0.vercel.app',
  stages: [
    { id: 'prepare', kind: 'prepare' },
    {
      id: 'go-live',
      kind: 'host',
      actions: [
        { action: 'runner.record' },
        { action: 'db.proof', with: { name: 'planner-fingerprint', save: 'planner_before' } },
        { action: 'workspace.stopTestRunner', with: { container: 'bb2dash-wt21-workspace-1' } },
      ],
    },
    { id: 'walk', kind: 'sandbox', tests: ['3 lookup haiku'] },
  ],
  steps: [
    { id: '1', kind: 'human', text: 'Usage credits off; /usage numbers' },
    {
      id: '3',
      kind: 'auto',
      stage: 'walk',
      test: '3 lookup haiku',
      evidence: ['3-start.png', '3-end.png', '3.json'],
      proofs: [{ name: 'turn', with: { request: 'carry:3.request_id', tier: 'low', tool: 'search_materials' } }],
    },
    { id: '12', kind: 'waived', text: 'overtaken by the merge of 2026-10-07' },
  ],
};

test("the manifest schema takes the interface spec's example and refuses what the spec does not allow", () => {
  assert.deepEqual(validate(MANIFEST_SCHEMA, SPEC_MANIFEST), []);
  const broken = (change) => {
    const manifest = copyOf(SPEC_MANIFEST);
    change(manifest);
    return validate(MANIFEST_SCHEMA, manifest).join('\n');
  };
  assert.match(broken((m) => { m.stages[2].kind = 'docker'; }), /\$\.stages\[2\]: matches none/);
  assert.match(broken((m) => { delete m.steps[1].test; }), /\$\.steps\[1\]: matches none/);
  assert.match(broken((m) => { m.stages[1].actions[0].action = 'docker.prune'; }), /\$\.stages\[1\]: matches none/);
  assert.match(broken((m) => { m.stages[1].actions[2].run = 'docker compose down'; }), /\$\.stages\[1\]: matches none/);
  assert.match(broken((m) => { m.base_url = 'http://localhost:3000'; }), /\$\.base_url/);
  assert.match(broken((m) => { m.schema = 2; }), /\$\.schema/);
  assert.match(broken((m) => { m.steps[1].evidence = ['../../.env']; }), /\$\.steps\[1\]: matches none/);
});

/** The report of the interface spec. */
const SPEC_REPORT = {
  schema: 1,
  phase: '21',
  stage: 'walk',
  claude_version: '2.1.289 (Claude Code)',
  steps: [
    { id: '3', verdict: 'pass', saw: 'The badge read Haiku and the answer named the syllabus file.', evidence: ['3-start.png', '3-end.png', '3.json'], reruns: 0 },
  ],
  notes: '',
};

test("the report schema takes the interface spec's example and refuses a report the verdict could not rest on", () => {
  assert.deepEqual(validate(REPORT_SCHEMA, SPEC_REPORT), []);
  const broken = (change) => {
    const report = copyOf(SPEC_REPORT);
    change(report);
    return validate(REPORT_SCHEMA, report).join('\n');
  };
  assert.match(broken((r) => { r.steps[0].verdict = 'passed'; }), /\$\.steps\[0\]\.verdict/);
  assert.match(broken((r) => { delete r.steps[0].saw; }), /\$\.steps\[0\]\.saw: missing/);
  assert.match(broken((r) => { r.steps[0].reruns = 2; }), /\$\.steps\[0\]\.reruns/);
  assert.match(broken((r) => { r.steps[0].evidence = ['/accept/state.json']; }), /\$\.steps\[0\]\.evidence\[0\]/);
  assert.match(broken((r) => { r.steps = []; }), /\$\.steps/);
  assert.match(broken((r) => { r.green = true; }), /\$\.green: not an allowed key/);
  assert.match(broken((r) => { delete r.notes; }), /\$\.notes: missing/);
  for (const verdict of ['pass', 'fail', 'unsure', 'blocked']) {
    assert.equal(broken((r) => { r.steps[0].verdict = verdict; }), '', verdict);
  }
});

/* ---------------------------------------------------------------------------------------------
 * Every pack
 * ------------------------------------------------------------------------------------------ */

test('there is at least one pack, and Phase 21 has one', () => {
  assert.ok(PACKS.length >= 1, 'acceptance/ holds a pack');
  assert.ok(PACKS.includes('21'), 'acceptance/21/ is a pack');
});

for (const phase of PACKS) {
  test(`pack ${phase}: the manifest, the browser tests, the proofs and the playbook agree`, () => {
    const pack = loadPack(REPO, phase);
    assert.deepEqual(packProblems(pack, { repo: REPO, manifestSchema: MANIFEST_SCHEMA }), []);
  });
}

/* ---------------------------------------------------------------------------------------------
 * Each rule can fail
 * ------------------------------------------------------------------------------------------ */

test('a manifest that breaks its schema is reported, and nothing else is read from it', () => {
  const problems = problemsAfter((pack) => { pack.manifest.stages[0].kind = 'docker'; });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^manifest\.json: \$\.stages\[0\]/);
});

test('a manifest filed under another phase, a stage id used twice and a step id used twice are reported', () => {
  assert.deepEqual(problemsAfter((pack) => { pack.manifest.phase = '22'; }), ['manifest.json: phase is "22" in acceptance/21/']);
  assert.ok(problemsAfter((pack) => { stageOf(pack.manifest, 'stop').id = 'start'; }).includes('manifest.json: stage id "start" is used twice'));
  assert.ok(problemsAfter((pack) => { stepOf(pack.manifest, '12').id = '1'; }).includes('manifest.json: step id "1" is used twice'));
});

test('an automated step must name a sandbox stage, a test of that stage and a title the browser-test file holds', () => {
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '3').stage = 'nowhere'; }).includes('step 3: stage "nowhere" does not exist'),
  );
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '3').stage = 'go-live'; }).includes('step 3: stage "go-live" is a host stage, not a sandbox stage'),
  );
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '14b').stage = 'walk'; }).includes('step 14b: test "14b back" is not in the tests of stage "walk"'),
  );
  const renamed = problemsAfter((pack) => {
    stepOf(pack.manifest, '3').test = '3 lookup sonnet';
    stageOf(pack.manifest, 'walk').tests[1] = '3 lookup sonnet';
  });
  assert.ok(renamed.includes('step 3: web/e2e/accept21.spec.ts holds no test titled "3 lookup sonnet"'));
  assert.ok(renamed.includes('web/e2e/accept21.spec.ts: the test "3 lookup haiku" is in no sandbox stage'));
});

test("a test title starts with its step's id, a stage test belongs to one step, and a step's facts file is evidence", () => {
  const moved = problemsAfter((pack) => { stepOf(pack.manifest, '4').test = '5 document haiku'; });
  assert.ok(moved.includes('step 4: the title "5 document haiku" does not start with the step id'));
  assert.ok(moved.includes('stage walk: the test "5 document haiku" is named by 2 steps'));
  assert.ok(moved.includes('stage walk: the test "4 decision haiku" is named by 0 steps'));
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '3').evidence = ['3-start.png']; }).includes('step 3: its evidence does not list 3.json'),
  );
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '3').evidence.push('3-middle.png'); }).includes(
      'step 3: web/e2e/accept21.spec.ts takes no shot labelled "middle" (3-middle.png)',
    ),
  );
});

test('a test title is listed once: twice in one stage, or in two stages, is a problem', () => {
  // Listed twice, a test is run twice: a second live question, and its files replace the first run's.
  const twiceInOne = problemsAfter((pack) => { stageOf(pack.manifest, 'walk').tests.push('3 lookup haiku'); });
  assert.deepEqual(twiceInOne, ['manifest.json: the test "3 lookup haiku" is listed 2 times (stage walk, stage walk), and a test is run once']);
  const inTwo = problemsAfter((pack) => { stageOf(pack.manifest, 'back').tests.push('3 lookup haiku'); });
  assert.ok(inTwo.includes('manifest.json: the test "3 lookup haiku" is listed 2 times (stage walk, stage back), and a test is run once'));
  const thrice = problemsAfter((pack) => {
    stageOf(pack.manifest, 'walk').tests.push('8 stopped');
    stageOf(pack.manifest, 'offline').tests.push('8 stopped');
  });
  assert.ok(thrice.includes('manifest.json: the test "8 stopped" is listed 3 times (stage walk, stage walk, stage offline), and a test is run once'));
});

test("a proof must exist in proofs.json with the same parameter names and a value of the stated type, and a host step's proof is run by its own stage", () => {
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '3').proofs[0].name = 'turn-fast'; }).some((line) =>
      line.startsWith('step 3: proofs.json holds no proof named "turn-fast"'),
    ),
  );
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '3').proofs[0].with.model = 'haiku'; }).some((line) =>
      line.startsWith('step 3: proof "turn" has no parameter "model"'),
    ),
  );
  assert.ok(
    problemsAfter((pack) => { delete stepOf(pack.manifest, '3').proofs[0].with.tier; }).some((line) =>
      line.startsWith('step 3: proof "turn" is not given "tier"'),
    ),
  );
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '3').proofs[0].with.tier = 'tiny'; }).some((line) =>
      line.startsWith('step 3: proof "turn", parameter "tier":'),
    ),
  );
  // A host step's proof is read by its own stage and nowhere else: without the action the host would never read it.
  const dropped = problemsAfter((pack) => { stageOf(pack.manifest, 'walk-proofs').actions.pop(); });
  assert.ok(dropped.includes('step 11: stage "walk-proofs" does not run its proof "planner-unchanged" with the same values'));
  const otherValues = problemsAfter((pack) => { stepOf(pack.manifest, '11').proofs[0].with.before = 'carry:planner_before.newest_request_id'; });
  assert.ok(otherValues.includes('step 11: stage "walk-proofs" does not run its proof "planner-unchanged" with the same values'));
  // A host action names a proof that proofs.json does not hold.
  assert.ok(
    problemsAfter((pack) => { stageOf(pack.manifest, 'go-live').actions[1].with.name = 'planner-gone'; }).some((line) =>
      line.startsWith('stage go-live: proofs.json holds no proof named "planner-gone"'),
    ),
  );
});

test("an automated step's proofs are the host's to read after the step's stage: no host stage has to list them", () => {
  // Each proof is read once (the PM's ruling of 2026-10-07): a step that lists a proof no host stage runs is whole.
  const moved = problemsAfter((pack) => {
    const asked = stepOf(pack.manifest, '3').proofs[0].with.question_md5;
    stepOf(pack.manifest, '14b').proofs.push({ name: 'turn', with: { request: 'carry:14a.request_id', tier: 'low', since: RUN_START, question_md5: asked } });
  });
  assert.deepEqual(moved, []);
});

test('proofs.json itself is held: a parameter type off the list and a statement that could write are reported', () => {
  assert.ok(
    problemsAfter((pack) => { pack.proofs.turn.params.request = 'number'; }).some((line) => line.startsWith('proofs.json: turn:')),
  );
  assert.ok(
    problemsAfter((pack) => { pack.proofs['spike-archived'].sql = "update public.workspace_conversations set archived = true where title = 'spike'"; }).some(
      (line) => line.startsWith('proofs.json: spike-archived:'),
    ),
  );
});

test('a host step names a host stage and an action that stage runs', () => {
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '10').stage = 'walk'; }).includes('step 10: stage "walk" is a sandbox stage, not a host stage'),
  );
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '13').actions.push('workspace.stop'); }).includes(
      'step 13: stage "go-live" does not run the action "workspace.stop"',
    ),
  );
});

test('a carried value must come from a step that has already run or from a proof saved earlier', () => {
  const credentialSource = (manifest) => stageOf(manifest, 'walk-proofs').actions.find((entry) => entry.action === 'workspace.credentialSource');
  const early = problemsAfter((pack) => { credentialSource(pack.manifest).with.request = 'carry:14a.request_id'; });
  assert.ok(early.includes('stage walk-proofs: "carry:14a.request_id" is read before step 14a has run'));
  // A step's own proofs are read straight after its stage: a step of that stage may be carried, a later stage's may not.
  assert.equal(stepOf(loadPack(REPO, '21').manifest, '9').proofs[0].with.request, 'carry:9.request_id');
  const ahead = problemsAfter((pack) => { stepOf(pack.manifest, '3').proofs[0].with.request = 'carry:14a.request_id'; });
  assert.deepEqual(ahead, ['step 3: "carry:14a.request_id" is read before step 14a has run']);
  const noSuchStep = problemsAfter((pack) => { stepOf(pack.manifest, '15').proofs[1].with.ids = 'carry:16.conversation_id'; });
  assert.deepEqual(noSuchStep, ['step 15: "carry:16.conversation_id" names no earlier step and no saved proof']);
  const unsaved = problemsAfter((pack) => {
    stageOf(pack.manifest, 'walk-proofs').actions.at(-1).with.before = 'carry:planner_start.fingerprint';
    stepOf(pack.manifest, '11').proofs[0].with.before = 'carry:planner_start.fingerprint';
  });
  assert.ok(unsaved.includes('stage walk-proofs: "carry:planner_start.fingerprint" names no earlier step and no saved proof'));
});

test("the run's own start is always there to carry, it is the only thing under that name, and no proof is saved under it", () => {
  // Every proof that ties a step to this run takes it, and with it in place the pack is whole.
  const { manifest } = loadPack(REPO, '21');
  const sinces = manifest.steps.flatMap((step) => step.proofs ?? []).map((proof) => proof.with?.since);
  // Steps 3 to 9, 14a, 14b and 15: ten proofs read rows this run made.
  assert.deepEqual(sinces.filter((since) => since !== undefined), Array(10).fill(RUN_START));
  assert.deepEqual(
    problemsAfter((pack) => { stepOf(pack.manifest, '3').proofs[0].with.since = 'carry:run.finished_at'; }),
    ['step 3: "carry:run.finished_at": under "run" the host offers started_at and nothing else'],
  );
  const savedOver = problemsAfter((pack) => { stageOf(pack.manifest, 'go-live').actions[1].with.save = 'run'; });
  assert.ok(savedOver.includes('stage go-live: "run" is the host\'s own name, and no proof is saved under it'));
});

test("a time a proof is given is the host's, never one a sandbox wrote down", () => {
  // The form of before the review round: the time step 14a's own test noted. A test in the sandbox could note any time.
  const fromSandbox = problemsAfter((pack) => { stepOf(pack.manifest, '14b').proofs[0].with.since = 'carry:14a.still_queued_at'; });
  assert.deepEqual(fromSandbox, [
    'step 14b: proof "turn-answered-after", parameter "since": a time is never carried from a step (carry:14a.still_queued_at), because a sandbox wrote it',
  ]);
  const fromWalk = problemsAfter((pack) => { stepOf(pack.manifest, '9').proofs[0].with.since = 'carry:3.asked_at'; });
  assert.deepEqual(fromWalk, [
    'step 9: proof "turn", parameter "since": a time is never carried from a step (carry:3.asked_at), because a sandbox wrote it',
  ]);
});

test("a stage's deadline counts from an action of the host stage just before it", () => {
  assert.ok(
    problemsAfter((pack) => { stageOf(pack.manifest, 'offline').deadline.after = 'workspace.start'; }).includes(
      'stage offline: its deadline counts from "workspace.start", which the stage before it ("stop") does not run',
    ),
  );
});

test("the five questions are the brief's, word for word", () => {
  const brief = readText('docs/planning/sprint-2/briefs/102_PHASE21_workspace.md').replace(/\s+/g, ' ');
  const questions = questionsOf(REPO);
  assert.equal(questions.length, 5);
  for (const question of questions) assert.ok(brief.includes(`Ask "${question}"`), question);
});

test('every sandbox stage has its section in the playbook, naming each of its tests', () => {
  assert.ok(
    problemsAfter((pack) => ({ ...pack, playbook: pack.playbook.replace('## Stage: offline', '## Stage: off-line') })).includes(
      'playbook.md: no "## Stage: offline" section',
    ),
  );
  assert.ok(
    problemsAfter((pack) => ({ ...pack, playbook: pack.playbook.replace('## Stage: offline', '## Stage: off-line') })).includes(
      'playbook.md: "## Stage: off-line" names no sandbox stage',
    ),
  );
  assert.ok(
    problemsAfter((pack) => ({ ...pack, playbook: pack.playbook.replaceAll('`8 stopped`', '`8 halted`') })).includes(
      'playbook.md: the section of stage "walk" does not name the test `8 stopped`',
    ),
  );
});

test('a pack quotes no answer: no block quote, and no long quoted passage but the five questions', () => {
  const answer = 'Late work loses ten percent a day and is not taken after the third day, as the policy page of the syllabus has it.';
  assert.ok(answer.length > QUOTE_MAX_CHARS);
  const quoted = problemsAfter((pack) => ({ ...pack, playbook: `${pack.playbook}\nThe answer was "${answer}"\n` }));
  assert.equal(quoted.length, 1);
  assert.match(quoted[0], /^playbook\.md: quotes a passage of \d+ characters that is not one of the five questions/);
  const blockQuote = problemsAfter((pack) => ({ ...pack, playbook: `${pack.playbook}\n> ${answer}\n` }));
  assert.deepEqual(blockQuote, ['playbook.md: holds a block quote (a line that starts with ">")']);
  const inManifest = problemsAfter((pack) => { stepOf(pack.manifest, '3').text = `It answered “${answer}”`; });
  assert.ok(inManifest.some((line) => line.startsWith('manifest.json: quotes a passage of')));
  // The five questions are the brief's own words, and may be quoted.
  const question = questionsOf(REPO)[0];
  assert.deepEqual(problemsAfter((pack) => ({ ...pack, playbook: `${pack.playbook}\nIt asks "${question}"\n` })), []);
});

test('a quoted answer is caught when it wraps over two lines, and in single quotes or code marks too', () => {
  const withLines = (...lines) => problemsAfter((pack) => ({ ...pack, playbook: `${pack.playbook}\n${lines.join('\n')}\n` }));
  const first = "Late work loses ten percent a day and isn't taken";
  const second = 'after the third day, as the policy page of the syllabus has it.';
  const passage = `${first} ${second}`;
  const reported = [`playbook.md: quotes a passage of ${passage.length} characters that is not one of the five questions and not a text of the app's own`];
  // The review's case: a playbook wraps at 100 columns, so no one line held both quote marks and the passage went unread.
  assert.deepEqual(withLines(`The answer was "${first}`, `${second}"`), reported);
  assert.deepEqual(withLines(`The answer was “${first}`, `${second}”`), reported);
  // In single quotes, with an apostrophe inside a word; and in code marks.
  assert.deepEqual(withLines(`The answer was '${first}`, `${second}'`), reported);
  assert.deepEqual(withLines(`The answer was \`${first}`, `${second}\``), reported);
  // In the manifest too.
  const inManifest = problemsAfter((pack) => { stepOf(pack.manifest, '3').text = `It answered '${passage}'`; });
  assert.ok(inManifest.some((line) => line.startsWith('manifest.json: quotes a passage of')));

  // What stays allowed. A short text in any of the marks, however it wraps:
  assert.deepEqual(withLines("A row titled 'spike' and a line that reads `Waiting for the", 'Workspace service` are fine.'), []);
  // a question, in any of the marks, wrapped or not:
  const question = questionsOf(REPO).find((asked) => asked.split(' ').length > 12);
  assert.ok(question, 'one of the five questions is longer than twelve words');
  const [head, tail] = [question.slice(0, question.indexOf(' ', 40)), question.slice(question.indexOf(' ', 40) + 1)];
  assert.deepEqual(withLines(`It asks '${head}`, `${tail}' and then \`${question}\`.`), []);
  // a long text that is the app's own, as a whole quoted string of its labels:
  const ownLong = "The Workspace's Claude sign-in has expired. Run claude setup-token again and store the new token.";
  assert.ok(readText('web/src/lib/workspace-labels.ts').includes(`"${ownLong}"`));
  assert.deepEqual(withLines(`The line may hold \`${ownLong}\`.`), []);
  // and prose with apostrophes in it, which holds no quotation at all:
  assert.deepEqual(withLines("The answer's text, the step's question and the owner's own decisions are each the page's, and none of the steps' pictures is anyone's quotation of them."), []);
});

test("a text the playbook gives as the page's own is one of the app's strings, and the word reads is kept for such a text", () => {
  const withLine = (line) => problemsAfter((pack) => ({ ...pack, playbook: `${pack.playbook}\n${line}\n` }));
  // The sentence the first proof run (2026-10-07) was failed on, word for word: a label in no code marks.
  assert.deepEqual(withLine('- `8-stopped.png` shows a partly written answer, and the button reads Ask again, not Stop.'), [
    'playbook.md: "reads" is followed by "Ask again, not Stop." and not by a text in code marks',
  ]);
  // The same words in code marks. They stand in workspace-labels.ts inside two longer sentences, and are no string of their own.
  assert.ok(readText('web/src/lib/workspace-labels.ts').includes('Ask again'));
  assert.deepEqual(withLine('The button reads `Ask again`, not `Stop`.'), [
    'playbook.md: "reads `Ask again`": "Ask again" is not a whole quoted string of web/src/lib/workspace-labels.ts or of web/e2e/accept21.spec.ts',
  ]);
  assert.deepEqual(withLine('The page says `The Workspace is offline.` under the question box.'), [
    'playbook.md: "says `The Workspace is offline.`": "The Workspace is offline." is not a whole quoted string of web/src/lib/workspace-labels.ts or of web/e2e/accept21.spec.ts',
  ]);
  // The app's own strings pass after each of the three words, on the next line too, and wrapped inside the code marks.
  assert.deepEqual(withLine('The button reads `Ask`, and no button reads\n`Stop`.'), []);
  assert.deepEqual(withLine('The page says `The Workspace service is offline.` and shows `Waiting for the\nWorkspace service` under the question.'), []);
  // A string only the browser-test file holds passes as well: the top bar's link is not in workspace-labels.ts.
  assert.ok(!readText('web/src/lib/workspace-labels.ts').includes("'Workspace'"));
  assert.deepEqual(withLine('The link reads `Workspace`.'), []);
  // Nothing else is read: a text in code marks after any other word, and plain words after says or shows.
  assert.deepEqual(withLine('A row titled `no such title` is fine, the list says so, and `9.json` shows the rest.'), []);
});

test("a waived step's standing evidence must be a file of this repository", () => {
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '2-desktop').stands_on = 'docs/planning/sprint-2/walks/walk-21/99-missing.png'; }).includes(
      'step 2-desktop: stands on docs/planning/sprint-2/walks/walk-21/99-missing.png, which is not in the repository',
    ),
  );
});

/* ---------------------------------------------------------------------------------------------
 * Phase 21's pack is the plan's table
 * ------------------------------------------------------------------------------------------ */

const WALK_TESTS = ['2 open', '3 lookup haiku', '4 decision haiku', '5 document haiku', '6 standard sonnet', '7 deep opus', '8 stopped', '9 reload mid-answer'];

test('Phase 21: the stages are the plan\'s, in its order, and the host only names its own actions', () => {
  const { manifest } = loadPack(REPO, '21');
  assert.equal(manifest.base_url, 'https://web-xi-ten-uy9xk6c6p0.vercel.app');
  assert.deepEqual(
    manifest.stages.map((stage) => `${stage.id}:${stage.kind}`),
    ['prepare:prepare', 'go-live:host', 'walk:sandbox', 'walk-proofs:host', 'stop:host', 'offline:sandbox', 'start:host', 'back:sandbox'],
  );
  const actionsOf = (id) => stageOf(manifest, id).actions.map((entry) => (entry.action === 'db.proof' ? `db.proof ${entry.with.name}` : entry.action));
  assert.deepEqual(actionsOf('go-live'), [
    'runner.record',
    'db.proof planner-fingerprint',
    'workspace.stopTestRunner',
    'workspace.ensureProfile',
    'workspace.start',
    'workspace.doctorRow',
  ]);
  assert.deepEqual(stageOf(manifest, 'go-live').actions[1].with, { name: 'planner-fingerprint', save: 'planner_before' });
  assert.deepEqual(stageOf(manifest, 'go-live').actions[2].with, { container: 'bb2dash-wt21-workspace-1' });
  // Steps 10 and 11, and nothing else: the proofs of the walk's own steps are read once, straight after the walk.
  assert.deepEqual(actionsOf('walk-proofs'), ['workspace.noApiKey', 'workspace.credentialSource', 'db.proof planner-unchanged']);
  assert.deepEqual(stageOf(manifest, 'walk-proofs').actions[1].with, { request: 'carry:9.request_id' });
  assert.deepEqual(stageOf(manifest, 'walk-proofs').actions[2].with, { name: 'planner-unchanged', before: 'carry:planner_before.fingerprint' });
  assert.deepEqual(actionsOf('stop'), ['workspace.stop']);
  assert.deepEqual(actionsOf('start'), ['workspace.startNoBuild']);
  // No stage follows `back`: the proofs of steps 14b and 15 are those steps' own.
  assert.equal(manifest.stages.at(-1).id, 'back');
  assert.deepEqual(stageOf(manifest, 'walk').tests, WALK_TESTS);
  assert.deepEqual(stageOf(manifest, 'offline').tests, ['14a offline']);
  assert.deepEqual(stageOf(manifest, 'offline').deadline, { after: 'workspace.stop', seconds: 180 });
  assert.deepEqual(stageOf(manifest, 'back').tests, ['14b back', '15 archive']);
});

test("Phase 21: the steps are the acceptance script's fifteen, and each is done by whom the plan says", () => {
  const { manifest } = loadPack(REPO, '21');
  assert.deepEqual(
    manifest.steps.map((step) => `${step.id}:${step.kind}`),
    [
      '1:human',
      '2:auto',
      '2-desktop:waived',
      '3:auto',
      '4:auto',
      '5:auto',
      '6:auto',
      '7:auto',
      '8:auto',
      '9:auto',
      '10:host',
      '11:host',
      '12:waived',
      '13:host',
      '14a:auto',
      '14b:auto',
      '15:auto',
    ],
  );
  assert.match(stepOf(manifest, '12').text, /overtaken by the merge of 2026-10-07/);
  assert.equal(stepOf(manifest, '2-desktop').stands_on, 'docs/planning/sprint-2/walks/walk-21/08-desktop.png');
  // Steps 3 to 7 and 9: the tier each question must be answered at, and the tool the brief names for it.
  // Each is tied to this run (the host's own start time) and to its question (a literal md5, held by the test below).
  const turn = (id) => stepOf(manifest, id).proofs.find((proof) => proof.name === 'turn').with;
  const asked = (id) => stepOf(manifest, id).proofs[0].with.question_md5;
  const tied = (id) => ({ since: RUN_START, question_md5: asked(id) });
  for (const id of ['3', '4', '5', '6', '7', '8', '9']) assert.match(String(asked(id)), /^[0-9a-f]{32}$/, `step ${id}`);
  assert.equal(new Set(['3', '4', '5', '6', '7'].map(asked)).size, 5, 'five questions');
  assert.deepEqual([asked('8'), asked('9')], [asked('7'), asked('7')], 'steps 8 and 9 ask the question of step 7');
  assert.deepEqual(turn('3'), { request: 'carry:3.request_id', tier: 'low', ...tied('3'), tool: 'search_materials' });
  // From step 4 on, each names the step before it: its request must be the later one, so one request cannot stand for two steps.
  const after = (id) => ({ after: `carry:${id}.request_id` });
  assert.equal(turn('3').after, undefined, 'step 3 asks first');
  assert.deepEqual(turn('4'), { request: 'carry:4.request_id', tier: 'low', ...tied('4'), tool: 'search_context', scope: 'bb2dash-inbox-decisions', ...after('3') });
  assert.deepEqual(turn('5'), { request: 'carry:5.request_id', tier: 'low', ...tied('5'), tool: 'get_material_text', ...after('4') });
  assert.deepEqual(turn('6'), { request: 'carry:6.request_id', tier: 'mid', ...tied('6'), ...after('5') });
  assert.deepEqual(turn('7'), { request: 'carry:7.request_id', tier: 'high', ...tied('7'), ...after('6') });
  assert.deepEqual(turn('9'), { request: 'carry:9.request_id', tier: 'high', ...tied('9'), ...after('8') });
  assert.deepEqual(stepOf(manifest, '8').proofs, [{ name: 'turn-stopped', with: { request: 'carry:8.request_id', ...tied('8'), ...after('7') } }]);
  assert.equal(stepOf(manifest, '10').stage, 'walk-proofs');
  assert.deepEqual(stepOf(manifest, '10').actions, ['workspace.noApiKey', 'workspace.credentialSource']);
  assert.equal(stepOf(manifest, '11').stage, 'walk-proofs');
  assert.deepEqual(stepOf(manifest, '11').proofs, [{ name: 'planner-unchanged', with: { before: 'carry:planner_before.fingerprint' } }]);
  assert.equal(stepOf(manifest, '13').stage, 'go-live');
  assert.deepEqual(stepOf(manifest, '13').actions, ['workspace.stopTestRunner', 'workspace.ensureProfile', 'workspace.start', 'workspace.doctorRow']);
  // Step 14a: read while the service is still stopped (the host starts it only in the next stage): the question is in the queue, taken by nobody.
  assert.deepEqual(stepOf(manifest, '14a').proofs, [{ name: 'turn-waiting', with: { request: 'carry:14a.request_id', since: RUN_START, question_md5: asked('3') } }]);
  assert.deepEqual(manifest.stages.map((stage) => stage.id).slice(-3), ['offline', 'start', 'back'], 'nothing starts the service between the offline stage and its proof');
  // Step 14b: the question waited at least the 15 seconds step 14a's test watched it wait. No time of a sandbox is a parameter.
  assert.deepEqual(stepOf(manifest, '14b').proofs, [
    { name: 'turn-answered-after', with: { request: 'carry:14a.request_id', since: RUN_START, min_wait_s: 15, question_md5: asked('3') } },
  ]);
  assert.match(readText('web/e2e/accept21.spec.ts'), /const QUEUED_HOLD_MS = 15_000;/);
  assert.deepEqual(stepOf(manifest, '15').proofs, [
    { name: 'spike-archived' },
    { name: 'conversations-archived', with: { ids: 'carry:3.conversation_id', since: RUN_START } },
  ]);
});

/** The body of one test of a browser-test file: from its `acceptStep('<title>'` to the next one, or the file's end. */
function testBody(specText, title) {
  const start = specText.indexOf(`acceptStep('${title}'`);
  assert.notEqual(start, -1, `the browser-test file declares "${title}"`);
  const next = specText.indexOf('acceptStep(', start + 1);
  return specText.slice(start, next === -1 ? undefined : next);
}

/** The md5 of the one question a test types: the question's name from the test's own body, its words from where it is defined. */
function md5OfQuestionAskedBy(specText, title) {
  const named = [...new Set(testBody(specText, title).match(/\bQUESTION_[A-Z]+\b/g) ?? [])];
  assert.equal(named.length, 1, `the test "${title}" names one question (it names: ${named.join(', ') || 'none'})`);
  const question = questionsByName(REPO).get(named[0]);
  assert.equal(typeof question, 'string', `${named[0]} is defined in web/e2e/walk21.lib.ts`);
  return md5(question);
}

test("Phase 21: each proof's question_md5 is the md5 of the question the step's own test types", () => {
  const { manifest, specText } = loadPack(REPO, '21');
  const tied = manifest.steps.filter((step) => (step.proofs ?? []).some((proof) => proof.with?.question_md5 !== undefined));
  // The five questions, the stop, the reload and the question that waited: every step whose proof reads a turn or a stop.
  // Step 14b's test types nothing: it names the question it looks for, the one step 14a's test typed.
  assert.deepEqual(tied.map((step) => step.id), ['3', '4', '5', '6', '7', '8', '9', '14a', '14b']);
  assert.equal(md5OfQuestionAskedBy(specText, '14a offline'), md5OfQuestionAskedBy(specText, '14b back'));
  for (const step of tied) {
    for (const proof of step.proofs.filter((candidate) => candidate.with?.question_md5 !== undefined)) {
      assert.equal(proof.with.question_md5, md5OfQuestionAskedBy(specText, step.test), `step ${step.id}, proof ${proof.name}`);
    }
  }
  assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  // The reading tells one question from another: were step 8's test to type step 6's question, step 8's literal would no longer hold.
  const body = testBody(specText, '8 stopped');
  const asksAnother = specText.replace(body, body.replaceAll('QUESTION_DEEP', 'QUESTION_STANDARD'));
  assert.equal(md5OfQuestionAskedBy(asksAnother, '8 stopped'), stepOf(manifest, '6').proofs[0].with.question_md5);
  assert.notEqual(md5OfQuestionAskedBy(asksAnother, '8 stopped'), stepOf(manifest, '8').proofs[0].with.question_md5);
});

test('Phase 21: each proof is read once: no host stage runs a proof that an automated step lists', () => {
  const { manifest } = loadPack(REPO, '21');
  const hostRuns = manifest.stages.flatMap((stage) => stage.actions ?? []).filter((entry) => entry.action === 'db.proof').map((entry) => entry.with.name);
  // The two the host reads as actions: the planner before the walk (a reading, saved) and step 11's comparison.
  assert.deepEqual(hostRuns, ['planner-fingerprint', 'planner-unchanged']);
  const stepLists = manifest.steps.filter((step) => step.kind === 'auto').flatMap((step) => (step.proofs ?? []).map((proof) => proof.name));
  assert.deepEqual(stepLists, ['turn', 'turn', 'turn', 'turn', 'turn', 'turn-stopped', 'turn', 'turn-waiting', 'turn-answered-after', 'spike-archived', 'conversations-archived']);
  assert.deepEqual(hostRuns.filter((name) => stepLists.includes(name)), []);
});

test('Phase 21: the browser-test file holds the eleven titles of the interface spec, and nothing else', () => {
  assert.deepEqual(specTitles(readText('web/e2e/accept21.spec.ts')), [...WALK_TESTS, '14a offline', '14b back', '15 archive']);
});

test('Phase 21: the eight proofs, by name', () => {
  assert.deepEqual(Object.keys(loadPack(REPO, '21').proofs).sort(), [
    'conversations-archived',
    'planner-fingerprint',
    'planner-unchanged',
    'spike-archived',
    'turn',
    'turn-answered-after',
    'turn-stopped',
    'turn-waiting',
  ]);
});

/* ---------------------------------------------------------------------------------------------
 * The operator's rules and the page for people
 * ------------------------------------------------------------------------------------------ */

test("OPERATOR.md says how a step is run, what the four verdicts mean and what is never done, and its report is the schema's", () => {
  const operator = readText('acceptance/OPERATOR.md');
  assert.ok(operator.includes('ACCEPT_ONLY="<title>" npx playwright test -c e2e/accept.config.ts'), 'the one command');
  assert.ok(operator.includes('/accept/src/bb2dash/web'), 'where it is run');
  for (const verdict of ['`pass`', '`fail`', '`unsure`', '`blocked`']) assert.ok(operator.includes(verdict), verdict);
  for (const never of ['Sign out', '/accept/src', '/accept/state.json', 'another host']) assert.ok(operator.includes(never), never);
  assert.ok(operator.includes('report.json'), 'the report it writes last');
  const example = /```json\n([\s\S]*?)\n```/.exec(operator);
  assert.ok(example, 'OPERATOR.md shows the report as a json block');
  assert.deepEqual(validate(REPORT_SCHEMA, JSON.parse(example[1])), []);
  // It is a prompt for a session that may read course text: it quotes none itself.
  assert.doesNotMatch(operator, /IST\.\d{3}|ECN\.\d{3}/);
});

test('README.md says what a pack is made of: three files and one browser-test file', () => {
  const readme = readText('acceptance/README.md');
  for (const name of ['manifest.json', 'playbook.md', 'proofs.json', 'web/e2e/accept<NN>.spec.ts', 'just accept']) {
    assert.ok(readme.includes(name), name);
  }
});

test('README.md ends with what the first proof run taught: one reading, what notes are for, and that a proof run is no acceptance', () => {
  const headings = readText('acceptance/README.md').split('\n').filter((line) => line.startsWith('## '));
  assert.equal(headings.at(-1), '## What the first proof run taught (2026-10-07)');
  const section = readText('acceptance/README.md').split(`${headings.at(-1)}\n`)[1];
  for (const said of ['Ask again', '`notes`', '`--proof`', 'never counts as acceptance']) assert.ok(section.includes(said), said);
});

/* ---------------------------------------------------------------------------------------------
 * Where login.mjs saves the session
 * ------------------------------------------------------------------------------------------ */

test('login.mjs saves to its own gitignored file unless WALK_STATE_PATH names another, outside the checkout', () => {
  const root = path.resolve('/checkouts/bb2dash');
  const standard = path.join(root, 'web', 'e2e', '.auth', 'state.json');
  const outside = path.resolve('/home/stack/.bb2dash-accept/state/walk.json');
  assert.equal(statePathFrom({}, { root, standard }), standard);
  assert.equal(statePathFrom({ WALK_STATE_PATH: '' }, { root, standard }), standard);
  assert.equal(statePathFrom({ WALK_STATE_PATH: outside }, { root, standard }), outside);
  assert.equal(statePathFrom({ WALK_STATE_PATH: standard }, { root, standard }), standard);
  assert.throws(() => statePathFrom({ WALK_STATE_PATH: 'state.json' }, { root, standard }), /WALK_STATE_PATH must be an absolute path/);
  assert.throws(
    () => statePathFrom({ WALK_STATE_PATH: path.join(root, 'docs', 'state.json') }, { root, standard }),
    /WALK_STATE_PATH is inside this checkout/,
  );
  assert.throws(() => statePathFrom({ WALK_STATE_PATH: path.join(path.dirname(outside), 'walk.txt') }, { root, standard }), /must end in \.json/);
  assert.match(readText('web/e2e/login.mjs'), /statePathFrom\(process\.env/);
});

test('WALK_STATE_PATH is followed through a link, by the one reading of "inside" the browser tests use too', () => {
  const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-login-state-'));
  try {
    const root = path.join(holder, 'checkout');
    const standard = path.join(root, 'web', 'e2e', '.auth', 'state.json');
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    // A junction on Windows, a symlink elsewhere: written outside the checkout, it leads into it.
    const link = path.join(holder, 'way-in');
    fs.symlinkSync(path.join(root, 'docs'), link, 'junction');
    assert.equal(statePathFrom({ WALK_STATE_PATH: path.join(holder, 'walk.json') }, { root, standard }), path.join(holder, 'walk.json'));
    assert.throws(() => statePathFrom({ WALK_STATE_PATH: path.join(link, 'walk.json') }, { root, standard }), /WALK_STATE_PATH is inside this checkout/);
  } finally {
    fs.rmSync(holder, { recursive: true, force: true });
  }
  for (const file of ['web/e2e/login-state.mjs', 'web/e2e/accept.env.ts']) {
    assert.match(readText(file), /import \{ isInside \} from '\.\/inside\.mjs';/, `${file} uses the shared reading`);
    assert.doesNotMatch(readText(file), /function isInside/, `${file} keeps no reading of its own`);
  }
});

test('README.md says what the saved session file holds, where it lives and when it is deleted', () => {
  const readme = readText('acceptance/README.md').replace(/\s+/g, ' ');
  for (const said of ['`ACCEPT_STATE`', 'answers included', 'private folder', 'deleted when the stage ends']) assert.ok(readme.includes(said), said);
});

/* ---------------------------------------------------------------------------------------------
 * Phase 24's pack: the Workspace behind the page (brief 109, task 45)
 * ------------------------------------------------------------------------------------------ */

const PACK_24_STAGES = ['prepare', 'go-live', 'walk', 'walk-proofs', 'upload', 'indexed', 'find', 'delete', 'store-proofs'];
const PACK_24_WALK = ['2 open workspace', '3 course question', '4 lookup one turn', '5 standard plan', '6 planner feed', '7 follow-up', '8 nothing matches', '9 stop then answer'];
const PACK_24_UPLOAD_TITLES = ['11 upload file', '13 find upload', '14 send twice', '15 delete upload'];
/** The proofs the store's five reads are carried as (task 49, proofs 1, 2, 3, 6 and 7). */
const PACK_24_STORE_PROOFS = ['store-extension', 'store-vector-columns', 'store-vector-indexes', 'store-counts', 'store-no-links'];

/** What a constant of a source file is set to, for `const NAME = '…';` or `"…"` on one line. */
function constantOf(source, name) {
  const found = new RegExp(`const ${name}(?::[^=]+)? = (['"])((?:(?!\\1).)+)\\1;`).exec(source);
  assert.ok(found, `${name} is defined as one quoted string`);
  return found[2];
}

const hostProofRuns = (manifest) =>
  manifest.stages.flatMap((stage) => stage.actions ?? []).filter((entry) => ['db.proof', 'db.proofUntil'].includes(entry.action));

test("Phase 24: the stages are the brief's, in order, and the go-live stage stops nothing it does not own", () => {
  const { manifest } = loadPack(REPO, '24');
  assert.deepEqual(manifest.stages.map((stage) => stage.id), PACK_24_STAGES);
  assert.deepEqual(stageOf(manifest, 'go-live').actions, [
    { action: 'runner.record' },
    { action: 'db.proof', with: { name: 'planner-fingerprint', save: 'planner_before' } },
    { action: 'workspace.ensureProfile' },
    { action: 'workspace.start' },
    { action: 'workspace.doctorRow' },
    { action: 'ingest.start' },
  ]);
  const named = manifest.stages.flatMap((stage) => (stage.actions ?? []).map((entry) => entry.action));
  for (const never of ['workspace.stopTestRunner', 'workspace.stop', 'apply.stop', 'apply.startNoBuild', 'exports.runNow']) assert.ok(!named.includes(never), never);
  assert.deepEqual(stageOf(manifest, 'walk').tests, PACK_24_WALK);
  assert.deepEqual(stageOf(manifest, 'upload').tests, ['11 upload file']);
  assert.deepEqual(stageOf(manifest, 'find').tests, ['13 find upload', '14 send twice']);
  assert.deepEqual(stageOf(manifest, 'delete').tests, ['15 delete upload']);
  assert.deepEqual(specTitles(readText('web/e2e/accept24.spec.ts')), [...PACK_24_WALK, ...PACK_24_UPLOAD_TITLES]);
});

test("Phase 24: step 1 stays a person's, and every step has its owner", () => {
  const { manifest } = loadPack(REPO, '24');
  const kinds = Object.fromEntries(manifest.steps.map((step) => [step.id, step.kind]));
  assert.deepEqual(kinds, {
    0: 'host', 1: 'human', 2: 'auto', 3: 'auto', 4: 'auto', 5: 'auto', 6: 'auto', 7: 'auto', 8: 'auto', 9: 'auto',
    10: 'host', 11: 'auto', 12: 'host', 13: 'auto', 14: 'auto', 15: 'auto', 16: 'host',
  });
});

test("Phase 24: each proof that holds a question is held to the md5 of the question the step's own test types", () => {
  const { manifest, specText } = loadPack(REPO, '24');
  const typed = {
    3: { 'turn-found': 'QUESTION_COURSE' },
    4: { 'turn-lookup': 'QUESTION_LOOKUP' },
    5: { 'turn-planned': 'QUESTION_PLAN' },
    6: { 'turn-feed': 'QUESTION_PLANNER' },
    7: { 'turn-followup': 'QUESTION_FOLLOW_UP' },
    8: { 'turn-empty': 'QUESTION_NOTHING' },
    9: { 'turn-stopped': 'QUESTION_STOP', 'turn-done-after-stop': 'QUESTION_AFTER_STOP' },
    13: { 'turn-upload-found': 'QUESTION_UPLOAD' },
  };
  for (const [id, byProof] of Object.entries(typed)) {
    const step = stepOf(manifest, id);
    assert.deepEqual(step.proofs.map((proof) => proof.name).filter((name) => name in byProof), Object.keys(byProof), `step ${id} lists its question proofs`);
    const body = testBody(specText, step.test);
    for (const [name, constant] of Object.entries(byProof)) {
      assert.match(body, new RegExp(`\\b${constant}\\b`), `the test "${step.test}" types ${constant}`);
      assert.equal(step.proofs.find((proof) => proof.name === name).with.question_md5, md5(constantOf(specText, constant)), `step ${id}, proof ${name}`);
    }
  }
  // The reading tells one question from another: a different question gives a different md5.
  assert.notEqual(md5(constantOf(specText, 'QUESTION_COURSE')), md5(constantOf(specText, 'QUESTION_LOOKUP')));
});

test('Phase 24: the questions route the way the playbook says they do (workspace/src/router.ts)', async () => {
  const { specText } = loadPack(REPO, '24');
  const { routeTier } = await import('../workspace/src/router.ts');
  const tierOf = (name, prior = null) => routeTier(constantOf(specText, name), prior);
  for (const name of ['QUESTION_COURSE', 'QUESTION_LOOKUP', 'QUESTION_PLANNER', 'QUESTION_NOTHING', 'QUESTION_AFTER_STOP', 'QUESTION_UPLOAD']) {
    assert.equal(tierOf(name), 'low', `${name} is a lookup`);
  }
  // A plan is taken on mid and high only: the page can only send Auto, so the wording decides.
  assert.equal(tierOf('QUESTION_PLAN'), 'mid');
  assert.equal(tierOf('QUESTION_STOP'), 'mid');
  // The follow-up is short and keeps the conversation's tier.
  assert.ok(Array.from(constantOf(specText, 'QUESTION_FOLLOW_UP')).length <= 40);
  assert.equal(tierOf('QUESTION_FOLLOW_UP', 'low'), 'low');
});

test('Phase 24: the nonsense question is made of invented words that the synthetic file does not hold', () => {
  const { specText } = loadPack(REPO, '24');
  const nonsense = constantOf(specText, 'QUESTION_NOTHING').toLowerCase();
  const file = constantOf(readText('web/e2e/accept24.lib.ts'), 'FILE_PREFIX').toLowerCase();
  const words = nonsense.match(/[a-z]{6,}/g) ?? [];
  assert.ok(words.length >= 3, 'the question is made of invented words');
  for (const word of words) assert.ok(!file.includes(word), word);
});

test('Phase 24: the fixed sentence of an empty answer is the one in contract24/lines.txt', () => {
  const lines = readText('workspace/test/fixtures/contract24/lines.txt');
  const sentence = /^empty: (.+)$/m.exec(lines)?.[1];
  assert.ok(sentence);
  assert.equal(constantOf(readText('web/e2e/accept24.spec.ts'), 'EMPTY_LINE'), sentence);
});

test('Phase 24: the synthetic file is new in every run: its hash is made from a nonce the host carries, and the proofs derive it the same way', () => {
  const { manifest, proofs } = loadPack(REPO, '24');
  const lib = readText('web/e2e/accept24.lib.ts');
  const prefix = constantOf(lib, 'FILE_PREFIX');
  assert.match(lib, /randomUUID\(\)/, 'the nonce is drawn in each run');
  assert.match(lib, /nonce_id/, 'and noted as a uuid, a kind of value that crosses between stages');
  const keyed = ['upload-indexed', 'upload-one-row', 'upload-gone'];
  for (const name of keyed) {
    assert.deepEqual(Object.keys(proofs[name].params).slice(0, 1), ['nonce'], name);
    assert.equal(proofs[name].params.nonce, 'uuid');
    assert.ok(proofs[name].sql.includes(`convert_to('${prefix}' || $1::text, 'UTF8')`), `${name} hashes the file the test writes`);
  }
  // Three reads keyed on it, in the order of the brief: indexed (waited for, before the delete), one row (after the second send), gone (after the delete).
  const waited = hostProofRuns(manifest).filter((entry) => keyed.includes(entry.with.name));
  assert.deepEqual(waited.map((entry) => [entry.action, entry.with.name]), [['db.proofUntil', 'upload-indexed']]);
  assert.equal(waited[0].with.nonce, 'carry:11.nonce_id');
  assert.deepEqual(stepOf(manifest, '14').proofs, [{ name: 'upload-one-row', with: { nonce: 'carry:11.nonce_id', document: 'carry:11.document_id', since: RUN_START } }]);
  const gone = stepOf(manifest, '15').proofs.find((proof) => proof.name === 'upload-gone');
  assert.deepEqual(gone.with, { nonce: 'carry:11.nonce_id', document: 'carry:11.document_id' });
  const order = manifest.stages.map((stage) => stage.id);
  assert.ok(order.indexOf('indexed') > order.indexOf('upload') && order.indexOf('indexed') < order.indexOf('find'), 'it is waited for before it is searched');
  assert.ok(order.indexOf('delete') > order.indexOf('find'));
  assert.equal(constantOf(lib, 'FILE_MIME'), 'text/plain');
  assert.doesNotMatch(prefix, /IST|ECN|syllabus|lecture/i);
});

test('Phase 24: no proof of the walk compares a counter between two moments, and proof 6 reads its counts against a direct count', () => {
  const { manifest, proofs } = loadPack(REPO, '24');
  for (const [name, proof] of Object.entries(proofs).filter(([name]) => !name.startsWith('store-'))) {
    assert.ok(!/uploads_indexed|memory_indexed|course_units_indexed/.test(proof.sql), `${name} reads no counter of the status row`);
  }
  const counts = proofs['store-counts'].sql;
  for (const direct of ['count(*) from public.bb_file_text', 'count(distinct e.text_id) from public.bb_text_embeddings', "d.kind = 'upload' and d.state = 'indexed'", "d.kind = 'memory' and d.state = 'indexed'"]) {
    assert.ok(counts.includes(direct), direct);
  }
  assert.deepEqual(proofs['store-counts'].params, {});
  assert.deepEqual(stepOf(manifest, '16').proofs.map((proof) => proof.name), PACK_24_STORE_PROOFS);
  assert.deepEqual(stageOf(manifest, 'store-proofs').actions.map((entry) => entry.with.name), PACK_24_STORE_PROOFS);
});

test("Phase 24: one proof counts the run's conversations left unarchived and expects none; each step archives what it opened", () => {
  const { manifest, proofs, specText } = loadPack(REPO, '24');
  const proof = stepOf(manifest, '15').proofs.find((candidate) => candidate.name === 'conversations-unarchived');
  assert.ok(proof, 'the last step carries it');
  assert.deepEqual(proofs['conversations-unarchived'].params, { since: 'time', min_conversations: 'integer' });
  assert.match(proofs['conversations-unarchived'].sql, /count\(\*\) filter \(where not c\.archived\) = 0/);
  // Steps 3 and 7 share one conversation; 4, 5, 6, 8, 9 and 13 open one each.
  assert.deepEqual(proof.with, { since: RUN_START, min_conversations: 7 });
  for (const title of ['4 lookup one turn', '5 standard plan', '6 planner feed', '7 follow-up', '8 nothing matches', '9 stop then answer', '13 find upload']) {
    assert.match(testBody(specText, title), /archiveAfter\(/, `"${title}" archives what it opened`);
  }
  assert.doesNotMatch(testBody(specText, '3 course question'), /archiveAfter\(/, 'step 3 leaves its conversation to step 7, the last that uses it');
});

test("Phase 24: the proofs by name; the planner's two reads are pack 21's, word for word", () => {
  const { proofs } = loadPack(REPO, '24');
  assert.deepEqual(Object.keys(proofs).sort(), [
    'conversations-unarchived', 'planner-fingerprint', 'planner-unchanged', ...PACK_24_STORE_PROOFS,
    'turn-done-after-stop', 'turn-empty', 'turn-feed', 'turn-found', 'turn-followup', 'turn-lookup', 'turn-planned', 'turn-stopped', 'turn-upload-found',
    'upload-gone', 'upload-indexed', 'upload-one-row',
  ].sort());
  for (const name of ['planner-fingerprint', 'planner-unchanged']) assert.deepEqual(proofs[name], loadPack(REPO, '21').proofs[name], name);
});

test('Phase 24: the planner is read before the walk and again after it, and the walk-proofs stage runs only that comparison', () => {
  const { manifest } = loadPack(REPO, '24');
  assert.deepEqual(stageOf(manifest, 'walk-proofs').actions, [{ action: 'db.proof', with: { name: 'planner-unchanged', before: 'carry:planner_before.fingerprint' } }]);
  assert.deepEqual(stepOf(manifest, '10').proofs, [{ name: 'planner-unchanged', with: { before: 'carry:planner_before.fingerprint' } }]);
  assert.deepEqual(stepOf(manifest, '6').proofs.map((proof) => proof.name), ['turn-feed']);
});

test("Phase 24: the wait for the index is db.proofUntil on a host step's proof, and a db.proofUntil is held to proofs.json like db.proof", () => {
  const { manifest } = loadPack(REPO, '24');
  const values = { nonce: 'carry:11.nonce_id', document: 'carry:11.document_id', since: RUN_START };
  assert.deepEqual(stageOf(manifest, 'indexed').actions, [{ action: 'db.proofUntil', with: { name: 'upload-indexed', ...values } }]);
  assert.deepEqual(stepOf(manifest, '12').proofs, [{ name: 'upload-indexed', with: values }]);
  const broken = (change) => {
    const pack = loadPack(REPO, '24');
    const copy = { ...pack, manifest: copyOf(pack.manifest), proofs: copyOf(pack.proofs) };
    change(copy);
    return packProblems(copy, { repo: REPO, manifestSchema: MANIFEST_SCHEMA });
  };
  assert.ok(broken((pack) => { stageOf(pack.manifest, 'indexed').actions[0].with.name = 'upload-missing'; }).includes('stage indexed: proofs.json holds no proof named "upload-missing"'));
  assert.ok(broken((pack) => { delete stageOf(pack.manifest, 'indexed').actions[0].with.document; }).includes('stage indexed: proof "upload-indexed" is not given "document"'));
  assert.ok(broken((pack) => { stageOf(pack.manifest, 'indexed').actions[0].with.nonce = 'carry:15.nonce_id'; }).some((line) => line.includes('is read before step 15 has run')));
  // The host step's proof is run by its stage only when the action carries the same values.
  assert.ok(broken((pack) => { stageOf(pack.manifest, 'indexed').actions[0].with.document = 'carry:11.request_id'; }).some((line) => line.startsWith('step 12:')));
});

test('Phase 24: no title of its browser tests is a title of another pack: ACCEPT_ONLY names a title, and every accept spec is loaded', () => {
  const own = specTitles(readText('web/e2e/accept24.spec.ts'));
  const others = PACKS.filter((phase) => phase !== '24').flatMap((phase) => specTitles(readText(`web/e2e/accept${phase}.spec.ts`)));
  assert.ok(others.length > 0);
  assert.deepEqual(own.filter((title) => others.includes(title)), []);
});
