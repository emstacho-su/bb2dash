"""Tests for scripts/v1_recheck.py (Phase 16, brief 96, task 6; P-67, R-31, R-33, P-75).

Run: uv run --with pyyaml --with pytest pytest scripts/test_v1_recheck.py
"""

from __future__ import annotations

import copy
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

import v1_recheck as vr  # noqa: E402

SCRIPTS = Path(__file__).resolve().parent
FIXTURE = SCRIPTS / "fixtures" / "v1_verdict_fixture.md"


# --- helpers ---------------------------------------------------------------------------------


def fixture_entries() -> list[dict]:
    return vr.parse_machine_block(FIXTURE.read_text(encoding="utf-8"), str(FIXTURE))


def entry(**overrides) -> dict:
    """A valid `matches` / keep entry on one grade_components row; overrides replace fields."""
    base = {
        "id": "TST.100-01",
        "target": {"table": "grade_components", "key": {"course_id": "TST.100", "code": "exams"}, "field": "points"},
        "stored": 10,
        "materials": 10,
        "citation": "bb_file:5#unit:3",
        "quote": "Exams 10 pts",
        "verdict": "matches",
        "call": "keep",
        "value": 10,
        "reason_code": "SYLLABUS_AUTHORITATIVE",
        "why": "syllabus",
        "decided_by": "stack",
        "decided_on": "2026-09-30",
        "confidence_after": "confirmed",
        "recheck": "select points from grade_components where course_id = 'TST.100' and code = 'exams'",
    }
    base.update(overrides)
    return base


def link_entry(**overrides) -> dict:
    fields = {
        "target": {"table": "grade_column_links", "key": {"course_id": "TST.100", "column_id": "_1_1"}, "field": "excluded"},
        "stored": True,
        "value": True,
        "recheck": "select excluded from grade_column_links where course_id = 'TST.100' and column_id = '_1_1'",
    }
    fields.update(overrides)
    return entry(**fields)


def verdict_file(tmp_path: Path, entries: list[dict], name: str = "96b_GRADING_VALIDATION_TST.100.md") -> Path:
    body = yaml.safe_dump(entries, sort_keys=False, allow_unicode=True)
    path = tmp_path / name
    path.write_text(f"# verdict\n\n## Machine block\n\n```yaml\n{body}```\n", encoding="utf-8")
    return path


def errors_of(entries: list[dict]) -> list[str]:
    return vr.check_entries(entries).errors


# --- parsing and --check ---------------------------------------------------------------------


def test_fixture_passes_check(capsys):
    assert vr.main(["--check", str(FIXTURE)]) == 0
    out = capsys.readouterr().out
    assert "rows: 7, errors: 0, differs without call: 0" in out


def test_missing_machine_block_is_an_error(tmp_path, capsys):
    path = tmp_path / "x.md"
    path.write_text("# nothing here\n", encoding="utf-8")
    assert vr.main(["--check", str(path)]) != 0
    assert "Machine block" in capsys.readouterr().out


def test_unparseable_yaml_is_an_error(tmp_path, capsys):
    path = tmp_path / "x.md"
    path.write_text("## Machine block\n\n```yaml\n- id: [unclosed\n```\n", encoding="utf-8")
    assert vr.main(["--check", str(path)]) != 0


def test_yaml_tags_are_not_executed(tmp_path, capsys):
    path = tmp_path / "x.md"
    path.write_text("## Machine block\n\n```yaml\n- !!python/object/apply:os.system ['echo hi']\n```\n", encoding="utf-8")
    assert vr.main(["--check", str(path)]) != 0


def test_duplicate_ids_rejected():
    assert any("duplicate id" in e for e in errors_of([entry(), entry()]))


def test_duplicate_ids_across_files_rejected(tmp_path, capsys):
    a = verdict_file(tmp_path, [entry()], "a.md")
    b = verdict_file(tmp_path, [entry()], "b.md")
    assert vr.main(["--check", str(a), str(b)]) != 0
    assert "duplicate id" in capsys.readouterr().out


@pytest.mark.parametrize("bad", ["TST.100-1x", "tst.100-01", "TST.100", "x; drop"])
def test_bad_id_rejected(bad):
    assert any("id" in e for e in errors_of([entry(id=bad)]))


