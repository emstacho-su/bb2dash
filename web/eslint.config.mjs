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
    name: 'bb2dash/react-compiler-rules-enforced',
    /**
     * The two React Compiler rules that ship with eslint-config-next 16, at
     * 'error' since Phase 17 (R-51). Phase 12b left them as warnings over 24
     * findings; Phase 17 cleared every site instead of excusing it:
     *
     * `react-hooks/refs` - `usePopover()` hands back a callback ref
     * (`anchor`) instead of a ref object, so reading `open` during render is
     * no longer a ref read (`Bell`, `TopNav`, `ActivityMenu`), and `TopNav`
     * destructures the sidebar context rather than reading `toggleRef` off it.
     *
     * `react-hooks/set-state-in-effect` - browser-only state (a stored
     * preference, the viewport, the seen mark) is read through
     * `useSyncExternalStore` with the server value as the server snapshot
     * (the DECISIONS 2026-09-16 hydration pattern), and state that follows a
     * prop is derived during render, not copied in an effect.
     */
    rules: {
      'react-hooks/refs': 'error',
      'react-hooks/set-state-in-effect': 'error',
    },
  },
]);
