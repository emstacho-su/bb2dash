# bb2dash — web

Next.js App Router front end for bb2dash. Reads the Supabase project
`goultdzqcavefcgnifdy` directly from the browser; RLS is the security boundary.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, TypeScript) | hosted on Vercel; server components give a real auth guard |
| Styling | CSS Modules + CSS custom properties | **no Tailwind, no UI framework** (`project-state/DECISIONS.md`) |
| Data | `@supabase/supabase-js` v2 via `@supabase/ssr` | cookie sessions, so the proxy guard and RSCs see the same session |
| Cache | TanStack Query v5 + `persistQueryClient` (localStorage) | warm cache on every tab open, then revalidate |
| Auth | Supabase Auth, email + password | one user, **no signup UI anywhere** |

## Run it locally

```bash
cd web
npm install
cp .env.example .env.local     # then fill in the anon key
npm run dev                    # http://localhost:3000
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | dev server on http://localhost:3000 |
| `npm run build` | production build (also type-checks) |
| `npm start` | serve the production build |
| `npm run lint` | Next's ESLint pass |
| `npm run typecheck` | `tsc --noEmit` over the app and the tests |
| `npm test` | vitest, one run |
| `npm run test:watch` | vitest in watch mode |
| `npm run test:coverage` | vitest with a v8 coverage report |

## Testing

vitest + Testing Library (jsdom). Tests live in `web/test/`; `vitest.config.mts`
carries the `@/` alias so they resolve the same modules the app does.

Nothing in the suite touches the network. `fetch` is stubbed per test and
`@/lib/supabase/client` is mocked, so the suite passes with no Supabase project,
no keys and no session — which also means it can run in a sandboxed agent
session that cannot reach `*.supabase.co`.

What is covered today is the retrieval contract in `src/lib/queries.search.ts`
— request body shape (including `include_superseded`, sent only when true),
query keys, the `enabled` gate, error handling, snippet scrubbing, the 0.80
keyword-match boundary and the part hint — plus the palette's `ResultRow`
rendering in `test/CommandPalette.test.tsx`.

`test:coverage` is scoped to `queries.search.ts` (currently ~98% statements,
100% branches). The palette shell, the screens and the other query modules have
no tests yet; widen `coverage.include` in `vitest.config.mts` as they gain some,
rather than reporting a whole-app number that means nothing.

## Environment variables

Both are public by design — they ship in the browser bundle, and RLS decides
what the key can actually read. **The service-role key must never appear here.**

| Var | Value | Where it is needed |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://goultdzqcavefcgnifdy.supabase.co` | `.env.local` locally; Vercel project settings when deployed |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's **legacy anon JWT** (`eyJ…`) | same |

Use the legacy anon JWT rather than the `sb_publishable_…` key: the `search`
edge function runs with `verify_jwt` on and only accepts the JWT form
(see `CLAUDE.md`).

If either var is missing the app does not crash — the login page renders with a
notice saying the deployment is unconfigured.

> Sandboxed agent sessions cannot reach `*.supabase.co` (org egress policy). The
> app builds and the login page renders without a live backend; sign-in only
> works from a browser that can reach Supabase, i.e. locally or on Vercel.

## Layout of the code

```
src/
  app/
    layout.tsx              root layout; mounts QueryProvider
    globals.css             Nocturne design tokens as CSS custom properties
    login/                  email + password sign-in (the only public route)
    (app)/                  everything behind auth
      layout.tsx            server-side auth guard + top bar + ⌘K mount
      page.tsx              / — Today            (screen: W-5)
      planner/              /planner             (spec T-17, unassigned)
      grades/               /grades              (blocked on real gradebook data)
      materials/            /materials           (screen: W-7)
      course/[id]/          /course/IST.323      (screen: W-6)
  components/shell/         TopNav, courses pop-down, user menu, CommandPalette
  lib/
    queries.ts              the typed query layer — extend this, not components
    query-provider.tsx      TanStack Query client + localStorage persistence
    supabase/
      client.ts             browser client (singleton)
      server.ts             RSC / route-handler client + getCurrentUser()
      proxy-session.ts      cookie refresh + the redirect-to-/login guard
      database.types.ts     generated; regenerate after every migration
  styles/tokens.module.css  the `composes:` primitives feature modules build on
  proxy.ts                  Next 16's middleware convention; runs the guard
test/
  setup.ts                  jest-dom matchers + DOM cleanup between tests
  factories.ts              search fixtures (no network, no live backend)
  *.test.ts(x)              the suites `npm test` runs
```

## Conventions worth keeping

**Styling.** `globals.css` owns the tokens; `src/styles/tokens.module.css` owns
the reusable primitives (`card`, `tag*`, `btn*`, `input`, `rule`, `glyph*`). A
feature module pulls them in with `composes` and never writes a raw colour,
radius or spacing value:

```css
/* Thing.module.css */
.panel {
  composes: card from '@/styles/tokens.module.css';
  gap: var(--space-4);
}
```

The Nocturne skin is a **placeholder** — the artboards are the layout and
interaction spec, the colours and type are provisional until Stack signs off a
styling pass. Because everything is a custom property, that pass is a token
swap rather than a component rewrite.

**Data.** No component calls `supabase.from(...)`. Add the query to
`src/lib/queries.ts`: a key in `queryKeys`, an `xOptions()` returning
`queryOptions({...})`, and a `useX()` hook. Row types come from the generated
`database.types.ts` — never hand-write a shape. Regenerate it with
`mcp__Supabase__generate_typescript_types` after every migration.

**Auth.** One user, no signup. `proxy.ts` redirects unauthenticated requests to
`/login`, and `(app)/layout.tsx` re-checks server-side so a mis-scoped matcher
cannot leak a screen. Sign-out clears the persisted query cache.

**No fabricated numbers.** If data is missing, the UI says so. No placeholder
grades, no sample rows.

## Regenerating the database types

```
mcp__Supabase__generate_typescript_types(project_id="goultdzqcavefcgnifdy")
```

Write the result to `src/lib/supabase/database.types.ts` (keep the header
comment) and run `npm run typecheck`.

## Deployment

Vercel, **preview deployments only** until Stack signs off the visuals — do not
promote to production or attach a domain.

Project settings when the Vercel project is created:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root Directory | `web` (the app is not at the repo root) |
| Env vars (Preview + Production) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Set both env vars before the first deploy. A build without them succeeds, but
every screen behind auth bounces to `/login` and the sign-in page shows the
"deployment is unconfigured" notice.

> **Not yet deployed.** The Vercel connector available to the build agent is
> authorised to read projects and deployments but not to create them — both
> `deploy_to_vercel` and `create_git_project` return
> `403 forbidden: You don't have permission to create a project`. The project
> has to be created once by an account with project-create rights (Vercel team
> `emstacho-sus-projects`, `team_ohEBa3VTUFU4xAf7tHm4VY0e`); after that, deploys
> to the existing project work normally.