@pytest.mark.parametrize(
    "field,value",
    [
        ("verdict", "sort_of"),
        ("call", "delete_it"),
        ("reason_code", "BECAUSE"),
        ("confidence_after", "certain"),
    ],
)
def test_enums_are_closed(field, value):
    assert errors_of([entry(**{field: value})])


def test_unknown_table_rejected():
    bad = entry(target={"table": "courses", "key": {"id": "TST.100"}, "field": "notes"})
    assert any("table" in e for e in errors_of([bad]))


def test_wrong_key_columns_rejected():
    bad = entry(target={"table": "grade_components", "key": {"course_id": "TST.100"}, "field": "points"})
    assert any("key" in e for e in errors_of([bad]))


def test_scalar_key_accepted_for_single_column_tables():
    ok = entry(target={"table": "assignments", "key": "TST.100/a1", "field": "points_possible"})
    assert errors_of([ok]) == []


@pytest.mark.parametrize(
    "citation",
    [
        {"bb_file": 5, "unit": 3},  # research 75's mapping dialect
        "bb_file 5 unit 3",
        "bb_file:5 #unit:3",
        "bb_file:5#page:3",
        "file:5#unit:3",
        "bb_file:5#unit:3 extra",
    ],
)
def test_second_citation_dialect_rejected(citation):
    assert any("citation" in e for e in errors_of([entry(citation=citation)]))


def test_missing_citation_rejected_unless_not_in_materials_or_override():
    no_cite = entry()
    del no_cite["citation"]
    assert any("citation" in e for e in errors_of([no_cite]))

    nim = entry(verdict="not_in_materials", reason_code="NOT_IN_MATERIALS", confidence_after="tentative", call="ask_professor")
    del nim["citation"]
    assert errors_of([nim]) == []

    override = entry(verdict="differs", call="change_to", value=11, reason_code="STACK_OVERRIDE", citation="STACK_OVERRIDE")
    assert errors_of([override]) == []


def test_bb_file_citation_needs_a_quote():
    no_quote = entry()
    del no_quote["quote"]
    assert any("quote" in e for e in errors_of([no_quote]))


def test_differs_without_call_rejected_and_counted(tmp_path, capsys):
    bad = entry(verdict="differs")
    del bad["call"]
    path = verdict_file(tmp_path, [bad])
    assert vr.main(["--check", str(path)]) != 0
    assert "differs without call: 1" in capsys.readouterr().out


@pytest.mark.parametrize("missing", ["call", "reason_code", "why", "decided_on"])
def test_non_matches_row_needs_its_fields(missing):
    row = entry(verdict="materials_say_more")
    del row[missing]
    assert errors_of([row])


def test_bad_decided_on_rejected():
    assert errors_of([entry(decided_on="yesterday")])


def test_change_to_needs_value_and_recheck():
    no_value = entry(verdict="differs", call="change_to")
    del no_value["value"]
    assert any("value" in e for e in errors_of([no_value]))
    no_recheck = entry()
    del no_recheck["recheck"]
    assert any("recheck" in e for e in errors_of([no_recheck]))


# --- the recheck guard ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "word",
    ["insert", "update", "delete", "drop", "alter", "create", "grant", "revoke", "truncate", "copy", "call", "do"],
)
def test_recheck_with_forbidden_word_rejected(word):
    sql = f"select 1 from grade_components where {word.upper()} is not null"
    assert vr.recheck_error(sql) is not None
    assert any("recheck" in e for e in errors_of([entry(recheck=sql)]))


def test_recheck_holding_update_rejected():
    sql = "select points from grade_components where code = 'x' and exists (select 1 from (update grade_components set points = 0 returning 1) u)"
    assert any("recheck" in e for e in errors_of([entry(recheck=sql)]))


@pytest.mark.parametrize(
    "sql",
    [
        "select 1; select 2",
        "select 1; drop table assignments",
        "update assignments set points_possible = 0",
        "with x as (delete from assignments returning 1) select count(*) from x",
        "select 1 -- comment",
        "select 1 /* comment */",
        "select $x$1$x$",
        "select set_config('role', 'postgres', false)",
        "select pg_read_file('/etc/passwd')",
        "",
        "   ",
        "explain select 1",
    ],
)
def test_recheck_guard_rejects(sql):
    assert vr.recheck_error(sql) is not None


