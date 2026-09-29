-- bb2dash :: scripts/fixtures/db-test/fails.sql
-- Fixture for scripts/db-test.mjs (Phase 15, task 6). The shape of a unit that fails: it raises
-- the repo's `FAIL ...` exception, so the runner prints one FAIL line and exits 1. It never
-- reaches its `: PASS` row, and the transaction it opened is rolled back by the runner.

begin;

do $$
begin
  raise exception 'FAIL this fixture always fails, on purpose';
end $$;

select 'fails: PASS' as result;

rollback;
