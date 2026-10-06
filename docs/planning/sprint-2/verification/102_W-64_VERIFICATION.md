# Phase 21 · W-64 (runner stream) · verification

Brief: `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md` (frozen 2026-10-05).
Branch `feat/workspace-21-runner`, worktree `bb2dash-wt-21-runner`. Tasks 7, 10, 8, 9, 11, worked in
that order. Every command below is run from `workspace/` unless a line says otherwise. Host: Windows 11,
Git Bash, Node v24.19.0, npm 11.17.0; the package's `engines` floor is Node 22 (the image's base).

One section per task: the red run (the named test committed failing, before its code) and the green
run, each with its command and last lines.

## Task 7 · package scaffold, router and tier map (P-83)

Files: `workspace/package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.test.json`,
`vitest.config.ts`, `README.md`, `src/router.ts`, `src/tiers.ts`, `test/router.test.ts`,
`test/fixtures/router-cases.json`.

`tsconfig.test.json` is one file more than the brief's Files table lists. It is the `mcp-server/`
pattern: `tsconfig.json` is the build (`src/` only, emitted to `dist/`, the one config the image
copies), and `tsconfig.test.json` extends it for `npm run typecheck` over `src/`, `test/` and
`vitest.config.ts` with no emit.

### Red

Commit: the scaffold, the fixture and the test, with no `src/router.ts` or `src/tiers.ts`.

```
$ npx vitest run test/router.test.ts
 FAIL  test/router.test.ts [ test/router.test.ts ]
Error: Cannot find module '../src/router.js' imported from C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/test/router.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```
