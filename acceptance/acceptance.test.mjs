// bb2dash :: acceptance/acceptance.test.mjs
//
//   node --test acceptance/acceptance.test.mjs
//
// Holds every acceptance pack under acceptance/<NN>/ to the rules in acceptance/README.md, with no
// dependency and no network: the manifest against its schema, every automated step against the
// browser-test file it names, every proof against proofs.json, every sandbox stage against the
// playbook, and the rule that a pack quotes no course text. The rules themselves are in
// pack-check.mjs; each one is shown to fail on a pack that breaks it, because a check that cannot
// fail guards nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate } from './schema-lite.mjs';
import { QUOTE_MAX_CHARS, listPacks, loadPack, packProblems, questionsOf, specTitles } from './pack-check.mjs';
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
  assert.match(broken((m) => { m.steps[0].id = 'host'; }), /\$\.steps\[0\]: matches none/);
  // A host step is a label: the actions that carry it are its proof. It lists none itself.
  const withHostStep = (change) =>
    broken((m) => {
      m.stages[1].actions[2].step = '13';
      m.steps.push({ id: '13', kind: 'host', stage: 'go-live', text: 'the old test runner is stopped' });
      m.stages.push({ id: 'offline', kind: 'sandbox', tests: ['14a offline'], deadline: { from: 'carry:host.stopped_at', plus_seconds: 180 } });
      change(m);
    });
  assert.equal(withHostStep(() => {}), '');
  assert.match(withHostStep((m) => { m.steps.at(-1).actions = ['workspace.stop']; }), /\$\.steps\[3\]: matches none/);
  assert.match(withHostStep((m) => { m.stages.at(-1).deadline = { after: 'workspace.stop', seconds: 180 }; }), /\$\.stages\[3\]: matches none/);
  assert.match(withHostStep((m) => { m.stages.at(-1).deadline.plus_seconds = 0; }), /\$\.stages\[3\]: matches none/);
  assert.match(withHostStep((m) => { m.steps[2].stands_on = 'docs/x.png'; }), /\$\.steps\[2\]: matches none/);
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

test('a proof must exist in proofs.json with the same parameter names and a value of the stated type', () => {
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
  // A host action names a proof that proofs.json does not hold.
  assert.ok(
    problemsAfter((pack) => { stageOf(pack.manifest, 'back-proofs').actions[1].with.name = 'spike-gone'; }).some((line) =>
      line.startsWith('stage back-proofs: proofs.json holds no proof named "spike-gone"'),
    ),
  );
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

test('a host step names a host stage, and at least one action of that stage carries its label', () => {
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '10').stage = 'walk'; }).includes('step 10: stage "walk" is a sandbox stage, not a host stage'),
  );
  const unlabelled = problemsAfter((pack) => {
    for (const action of stageOf(pack.manifest, 'go-live').actions) delete action.step;
  });
  assert.ok(unlabelled.includes('step 13: no action of stage "go-live" is labelled with it'));
  const mislabelled = problemsAfter((pack) => { stageOf(pack.manifest, 'walk-proofs').actions.find((action) => action.step === '10').step = '13'; });
  assert.ok(mislabelled.includes('stage walk-proofs: workspace.noApiKey is labelled with step 13, which is not a host step of this stage'));
  assert.ok(
    problemsAfter((pack) => { stageOf(pack.manifest, 'stop').actions[0].step = '3'; }).includes(
      'stage stop: workspace.stop is labelled with step 3, which is not a host step of this stage',
    ),
  );
});

test('a carried value comes from a step that has already run, or from something the host saved earlier', () => {
  const walkProofs = (pack) => stageOf(pack.manifest, 'walk-proofs').actions;
  // A host action reads a step's facts only after that step's stage.
  assert.ok(
    problemsAfter((pack) => { walkProofs(pack)[0].with.request = 'carry:14a.request_id'; }).includes(
      'stage walk-proofs: "carry:14a.request_id" is read before step 14a has run',
    ),
  );
  // A step's own proofs may read its own stage, and nothing later.
  assert.deepEqual(problemsAfter((pack) => { stepOf(pack.manifest, '3').proofs[0].with.request = 'carry:9.request_id'; }), []);
  assert.ok(
    problemsAfter((pack) => { stepOf(pack.manifest, '3').proofs[0].with.request = 'carry:14a.request_id'; }).includes(
      'step 3: "carry:14a.request_id" is read before step 14a has run',
    ),
  );
  // What the host saved sits under "host": a proof's detail under its save name, a start and a stop under their times.
  assert.ok(
    problemsAfter((pack) => { walkProofs(pack).at(-1).with.before = 'carry:host.planner_start'; }).includes(
      'stage walk-proofs: "carry:host.planner_start" is saved by no earlier action',
    ),
  );
  assert.ok(
    problemsAfter((pack) => { walkProofs(pack).at(-1).with.before = 'carry:planner_before.fingerprint'; }).includes(
      'stage walk-proofs: "carry:planner_before.fingerprint" names no step of the pack',
    ),
  );
  assert.ok(
    problemsAfter((pack) => { walkProofs(pack).at(-1).with.before = 'carry:10.request_id'; }).includes(
      'stage walk-proofs: "carry:10.request_id" names a step that carries nothing over',
    ),
  );
  assert.ok(
    problemsAfter((pack) => { walkProofs(pack)[0].with.request = 'carry:3'; }).includes('stage walk-proofs: "carry:3" is not a carry:<step>.<field> reference'),
  );
});

