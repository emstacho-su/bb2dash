# Phase 15 — acceptance walk (Stack's seven steps)

Date: 2026-09-__ · Phase 15, brief `docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md` · Branch `feat/db-hygiene-15`
Nothing visual changes in this phase, so there is no Vercel preview walk (brief §Definition of done). The PM fills the
evidence under each step from Stack's own output; a step is ticked only once he has run it himself.

Each step is the brief's acceptance script, verbatim. Steps 2–4 run from `C:/Users/estac/projects/bb2dash-wt-15`,
where the PM has run `npm --prefix scripts ci` and copied the canonical `.env.local`.

- [ ] Step 1 — run the PM's PowerShell snippet once: it generates the password locally, copies the `alter role db_test_runner password '…'` line for the dashboard SQL editor, and writes `C:/Users/estac/projects/bb2dash/.env.local` with the session-pooler DSN. Paste the line into an unsaved editor tab, run it, close the tab.

The snippet as it was put on Stack's clipboard on 2026-09-27 (it holds no secret: the password is generated on his
machine, copied to his clipboard and written only to the gitignored `.env.local`):

```powershell
$ErrorActionPreference = 'Stop'
$poolerHost = 'aws-0-us-east-1.pooler.supabase.com'   # Supabase -> Connect -> Session pooler: use the host shown there
$envPath    = 'C:/Users/estac/projects/bb2dash/.env.local'

$alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'   # 56 chars, no look-alikes
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$buf = New-Object byte[] 1
$pw  = ''
while ($pw.Length -lt 32) {
  $rng.GetBytes($buf)
  if ($buf[0] -lt 224) { $pw += $alphabet[$buf[0] % $alphabet.Length] }   # 224 = 4*56, so no modulo bias
}
$rng.Dispose()

Set-Clipboard -Value "alter role db_test_runner password '$pw';"

$dsn  = "postgresql://db_test_runner.goultdzqcavefcgnifdy:$pw@${poolerHost}:5432/postgres?uselibpqcompat=true&sslmode=require"
$line = "BB2DASH_TEST_DB_URL=$dsn"
if (Test-Path $envPath) {
  $kept = @(Get-Content $envPath | Where-Object { $_ -notmatch '^BB2DASH_TEST_DB_URL=' })
  $out  = @($kept) + $line
} else {
  $out = @($line)
}
[System.IO.File]::WriteAllText($envPath, (($out -join "`r`n") + "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
```

Two things the PM could not pre-verify from this session, both settled on 2026-09-27 by the first `--ping`:

* **the pooler host** — `aws-0-us-east-1.pooler.supabase.com`, the snippet's default, is correct for this project;
* **`sslmode`** — `require` alone **fails on this laptop**, and the snippet above is already corrected. Stack ran
  step 1 as written, the password and the host were both right, and `--ping` still returned
  `db-test: connection failed: self-signed certificate in certificate chain`, exit 2, with pg's own warning above it:
  *"The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full' … If you want libpq
  compatibility now, use 'uselibpqcompat=true&sslmode=require'"*. `pg` 8.23 / pg-connection-string aliases `require` to
  `verify-full`, and the Supabase pooler chains to a private root, so verification fails. Adding
  `uselibpqcompat=true` restores libpq's own `require` semantics — the connection is encrypted, the chain is not
  verified — which is what `psql`'s `require` does and what the brief's research assumed. `--ping` then returned
  `db-test: connected as db_test_runner`, exit 0. The canonical `.env.local` was patched in place, the password
  untouched, and the four worktree copies refreshed from it. DECISIONS row 5 records this.
  The stronger option, `sslmode=verify-full` with `sslrootcert` pointed at Supabase's CA, stays open: it needs the
  cert from the dashboard's Database → SSL configuration panel, since the old public
  `supabase.com/downloads/prod-ca-2021.crt` URL now returns 404. It is offered to Stack in the PR, not taken here.

```
(no output expected in the SQL editor; it reports "Success. No rows returned")
```

- [ ] Step 2 — `node scripts/db-test.mjs --ping` → `db-test: connected as db_test_runner`

```
(paste output here)
```

- [ ] Step 3 — `node scripts/db-test.mjs` → 21 `PASS` lines and `db-test: passed 21, failed 0, units 21`

```
(paste output here)
```

- [ ] Step 4 — `node scripts/db-test.mjs --file scripts/fixtures/db-test/fails.sql` → one `FAIL` line, exit code 1

```
(paste output here)
```

- [ ] Step 5 — Supabase → Advisors. Security: no "Function Search Path Mutable"; the two SECURITY DEFINER lines and the leaked-password line remain. Performance: 15 unindexed foreign keys and 4 unused indexes.

```
(what the advisor listed)
```

- [ ] Step 6 — Supabase → Authentication settings: new-user signups are off. Screenshot saved as `01-auth-signups-off.png` (task 20). Change nothing.

```
(screenshot path once saved)
```

- [ ] Step 7 — read the six DECISIONS rows and say "merge" (or name what is wrong).

```
(Stack's word)
```

## Migration hygiene (task 21, PM)

The repo blob and the applied statements must hash the same for each of 100–102 (and 103, 104 if they were needed).

| migration | `git show HEAD:db/migrations/<file> | md5sum` | `md5(array_to_string(statements, ''))` on prod | match |
|---|---|---|---|
| `100_db_test_runner_role` | _to fill_ | _to fill_ | _to fill_ |
| `101_search_path_pin` | _to fill_ | _to fill_ | _to fill_ |
| `102_planner_series_orphan_trigger` | _to fill_ | _to fill_ | _to fill_ |
