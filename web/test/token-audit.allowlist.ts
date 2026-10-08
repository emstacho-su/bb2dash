/**
 * The token audit's allowlist (Phase 22, task 2; P-16, R-53; brief 103, "Allowlist").
 *
 * FROZEN. This file was written once, at task 2, and is not edited after. The
 * phase's PR proves it:
 *
 *   git diff --quiet <task-2 sha> HEAD -- web/test/token-audit.allowlist.ts
 *
 * (the sha is in `docs/planning/sprint-2/verification/103_W67_VERIFICATION.md`).
 * A literal that is not let through here is removed or becomes a token. It is
 * not added here.
 *
 * Data only. `token-audit.test.ts` reads it, checks every entry against the
 * live tree, and tells the scanner what each file is let through. Paths are
 * from the repository root.
 *
 *   A1  the breakpoints a width condition may hold
 *   A2  1px and 2px
 *   A3  declarations a test pins or a TypeScript constant mirrors
 *   A4  the theme's page backgrounds in `theme-preference.ts`, as a rule
 *   A5  two inline style keys that pre-existing tests assert on
 */

/* ---------------------------------------------------------------------------
 * A1: breakpoints
 * ------------------------------------------------------------------------ */

/**
 * The values an `@media` width condition may hold. A custom property cannot
 * sit in a media condition without a PostCSS dependency, so a breakpoint is a
 * literal, and it is one of these eight. Any other value fails.
 */
export const MEDIA_WIDTHS: readonly string[] = [
  '480px',
  '620px',
  '640px',
  '720px',
  '760px',
  '820px',
  '900px',
  '1023.98px',
];

/** One `@container` width, named with its file. */
export interface ContainerWidth {
  file: string;
  width: string;
}

/** The one `@container` width: the Stream timeline stacks its lanes at 600px. Any other fails. */
export const CONTAINER_WIDTHS: readonly ContainerWidth[] = [
  { file: 'web/src/components/course/CourseTimeline.module.css', width: '600px' },
];

/* ---------------------------------------------------------------------------
 * A2: hairlines
 * ------------------------------------------------------------------------ */

/** 1px and 2px, with or without a leading minus, in any property: hairlines, outlines, nudges. */
export const HAIRLINE_SIZES: readonly string[] = ['1px', '2px'];

/* ---------------------------------------------------------------------------
 * A3: pinned and mirrored declarations
 * ------------------------------------------------------------------------ */

/** An exported constant mirrors the declaration. The test imports it and compares. */
export interface ConstantBacking {
  kind: 'constant';
  /** The module that exports the constant, and the export's name. */
  module: string;
  name: string;
  /** Matched against the entry's value. Its first group is the pixel count the constant mirrors. */
  pixels: RegExp;
  /** How many times that count goes into the constant: 2 for a padding counted top and bottom. */
  times: number;
}

/** One line of a test or a source file pins or mirrors the thing. The test reads the file and finds the line. */
export interface SourceBacking {
  kind: 'source';
  file: string;
  /** Where the line stood at the freeze. A reader's aid: the test finds the line by `pattern`, not by number. */
  line: number;
  /** Matches exactly one place in `file`. */
  pattern: RegExp;
}

/**
 * One declaration the sweep leaves as it is.
 *
 * The unit is the declaration: every literal in `value` counts 0, the part no
 * test pins included. The entry names a declaration of a top-level rule, by
 * its whole selector. A value that changes makes the entry stale, and a stale
 * entry fails the test.
 */
export interface PinnedDeclaration {
  file: string;
  selector: string;
  property: string;
  value: string;
  reason: string;
  backing: ConstantBacking | SourceBacking;
}

const PLANNER_CSS = 'web/src/components/planner/PlannerWeek.module.css';
const PLANNER_ROWS = 'web/src/lib/planner-rows.ts';
const TIMELINE_CSS = 'web/src/components/course/CourseTimeline.module.css';
const TIMELINE_TEST = 'web/test/course-timeline-css.test.ts';

/** One number of pixels, alone: `24px`. */
const ONE_LENGTH = /^(\d+)px$/;
/** A two-value padding, `3px 5px`: the first is top and bottom. */
const BLOCK_AXIS_OF_TWO = /^(\d+)px \d+px$/;