test("a stage's deadline counts from a time the host saved before it", () => {
  assert.ok(
    problemsAfter((pack) => { stageOf(pack.manifest, 'offline').deadline.from = 'carry:host.never_saved'; }).includes(
      'stage offline: its deadline: "carry:host.never_saved" is saved by no earlier action',
    ),
  );
  // With go-live gone, nothing before this stage has started the service, so no start time is saved yet.
  const reordered = problemsAfter((pack) => {
    const stages = pack.manifest.stages;
    stages.splice(stages.findIndex((stage) => stage.id === 'go-live'), 1);
    stageOf(pack.manifest, 'offline').deadline.from = 'carry:host.started_at';
  });
  assert.ok(reordered.includes('stage offline: its deadline: "carry:host.started_at" is saved by no earlier action'));
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
  const quoted = problemsAfter((pack) => ({ ...pack, playbook: `${pack.playbook}\nThe answer reads "${answer}"\n` }));
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

test('a file of this repository that a step names in its text must be there', () => {
  assert.ok(
    problemsAfter((pack) => {
      const step = stepOf(pack.manifest, '2-desktop');
      step.text = step.text.replace('08-desktop.png', '99-missing.png');
    }).includes('step 2-desktop: its text names docs/planning/sprint-2/walks/walk-21/99-missing.png, which is not in the repository'),
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
    ['prepare:prepare', 'go-live:host', 'walk:sandbox', 'walk-proofs:host', 'stop:host', 'offline:sandbox', 'start:host', 'back:sandbox', 'back-proofs:host'],
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
  // Each host step is the actions that carry its label: 13 in go-live, 10 and 11 in walk-proofs.
  const labelsOf = (id) => stageOf(manifest, id).actions.map((entry) => entry.step ?? '-');
  assert.deepEqual(labelsOf('go-live'), ['-', '-', '13', '13', '13', '13']);
  assert.deepEqual(labelsOf('walk-proofs'), ['-', '-', '-', '-', '-', '-', '-', '10', '10', '11']);
  assert.deepEqual(stageOf(manifest, 'walk-proofs').actions.at(-1), {
    action: 'db.proof',
    step: '11',
    with: { name: 'planner-unchanged', before: 'carry:host.planner_before' },
  });
  assert.deepEqual(actionsOf('walk-proofs'), [
    'db.proof turn',
    'db.proof turn',
    'db.proof turn',
    'db.proof turn',
    'db.proof turn',
    'db.proof turn-stopped',
    'db.proof turn',
    'workspace.noApiKey',
    'workspace.credentialSource',
    'db.proof planner-unchanged',
  ]);
  assert.deepEqual(actionsOf('stop'), ['workspace.stop']);
  assert.deepEqual(actionsOf('start'), ['workspace.startNoBuild']);
  assert.deepEqual(actionsOf('back-proofs'), ['db.proof turn-answered-after', 'db.proof spike-archived', 'db.proof conversations-archived']);
  assert.deepEqual(stageOf(manifest, 'walk').tests, WALK_TESTS);
  assert.deepEqual(stageOf(manifest, 'offline').tests, ['14a offline']);
  assert.deepEqual(stageOf(manifest, 'offline').deadline, { from: 'carry:host.stopped_at', plus_seconds: 180 });
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
  assert.ok(stepOf(manifest, '2-desktop').text.includes('docs/planning/sprint-2/walks/walk-21/08-desktop.png'));
  // Steps 3 to 7 and 9: the tier each question must be answered at, and the tool the brief names for it.
  const turn = (id) => stepOf(manifest, id).proofs.find((proof) => proof.name === 'turn').with;
  assert.deepEqual(turn('3'), { request: 'carry:3.request_id', tier: 'low', tool: 'search_materials' });
  assert.deepEqual(turn('4'), { request: 'carry:4.request_id', tier: 'low', tool: 'search_context', scope: 'bb2dash-inbox-decisions' });
  assert.deepEqual(turn('5'), { request: 'carry:5.request_id', tier: 'low', tool: 'get_material_text' });
  assert.deepEqual(turn('6'), { request: 'carry:6.request_id', tier: 'mid' });
  assert.deepEqual(turn('7'), { request: 'carry:7.request_id', tier: 'high' });
  assert.deepEqual(turn('9'), { request: 'carry:9.request_id', tier: 'high' });
  assert.deepEqual(stepOf(manifest, '8').proofs, [{ name: 'turn-stopped', with: { request: 'carry:8.request_id' } }]);
  assert.deepEqual(stageOf(manifest, 'walk-proofs').actions[8], { action: 'workspace.credentialSource', step: '10', with: { request: 'carry:9.request_id' } });
  for (const [id, stage] of [['10', 'walk-proofs'], ['11', 'walk-proofs'], ['13', 'go-live']]) {
    assert.deepEqual(Object.keys(stepOf(manifest, id)).sort(), ['id', 'kind', 'stage', 'text'], `step ${id} is a label and a sentence`);
    assert.equal(stepOf(manifest, id).stage, stage);
  }
  assert.deepEqual(stepOf(manifest, '14b').proofs, [
    { name: 'turn-answered-after', with: { request: 'carry:14a.request_id', after: 'carry:14a.still_queued_at' } },
  ]);
  assert.deepEqual(
    stepOf(manifest, '15').proofs.map((proof) => proof.name),
    ['spike-archived', 'conversations-archived'],
  );
});

test('Phase 21: the browser-test file holds the eleven titles of the interface spec, and nothing else', () => {
  assert.deepEqual(specTitles(readText('web/e2e/accept21.spec.ts')), [...WALK_TESTS, '14a offline', '14b back', '15 archive']);
});

test('Phase 21: the seven proofs of the interface spec, by name', () => {
  assert.deepEqual(Object.keys(loadPack(REPO, '21').proofs).sort(), [
    'conversations-archived',
    'planner-fingerprint',
    'planner-unchanged',
    'spike-archived',
    'turn',
    'turn-answered-after',
    'turn-stopped',
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