@pytest.mark.parametrize(
    "sql",
    [
        "select points from grade_components where course_id = 'IST.323' and code = 'proposal'",
        "SELECT count(*) FROM assignments WHERE id = 'x';",
        "select updated_at is not null from assignments where id = 'x'",  # 'update' only as a substring
        "with c as (select 1 as v) select v from c",
    ],
)
def test_recheck_guard_accepts_plain_selects(sql):
    assert vr.recheck_error(sql) is None


# --- counting (--summary) ---------------------------------------------------------------------


def test_two_matches_on_one_component_row_give_citation_only_1():
    s = vr.summarize([entry(id="TST.100-01"), entry(id="TST.100-02", target={**entry()["target"], "field": "weight_pct"})])
    assert (s.corrections, s.citation_only, s.left_tentative, s.already_applied) == (0, 1, 0, 0)
    assert s.target_rows == 1


def test_matches_and_change_to_on_one_row_give_correction_1_citation_only_0():
    s = vr.summarize([entry(id="TST.100-01"), entry(id="TST.100-02", verdict="differs", call="change_to", stored=10, value=12)])
    assert (s.corrections, s.citation_only) == (1, 0)


def test_link_row_with_only_matches_is_in_neither_count():
    s = vr.summarize([link_entry(id="TST.100-01"), link_entry(id="TST.100-02")])
    assert (s.corrections, s.citation_only, s.left_tentative, s.already_applied) == (0, 0, 0, 0)
    assert s.target_rows == 1