/** The line of the timeline test that holds both lane floors at 240px or more. */
const LANE_FLOORS_CASE: SourceBacking = {
  kind: 'source',
  file: TIMELINE_TEST,
  line: 41,
  pattern: /^ {2}it\.each\(\['\.weekRow', '\.laneHead'\]\)\('%s gives both lanes an equal 1fr share with a 240px floor'/m,
};

const LANE_TRACKS = '72px minmax(240px, 1fr) minmax(240px, 1fr)';
const LANE_REASON =
  'The Stream timeline gives both lanes a 240px floor. course-timeline-css.test.ts lines 36 to 45 read the ' +
  'floors out of this value as literal px. The 72px label track rides with the declaration.';

export const PINNED_DECLARATIONS: readonly PinnedDeclaration[] = [
  {
    file: PLANNER_CSS,
    selector: '.board',
    property: '--planner-slot',
    value: '24px',
    reason: 'The base row height. planner-rows.ts builds the row table from PLANNER_BASE_SLOT_PX, in pixels.',
    backing: { kind: 'constant', module: PLANNER_ROWS, name: 'PLANNER_BASE_SLOT_PX', pixels: ONE_LENGTH, times: 1 },
  },
  {
    file: PLANNER_CSS,
    selector: '.block',
    property: 'line-height',
    value: '14px',
    reason:
      'One line of text in a block. planner-rows.ts counts whole lines of PLANNER_BLOCK_LINE_PX, and ' +
      'planner-css.test.ts line 128 pins the same 14px.',
    backing: { kind: 'constant', module: PLANNER_ROWS, name: 'PLANNER_BLOCK_LINE_PX', pixels: ONE_LENGTH, times: 1 },
  },
  {
    file: PLANNER_CSS,
    selector: '.block',
    property: 'padding',
    value: '3px 5px',
    reason:
      'The 3px, top and bottom, is PLANNER_BLOCK_PADDING_PX: what a block subtracts before it counts lines. ' +
      'The 5px rides with the declaration.',
    backing: {
      kind: 'constant',
      module: PLANNER_ROWS,
      name: 'PLANNER_BLOCK_PADDING_PX',
      pixels: BLOCK_AXIS_OF_TWO,
      times: 2,
    },
  },
  {
    file: PLANNER_CSS,
    selector: '.chip',
    property: 'padding',
    value: '3px 5px',
    reason:
      "A band chip repeats the block's box (the stylesheet's own comment above .chip). No test pins it and no " +
      "constant mirrors it. Ruling F-5 keeps it: it is held equal to .block's padding in the same file.",
    backing: { kind: 'source', file: PLANNER_CSS, line: 312, pattern: /^\.block \{[^}]*?padding:\s*3px 5px;/m },
  },
  {
    file: 'web/src/components/tracker/StatusSelect.module.css',
    selector: '.statusSelect',
    property: 'padding',
    value: '3px 6px',
    reason:
      'The 3px, top and bottom, is in the private STATUS_SELECT_PX, which sizes a nested chip. No export is ' +
      'added to planner-rows.ts. The 6px rides with the declaration.',
    backing: {
      kind: 'source',
      file: PLANNER_ROWS,
      line: 75,
      pattern: /^const STATUS_SELECT_PX = PLANNER_BLOCK_LINE_PX \+ 2 \* 3 \+ 2 \* 1;$/m,
    },
  },
  {
    file: 'web/src/components/tracker/UpcomingTracker.module.css',
    selector: '.barArea',
    property: 'height',
    value: '120px',
    reason: "The tracker's bar area. The private BAR_AREA_PX scales every segment into this height.",
    backing: {
      kind: 'source',
      file: 'web/src/components/tracker/UpcomingTracker.tsx',
      line: 118,
      pattern: /^const BAR_AREA_PX = 120;$/m,
    },
  },
  {
    file: TIMELINE_CSS,
    selector: '.laneHead',
    property: 'grid-template-columns',
    value: LANE_TRACKS,
    reason: LANE_REASON,
    backing: LANE_FLOORS_CASE,
  },
  {
    file: TIMELINE_CSS,
    selector: '.weekRow',
    property: 'grid-template-columns',
    value: LANE_TRACKS,
    reason: LANE_REASON,
    backing: LANE_FLOORS_CASE,
  },
  {
    file: TIMELINE_CSS,
    selector: '.asgRow',
    property: 'grid-template-columns',
    value: '32px minmax(0, 1fr) minmax(7.5rem, 9rem)',
    reason:
      'An assignment card: a 32px glyph track, a 1fr body, a bounded status column. ' +
      'course-timeline-css.test.ts line 66 matches the value as literal px and rem.',
    backing: {
      kind: 'source',
      file: TIMELINE_TEST,
      line: 66,
      pattern: /^ {4}expect\(columns\(body\)\)\.toMatch\(\/\^32px\\s\+minmax/m,
    },
  },
];

/* ---------------------------------------------------------------------------
 * A4: the theme's page backgrounds, as a rule
 * ------------------------------------------------------------------------ */

/**
 * `THEME_BG` and `THEME_COLOR` in `theme-preference.ts` repeat the two
 * `--color-bg` values, because a `<meta name="theme-color">` cannot read a
 * custom property.
 *
 * A rule, not values: in `file`, a hex string equal to `token` in one of
 * `blocks` of the `tokens` stylesheet counts 0. The values are read from the
 * stylesheet when the test runs. So this file does not change when the light
 * block (task 8) and `theme-preference.ts` (task 9) arrive, and the rule
 * holds while neither exists.
 */
export const THEME_BACKGROUNDS = {
  file: 'web/src/lib/theme-preference.ts',
  tokens: 'web/src/app/globals.css',
  blocks: [':root', ":root[data-theme='light']"],
  token: '--color-bg',
} as const;

/* ---------------------------------------------------------------------------
 * A5: inline style keys a pre-existing test asserts on
 * ------------------------------------------------------------------------ */

/** One TSX inline style key that counts 0 in one file, with the test line that reads it back. */
export interface PinnedStyleKey {
  file: string;
  key: string;
  reason: string;
  backing: SourceBacking;
}

export const INLINE_STYLE_KEYS: readonly PinnedStyleKey[] = [
  {
    file: 'web/src/components/planner/PlannerWeek.tsx',
    key: 'height',
    reason:
      'The placeholder drawn before hydration holds the board height open. The test reads it back as the ' +
      "element's inline height.",
    backing: {
      kind: 'source',
      file: 'web/test/PlannerWeek.hydration.test.tsx',
      line: 112,
      pattern: /expect\(\(reserve as HTMLElement\)\.style\.height\)\.toBe\(/,
    },
  },
  {
    file: 'web/src/app/(app)/course/[id]/classwork/CourseClasswork.tsx',
    key: 'marginLeft',
    reason: "The Classwork tree indents by depth. The test reads each node's inline margin back.",
    backing: {
      kind: 'source',
      file: 'web/test/CourseClasswork.test.tsx',
      line: 71,
      pattern: /\(el\) => el\.style\.marginLeft,/,
    },
  },
];
