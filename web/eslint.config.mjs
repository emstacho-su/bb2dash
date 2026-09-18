/**
 * ESLint flat config for the web app.
 *
 * Next 16 removed `next lint` (and the `eslint` key in next.config) in favour of
 * the ESLint CLI, so `npm run lint` is now `eslint` over this file, which is
 * what `eslint-config-next` documents for that version. `core-web-vitals` is
 * the stricter of the two Next presets: it promotes the Core Web Vitals rules
 * from warnings to errors, which is what a lint run should do if it is to mean
 * anything in CI.
 *
 * ESLint is pinned to 9.x, not 10.x: `eslint-config-next@16.3.4` bundles an
 * `eslint-plugin-react` that throws on ESLint 10
 * (`contextOrFilename.getFilename is not a function`, in the react version
 * detector) before it lints a single file. Its own peer range says
 * `eslint >= 9.0.0`; 10 does not work in practice. Revisit when
 * `eslint-config-next` ships a plugin set that runs on 10.
 *
 * Ignores. `eslint-config-next` already ignores `.next/`, `out/`, `build/` and
 * `next-env.d.ts`; declaring ignores here REPLACES that default list rather
 * than adding to it, so they are repeated. `coverage/` and `node_modules/` are
 * ours: generated output nobody edits.
 */

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    // eslint-config-next's own defaults, restated because this replaces them.
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Ours.
    'node_modules/**',
    'coverage/**',
  ]),
  {
    name: 'bb2dash/react-compiler-rules-are-advisory-for-now',
    /**
     * The two React Compiler rules that ship with eslint-config-next 16 report
     * 24 errors against this tree, and every one of them is a deliberate,
     * commented pattern rather than a defect. They stay ON, as warnings, so the
     * findings are in front of whoever reads the output, but they do not fail a
     * run that has no defect in it. Phase 12b is a bug pass, not the place to
     * restructure the shell; a phase that takes them on flips these back to
     * 'error' and clears them with Stack watching the screens.
     *
     * `react-hooks/refs` (18) - all three call sites of `usePopover()`
     * (`Bell.tsx`, `TopNav.tsx`, `ActivityMenu.tsx`). The hook returns
     * `{ open, setOpen, toggle, close, ref }`, so the rule treats every read of
     * that object during render as reading a ref. Not one of the flagged lines
     * touches `.current`: they read `open`, or pass `toggle` / `close` to an
     * event handler, or hand `ref` to JSX, which is what refs are for. Clearing
     * it honestly means changing the hook's shape, which is a refactor of three
     * live menus.
     *
     * `react-hooks/set-state-in-effect` (6) - `SidebarProvider`, `CourseInfo`,
     * `MaterialsBrowser`, `ActivityMenu`, `CommandPalette` and
     * `useUnreadSnapshot`. Each is a mount effect that adopts browser-only
     * state (a stored preference, a viewport width, an open-time snapshot)
     * after hydration, which is the pattern that keeps the server and client
     * renders identical. Removing the setState would reintroduce the hydration
     * mismatch the surrounding comments say it exists to avoid.
     */
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
