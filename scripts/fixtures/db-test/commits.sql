-- bb2dash :: scripts/fixtures/db-test/commits.sql
-- Fixture for scripts/db-test.mjs (Phase 15, task 6). A file that would leave its writes behind:
-- its last statement is `commit`, not `rollback`. The runner's lint refuses it before it opens a
-- client, prints `db-test: lint commits.sql: ...` and exits 2. It never reaches prod.

begin;

select 'commits: PASS' as result;

commit;
