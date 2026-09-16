/**
 * L3 — golden fixtures cut from prod (`fixtures/<course>.json`): every scheme
 * course at start / mid / all graded plus its live 2026-09-16 state, each with
 * hand-computed expectations and a written derivation. The live states must
 * reproduce the brief's "What the answers mean on screen today" table.
 */

import { describe, expect, it } from 'vitest';
import { projectCourse, solveTarget } from '@/lib/grade-model';
import { evaluateModel } from '@/lib/grade-model/project';
import { expectPartial, fixtureFor, inputOf, loadFixtures, stateOf } from './fixture-loader';

const COURSES = ['ECN.304', 'GEO.103.lecture', 'IST.323', 'IST.352', 'IST.466', 'IST.471'];
const fixtures = loadFixtures();

describe('L3 fixture files', () => {
  it('cover every scheme course with start, mid, all-graded and live states', () => {
    expect(fixtures.map((fixture) => fixture.course)).toEqual(COURSES);
    fixtures.forEach((fixture) => {
      const names = fixture.states.map((state) => state.name);
      expect(names, fixture.course).toEqual(expect.arrayContaining(['start', 'mid', 'all_graded', 'live_2026_09_16']));
      expect(fixture.provenance.length).toBeGreaterThan(0);
    });
  });

  it('mark the hand-made states synthetic and write a derivation for every state', () => {
    fixtures.forEach((fixture) =>
      fixture.states.forEach((state) => {
        const label = `${fixture.course}/${state.name}`;
        expect(state.derivation.length, label).toBeGreaterThan(0);
        if (['mid', 'all_graded'].includes(state.name)) expect(state.synthetic, label).toBe(true);
        if (state.name.startsWith('live_2026')) expect(state.synthetic, label).toBe(false);
      }),
    );
  });
});

describe.each(fixtures.map((fixture) => [fixture.course, fixture] as const))('L3 %s', (_course, fixture) => {
  it.each(fixture.states.map((state) => [state.name, state] as const))('%s', (name, state) => {
    const input = inputOf(fixture, state);
    expectPartial(projectCourse(input), state.expected, `${fixture.course}/${name}`);
    (state.solver ?? []).forEach(({ letter, expected }) =>
      expectPartial({ letter, ...solveTarget(input, letter) }, { letter, ...expected }, `${fixture.course}/${name}/solve ${letter}`),
    );
  });
});

describe('L3 live 2026-09-16 reproduces "What the answers mean on screen today"', () => {
  const live = (course: string) => {
    const fixture = fixtureFor(course);
    return { fixture, input: inputOf(fixture, stateOf(fixture, 'live_2026_09_16')) };
  };

  it.each([
    { course: 'IST.323', names: ['Class Participation'] },
    { course: 'ECN.304', names: ['Participation'] },
    { course: 'IST.352', names: ['Attendance, Class Contribution'] },
    { course: 'GEO.103.lecture', names: ['Lecture Attendance', 'Discussion Section Attendance & Participation'] },
  ])('$course: not computed, $names not scored', ({ course, names }) => {
    expect(projectCourse(live(course).input)).toEqual({ state: 'not_computable', reason: 'manual_unscored', unscoredManual: names });
  });

  it('IST.466: nothing graded, with Major Cases and AI Team Assignment left out as unsure', () => {
    const { fixture, input } = live('IST.466');
    expect(projectCourse(input)).toEqual({ state: 'not_computable', reason: 'nothing_graded', unscoredManual: [] });
    const scheme = fixture.scheme;
    if (scheme.method !== 'points') throw new Error('IST.466 is a points scheme');
    const evaluation = evaluateModel(input, scheme, scheme.method);
    const muted = evaluation.model.roots.filter((node) => node.muted).map((node) => node.component.name);
    expect(muted).toEqual(['Two Major Case Studies (Synchrony, SU IT)', 'AI Team Assignment']);
  });

  it('IST.471: not computed, graded qualitatively', () => {
    expect(projectCourse(live('IST.471').input)).toEqual({ state: 'not_computable', reason: 'qualitative_method', unscoredManual: [] });
  });
});
