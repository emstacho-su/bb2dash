# Phase 13 — Styling pass

Date: 2026-09-14 (brief); PM session TBD. Product manager: Stack. Requirement: R-21 from
`60_REQUIREMENTS_v2.md`. Phase branch `feat/styling-13`, one PR. **Last phase**: starts only
when every screen in Requirements v2 exists and is signed off. No migrations.

## Why

Every screen so far wears the Nocturne placeholder tokens so that layout could be judged
without arguing about colour. Once the product is functionally complete, one pass replaces the
placeholder with a signed-off system, applied through CSS custom properties only.

## Stack's decisions (2026-09-14, `70_MVP_INDEX.md` §1.8)

* Visual direction: **decided later, after functionality is achieved.** No direction work in
  PR #11; the phase PM session proposes directions when the phase starts.
* Definition of done: **every screen on tokens, light + dark, Stack approves each** — no
  hard-coded colours or sizes outside `globals.css`; both themes render; a per-screen preview
  checklist he ticks.

## MVP (in Stack's words)

Every screen looks like one product in the direction I picked, in light and dark, and I have
walked each one on the preview and said yes.

## Contract — to be frozen by the phase PM session before workers spawn

Must specify, once the direction is chosen:

* The token set in `web/src/app/globals.css` (colour, type scale, spacing, radius, elevation,
  both themes via `prefers-color-scheme` and an explicit toggle) and the `tokens.module.css`
  primitives that change.
* The screen inventory (every route and shared component) with an owner per worker.
* The lint rule or script that fails the build on a hard-coded colour/size outside the token
  files.
* The per-screen checklist Stack ticks (light + dark screenshot pair per screen).

## Definition of done

Fixed now (no research needed):

- [ ] SOP gates: typecheck, build, tests green in `web/`; `/code-review main high`;
      `/security-review`; STATUS, DECISIONS, ORCHESTRATOR updated; PR open.
- [ ] A token audit script reports **zero** hard-coded colour or size values in
      `web/src/**/*.module.css` and `*.tsx` outside `globals.css` / `tokens.module.css`.
- [ ] Both themes render every route without a fallback colour (checked by the audit's
      "undefined custom property" pass).
- [ ] Vercel preview; Stack's acceptance script = the per-screen checklist, one line per route
      × theme, all ticked.
- [ ] No layout, copy, or behaviour change: the screen tests from earlier phases pass unchanged.

## Task loops

Fixed now:

| # | task | executable check | demo line | owner |
|---|---|---|---|---|
| 1 | Screen inventory + token audit script | script runs in CI and lists every offending file (initially non-zero) | — | PM |
| 2 | Direction proposals (three, on a design canvas) | canvas published; Stack picks one | "I picked …" | PM + Stack |
| 3 | Token set for the chosen direction, both themes | audit passes on `globals.css`; contrast ≥ WCAG AA measured by script | tokens page renders both themes | W-25 |
| 4..N | One loop per route: apply tokens, remove hard-codes | audit reports zero for that route; screen tests pass | Stack ticks light + dark for the route | W-25 / W-26 |
| N+1 | Shared components (shell, popouts, tracker) | audit zero; tests pass | ticked across the routes that use them | W-26 |
| N+2 | Final audit + preview | audit zero repo-wide; all checklist lines ticked | — | PM |

## Out of scope

New screens, behaviour changes, Tailwind or any UI framework, new dependencies.
