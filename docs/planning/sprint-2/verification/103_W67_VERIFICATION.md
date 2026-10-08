# 103 · W-67 verification (foundation), tasks 1 and 2

Phase 22, brief `docs/planning/sprint-2/briefs/103_PHASE22_styling.md`. Worker W-67, branch
`feat/styling-22-foundation`, worktree `bb2dash-wt-22-foundation`, cut from `feat/styling-22` at c42924f.
Written 2026-10-08. This file covers task 1 (the token audit ratchet). Task 2 (the frozen allowlist) is
added by the next commits.

No file under `web/src` was touched. Nothing under `project-state/` was touched. The brief was not edited.

## Task 1: the token audit ratchet (P-15)

Files: `web/test/token-audit.scan.ts` (the scanner), `web/test/token-audit.test.ts` (the test, the cluster
map, the ratchet) and the four baselines under `web/test/token-audit.baseline/`.

### RED, then GREEN

Each command was run by itself from `web/`, and its exit code read from the shell.

| Step | Command | Exit | Result |
|---|---|---|---|
| RED 1: the fixture cases against a scanner that finds nothing, baselines `{}` | `npx vitest run test/token-audit.test.ts` | 1 | 35 failed, 33 passed (68) |
| RED 2: the scanner written, baselines still `{}` | `npx vitest run test/token-audit.test.ts` | 1 | 4 failed, 64 passed (68) |
| GREEN: the four baselines written from the tree | `npx vitest run test/token-audit.test.ts` | 0 | 68 passed (68) |
| The first whole suite | `npm test` | 0 | 2981 passed (2981), 0 failed |
| Types | `npm run typecheck` | 0 | no output |
| Lint | `npx eslint . --max-warnings 0` | 0 | no output |

RED 1's 35 failures are the 30 "what counts" fixtures, the line-and-literal case and four of the unresolved
cases. Every "counts 0" fixture passes against an empty scanner, which is why those cases alone prove nothing
and the "what counts" table sits beside them. RED 2's four failures are the four ratchet cases: every file with
a literal was above a baseline of 0.

2981 is `main`'s 2913 plus the 68 new cases.

### The fixture cases the task row lists

All pass. Counts 1: `#fff`, `rgba(0,0,0,.5)`, `color-mix(in srgb, var(--a) 10%, transparent)`, `white`,
`padding: 13px`, `style={{ padding: 0 }}`, `const s = { padding: 0 }` with `style={s}`, `style={pick()}`.
Counts 2: `minmax(14rem, 18rem)`. Counts 0: `var(--color-text)`, `transparent`, `currentColor`, `/* #fff */`,
`style={{ '--x': v }}`, `style={{ ['--x' as string]: v }}`, `const s = { ['--x' as string]: v }` with
`style={s}`, a `.ts` JSDoc comment holding `var(--slot) * 24px` (0 counts and 0 unresolved), and
`box.style.height = 'auto'`. The test's header says imperative style writes are outside the audit's scope.
A fixture `var(--nope)` is unresolved once. The live tree has 0 unresolved references.

The test adds 21 more "counts" fixtures and 12 more "counts 0" fixtures of its own (a literal in a keyframe, a
hex inside a CSS string, a class name that is also a colour name, an apostrophe in JSX text before a `style=`,
a comment inside a JSX tag, and so on).

### The scanner checked against two outside sources

Neither check is committed. Both were run from a scratch folder outside the repository.

* **Against the TypeScript parser.** The hand-rolled lexer was compared with `typescript` 5.9.3's own parse
  of every `.ts` and `.tsx` file under `web/src`, `web/test`, `web/e2e`, `desktop/src`, `desktop/test`,
  `mcp-server`, `sync` and `apply`: 547 files. Every string literal and template literal matched in position
  and text (34,385 literals, 0 files differ), and so did every JSX `style=` attribute (25). The scanner itself
  imports nothing.
* **Against the freeze audit (103a §6).** With nothing let through, the scanner gives the audit's own
  numbers: 444 px declarations holding 506 literals in 35 of 46 non-token modules; 198 declarations holding
  only 1px or 2px; 55 font-size declarations; 27 signed 1px or 2px literals; 6 `rem` literals in 3 modules;
  27 `color-mix()` in 9 modules plus `tokens.module.css`; 25 `style=` sites in 13 TSX files, 11 of them with
  custom properties only; 17 `@media` width queries over eight values and one `@container` at 600px; 1,659
  `var()` references outside comments (1,652 in CSS, 7 in TSX), 0 unresolved.

### Baselines as written at task 1

1px and 2px count 0 at this step (A2's rule, held as a constant in the test until task 2 freezes it in the
allowlist file). A3 and A5 are not applied yet. These are the numbers the task row's estimates describe
(foundation about 35, screens-a about 116, screens-b about 82): the real numbers are the same.

| Cluster | Files in the cluster | Files with a count | Sum | colour | color-mix | size | style key |
|---|---|---|---|---|---|---|---|
| foundation | 90 | 4 | 35 | 1 | 5 | 22 | 7 |
| shell | 31 | 12 | 123 | 1 | 4 | 114 | 4 |
| screens-a | 46 | 17 | 116 | 0 | 15 | 95 | 6 |
| screens-b | 66 | 11 | 82 | 0 | 3 | 78 | 1 |
| all four | 233 | 44 | 356 | 2 | 27 | 309 | 18 |

The brief's "Baseline sum" command with `F=/\.json$/` prints 356. `web/src/app/layout.tsx` counts 1, its
`'#161826'`. The 233 files are every `.css`, `.ts` and `.tsx` file under `web/src`; `globals.css` is one of
foundation's 90 and is never counted. Unresolved references: 0.