def test_mark_ungraded_link_already_on_prod_is_already_applied(tmp_path, capsys):
    row = link_entry(verdict="materials_say_more", call="mark_ungraded", reason_code="BOOKKEEPING_COLUMN", stored=True, value=True)
    s = vr.summarize([row])
    assert (s.already_applied, s.corrections, s.citation_only) == (1, 0, 0)
    path = verdict_file(tmp_path, [row])
    assert vr.main(["--summary", str(path)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert "| already applied | 1 |" in lines
    assert "| corrections | 0 |" in lines
    assert "| citation-only | 0 |" in lines
    assert any(line.startswith("already applied: grade_column_links TST.100/_1_1") for line in lines)


def test_already_applied_component_row_falls_to_citation_only():
    row = entry(verdict="differs", call="change_to", stored=12, value="12.00")
    s = vr.summarize([row])
    assert (s.already_applied, s.corrections, s.citation_only) == (1, 0, 1)


def test_tentative_row_is_left_tentative_not_citation_only():
    row = entry(verdict="not_in_materials", call="ask_professor", reason_code="PROF_TO_CONFIRM", confidence_after="tentative")
    s = vr.summarize([row, entry(id="TST.100-02")])
    assert (s.left_tentative, s.citation_only, s.corrections) == (1, 0, 0)


def test_correction_beats_tentative():
    rows = [
        entry(id="TST.100-01", verdict="differs", call="change_to", value=12),
        entry(id="TST.100-02", confidence_after="tentative"),
    ]
    s = vr.summarize(rows)
    assert (s.corrections, s.left_tentative) == (1, 0)


def test_scalar_and_mapping_keys_are_the_same_row():
    a = entry(id="TST.100-01", target={"table": "assignments", "key": "TST.100/a1", "field": "points_possible"})
    b = entry(id="TST.100-02", target={"table": "assignments", "key": {"id": "TST.100/a1"}, "field": "component_id"})
    assert vr.summarize([a, b]).target_rows == 1


def test_fixture_summary_counts(capsys):
    assert vr.main(["--summary", str(FIXTURE)]) == 0
    lines = capsys.readouterr().out.splitlines()
    for expected in [
        "| target rows | 5 |",
        "| machine-block entries | 7 |",
        "| corrections | 1 |",
        "| citation-only | 2 |",
        "| left tentative | 1 |",
        "| already applied | 1 |",
    ]:
        assert expected in lines, expected


def test_summary_compare_passes_when_96d_carries_the_table(tmp_path, capsys):
    vr.main(["--summary", str(FIXTURE)])
    table = [line for line in capsys.readouterr().out.splitlines() if line.startswith("|")]
    summary = tmp_path / "96d.md"
    summary.write_text("# 96d\n\n## Counts\n\n" + "\n".join(table) + "\n", encoding="utf-8")
    assert vr.main(["--summary", str(FIXTURE), "--compare", str(summary)]) == 0


def test_summary_compare_fails_on_a_drifted_count(tmp_path, capsys):
    vr.main(["--summary", str(FIXTURE)])
    out = capsys.readouterr().out
    table = [line for line in out.splitlines() if line.startswith("|")]
    drifted = [line.replace("| corrections | 1 |", "| corrections | 2 |") for line in table]
    summary = tmp_path / "96d.md"
    summary.write_text("\n".join(drifted) + "\n", encoding="utf-8")
    assert vr.main(["--summary", str(FIXTURE), "--compare", str(summary)]) != 0
    assert "| corrections | 1 |" in capsys.readouterr().out


def test_summary_refuses_files_that_fail_check(tmp_path):
    bad = entry(verdict="differs")
    del bad["call"]
    assert vr.main(["--summary", str(verdict_file(tmp_path, [bad]))]) != 0


# --- --emit-sql -------------------------------------------------------------------------------


def emitted(tmp_path: Path, *files: Path) -> str:
    out = tmp_path / "phase16_106_v1_recheck.sql"
    assert vr.main(["--emit-sql", str(out), *map(str, files)]) == 0
    return out.read_text(encoding="utf-8")


def statements(sql: str) -> list[str]:
    body = "\n".join(line for line in sql.splitlines() if not line.startswith("--"))
    return [s.strip() for s in vr.split_top_level(body) if s.strip()]


def test_emit_shape_and_one_block_per_rechecked_entry(tmp_path):
    sql = emitted(tmp_path, FIXTURE)
    stmts = statements(sql)
    assert stmts[0].lower() == "begin"
    assert stmts[-1].lower() == "rollback"
    assert stmts[-2] == "select 'phase16_106_v1_recheck: PASS'"
    assert stmts[-2].endswith(": PASS'")
    blocks = [s for s in stmts if s.lower().startswith("do ")]
    # keep / change_to / mark_ungraded entries: 01, 03, 04, 05, 07 (02 has no call, 06 is ask_professor)
    assert len(blocks) == 5
    # 03 and 04 are two rechecked entries on one target row: two blocks
    assert sum("FIX.101-03" in b for b in blocks) == 1
    assert sum("FIX.101-04" in b for b in blocks) == 1
    assert sum(1 for s in stmts if s.lower() == "rollback") == 1


def test_emit_compares_value_for_change_to_and_stored_for_keep(tmp_path):
    rows = [
        entry(id="TST.100-01", verdict="differs", call="change_to", stored=10, value=12),
        entry(id="TST.100-02", target={**entry()["target"], "field": "weight_pct"}, stored=33, value=99),
    ]
    blocks = [s for s in statements(emitted(tmp_path, verdict_file(tmp_path, rows))) if s.lower().startswith("do ")]
    assert "'12'" in blocks[0] and "'10'" not in blocks[0]
    assert "'33'" in blocks[1] and "'99'" not in blocks[1]
    assert "FAIL" in blocks[0] and "'TST.100-01'" in blocks[0]


def test_emit_is_read_only(tmp_path):
    stmts = statements(emitted(tmp_path, FIXTURE))
    assert stmts[1].lower() == "set transaction read only"


def test_emit_escapes_hostile_values(tmp_path):
    hostile = "x'); commit; drop table assignments; --$$ $q$ $rc$"
    row = entry(verdict="differs", call="change_to", value=hostile, why=hostile, quote=hostile)
    sql = emitted(tmp_path, verdict_file(tmp_path, [row]))
    assert "'x''); commit; drop table assignments; --$$ $q$ $rc$'" in sql
    stmts = statements(sql)
    assert [s.split()[0].lower() for s in stmts] == ["begin", "set", "do", "select", "rollback"]


def test_emit_refuses_files_that_fail_check(tmp_path):
    out = tmp_path / "o.sql"
    bad = entry(recheck="select 1; delete from assignments")
    assert vr.main(["--emit-sql", str(out), str(verdict_file(tmp_path, [bad]))]) != 0
    assert not out.exists()


def test_emit_quotes_json_and_bool_values(tmp_path):
    rows = [
        entry(id="TST.100-01", target={**entry()["target"], "field": "rank_weights"}, stored=[30, 25, 20], value=[30, 25, 20]),
        link_entry(id="TST.100-02"),
        entry(id="TST.100-03", target={**entry()["target"], "field": "notes"}, stored=None, value=None),
    ]
    sql = emitted(tmp_path, verdict_file(tmp_path, rows))
    assert "'[30, 25, 20]'" in sql
    assert "'true'" in sql
    assert "null::text" in sql


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_emitted_file_passes_the_runner_lint(tmp_path):
    out = tmp_path / "phase16_106_v1_recheck.sql"
    hostile = entry(id="TST.100-09", verdict="differs", call="change_to", value="a'; rollback; commit; --")
    rows = fixture_entries() + [hostile]
    path = verdict_file(tmp_path, rows)
    assert vr.main(["--emit-sql", str(out), str(path)]) == 0
    runner = (SCRIPTS / "db-test.mjs").as_posix()
    script = textwrap.dedent(
        f"""
        import('file:///{runner.lstrip('/')}').then((m) => {{
          const fs = require('node:fs');
          const r = m.lintUnitText(fs.readFileSync(process.argv[1], 'utf8'));
          console.log(r === null ? 'LINT OK' : 'LINT ' + r);
        }});
        """
    )
    res = subprocess.run(["node", "-e", script, out.as_posix()], capture_output=True, text=True, timeout=60)
    assert "LINT OK" in res.stdout, res.stdout + res.stderr


def test_usage_errors_exit_2(capsys):
    assert vr.main([]) == 2
    assert vr.main(["--check"]) == 2
    assert vr.main(["--emit-sql"]) == 2
    assert vr.main(["--nope", str(FIXTURE)]) == 2


# --- target.field: a label on a keep entry, a column on a correcting one (PM, 2026-09-29) ------


@pytest.mark.parametrize(
    "label",
    ["component_id / points_possible", "check: top-level weights sum to 100", "item points_possible (quiz-01..05)"],
)
def test_keep_entry_may_name_a_descriptive_field(label):
    ok = entry(target={"table": "grade_components", "key": {"course_id": "TST.100", "code": "exams"}, "field": label})
    assert errors_of([ok]) == []


@pytest.mark.parametrize("call", ["change_to", "mark_ungraded"])
def test_correcting_entry_must_name_one_column(call):
    bad = entry(
        verdict="differs",
        call=call,
        value=12,
        target={"table": "grade_components", "key": {"course_id": "TST.100", "code": "exams"}, "field": "points / weight_pct"},
    )
    assert any("target.field" in e for e in errors_of([bad]))


@pytest.mark.parametrize("label", ["", "a\nb", "x" * 121])
def test_keep_label_is_one_short_line(label):
    bad = entry(target={"table": "grade_components", "key": {"course_id": "TST.100", "code": "exams"}, "field": label})
    assert any("target.field" in e for e in errors_of([bad]))


# --- type-aware comparison in the emitted block (PM, 2026-09-29) ------------------------------
# The recheck returns text; the entry's YAML type picks the comparison, so 13.00 equals 13,
# a YAML null means "is null" and a json value compares as jsonb.


def _only_block(tmp_path, row) -> str:
    stmts = statements(emitted(tmp_path, verdict_file(tmp_path, [row])))
    blocks = [s for s in stmts if s.lower().startswith("do ")]
    assert len(blocks) == 1
    return blocks[0]


def test_emit_null_compares_with_is_null(tmp_path):
    block = _only_block(tmp_path, entry(target={**entry()["target"], "field": "notes"}, stored=None))
    assert "got is null" in block
    assert "is not distinct from" not in block


def test_emit_number_compares_numerically(tmp_path):
    block = _only_block(tmp_path, entry(stored=13))
    assert "got::numeric = '13'::numeric" in block


def test_emit_float_number_compares_numerically(tmp_path):
    block = _only_block(tmp_path, entry(stored=13.0))
    assert "got::numeric = '13.0'::numeric" in block


def test_emit_bool_compares_as_boolean(tmp_path):
    block = _only_block(tmp_path, link_entry(verdict="differs", call="mark_ungraded", stored=None, value=True))
    assert "got::boolean = 'true'::boolean" in block


def test_emit_string_compares_as_text(tmp_path):
    block = _only_block(tmp_path, entry(target={**entry()["target"], "field": "notes"}, stored="13.00"))
    assert "got = '13.00'" in block
    assert "::numeric" not in block


def test_emit_list_and_dict_compare_as_jsonb(tmp_path):
    lst = _only_block(tmp_path, entry(target={**entry()["target"], "field": "rank_weights"}, stored=[30, 25]))
    assert "got::jsonb = '[30, 25]'::jsonb" in lst
    dct = _only_block(tmp_path, entry(target={**entry()["target"], "field": "letter_scale"}, stored={"A": 93}))
    assert "got::jsonb = '{\"A\": 93}'::jsonb" in dct


def test_emit_cast_failure_is_a_fail_not_an_error(tmp_path):
    block = _only_block(tmp_path, entry(stored=13))
    # a recheck returning non-numeric text must raise FAIL <id>, not a bare cast error
    assert "exception when others then" in block
    assert block.count("raise exception 'FAIL %") >= 2


def test_emit_typed_values_stay_standard_quoted(tmp_path):
    hostile = "a'b"
    block = _only_block(tmp_path, entry(target={**entry()["target"], "field": "notes"}, stored=hostile))
    assert "got = 'a''b'" in block
    lst = _only_block(tmp_path, entry(target={**entry()["target"], "field": "letter_scale"}, stored={"x'y": 1}))
    assert "'{\"x''y\": 1}'::jsonb" in lst


# --- round 2, item 2: relations and functions are allowlisted, literals included --------------


def test_recheck_query_to_xml_bypass_rejected():
    sql = "select query_to_xml('select id, source_ref from assignments', true, true, '')::text"
    assert vr.recheck_error(sql) is not None
    assert any("recheck" in e for e in errors_of([entry(recheck=sql)]))


@pytest.mark.parametrize(
    "sql",
    [
        "select count(*) from courses",
        "select count(*) from auth.users",
        "select count(*) from assignments, attention_items",
        "select count(*) from assignments join bb_files on true",
        "select count(*) from public.assignments",
        "select vault.decrypted_secrets from assignments",
        "select current_setting('role') from assignments",
        "select xpath('/x', query_to_xml('x', true, true, '')) from assignments",
        "select count(*) from assignments where title = 'x' and notes like '%select * from courses%'",
        "select count(*) from assignments where notes = 'table_to_xml(x)'",
        "select count(*) from assignments where notes = 'pg_read_file(x)'",
        "select count(*) from assignments where notes = 'delete me'",
        "select \"query_to_xml\"('x', true, true, '') from assignments",
    ],
)
def test_recheck_outside_the_allowlist_rejected(sql):
    assert vr.recheck_error(sql) is not None, sql


@pytest.mark.parametrize(
    "sql",
    [
        "select count(*) from v_gradebook_latest where course_id = 'IST.323'",
        "select sum(weight_pct) from grade_components where course_id = 'ECN.304' and parent_id is null",
        "select coalesce(split_part(notes, ' ', 1), '') from grading_schemes where course_id = 'IST.466'",
        "select count(*) from v_grade_model_items where scheme_course_id = 'GEO.103.lecture'",
        "select notes like '%B-12 re-cut (2026-09-29): the log checkpoint%' from grade_components where code = 'fp_log'",
        "select count(*) from grade_components where code in ('a', 'b') and parent_id is not null",
    ],
)
def test_recheck_inside_the_allowlist_accepted(sql):
    assert vr.recheck_error(sql) is None, sql


def test_all_six_verdict_files_still_pass():
    files = sorted((SCRIPTS.parent / "docs" / "planning" / "sprint-2" / "verification").glob("96b_GRADING_VALIDATION_*.md"))
    if not files:
        pytest.skip("no verdict files on this branch")
    pairs, parse_errors = vr.read_entries([str(f) for f in files])
    assert parse_errors == []
    result = vr.check_entries([e for _, e in pairs], [s for s, _ in pairs])
    assert result.errors == []
