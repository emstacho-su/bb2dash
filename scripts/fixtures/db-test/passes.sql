-- bb2dash :: scripts/fixtures/db-test/passes.sql
-- Fixture for scripts/db-test.mjs (Phase 15, task 6). The shape of a unit that passes:
-- it opens its own transaction, asserts nothing about prod, ends with one `: PASS` row, and
-- rolls back. Run it with `node scripts/db-test.mjs --file scripts/fixtures/db-test/passes.sql`.

begin;

do $$
begin
  if 1 <> 1 then
    raise exception 'FAIL arithmetic is broken';
  end if;
end $$;

select 'passes: PASS' as result, 1 as checks;

rollback;
