# bb2dash :: ingest/test_token_budget.py
#
#   uv run --with tokenizers --with "psycopg[binary]" --with pytest python -m pytest ingest/test_token_budget.py -q
#
# Phase 18 task 21. The budget is gte-small's 512-token window with [CLS] and [SEP] counted, so a
# 512-token input passes and a 513-token one fails. The tokenizer is the real thenlper/gte-small one
# (fetched once from the Hugging Face hub and cached). "a" is one WordPiece token in that vocabulary,
# so n copies of "a" encode to n + 2 tokens.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest

import token_budget as tb


@pytest.fixture(scope="module")
def tok():
    return tb.load_tokenizer()


def test_a_512_token_input_fits(tok):
    text = " ".join(["a"] * 510)
    assert tb.token_count(tok, text) == 512, "[CLS] and [SEP] are counted"
    assert tb.fits(tok, text) is True


def test_a_513_token_input_does_not_fit(tok):
    text = " ".join(["a"] * 511)
    assert tb.token_count(tok, text) == 513
    assert tb.fits(tok, text) is False


def test_the_count_is_never_truncated(tok):
    text = " ".join(["a"] * 2000)
    assert tb.token_count(tok, text) == 2002, "a truncating tokenizer would hide an over-budget part"


def test_embedded_input_is_header_plus_slice():
    # The same string embed-corpus builds: "{course} {bucket} — {file_name}: " + the part's slice.
    assert tb.embedded_input("IST.323", "lecture_slides", "L1.pptx", "hello") == "IST.323 lecture_slides — L1.pptx: hello"
    assert tb.embedded_input(None, None, None, "x") == "  — : x", "nulls become empty strings, as in the edge function"


def test_summary_line_and_exit_code():
    assert tb.summarize([10, 512, 300]) == ("parts=3 max_tokens=512 over_budget=0", 0)
    assert tb.summarize([10, 513, 600]) == ("parts=3 max_tokens=600 over_budget=2", 1)
    assert tb.summarize([]) == ("parts=0 max_tokens=0 over_budget=0", 0)


def test_the_query_reads_current_files_and_gte_small_parts_only():
    sql = tb.PARTS_SQL.lower()
    assert "superseded_by is null" in sql
    assert "model = 'gte-small'" in sql
    assert "part_range" in sql


def test_parse_env_file_matches_the_runner():
    text = "# c\n\nexport BB2DASH_TEST_DB_URL='postgres://u:p#w@h:5432/d'\nOTHER=1\nbad line\n"
    assert tb.parse_env_file(text) == {"BB2DASH_TEST_DB_URL": "postgres://u:p#w@h:5432/d", "OTHER": "1"}
    assert tb.parse_env_file("K=a#b") == {"K": "a#b"}, "an unquoted # is kept (a generated password may hold one)"


def test_libpq_dsn_drops_the_node_pg_only_parameter():
    # scripts/db-test.mjs's DSN carries node-pg's `uselibpqcompat`, which libpq refuses.
    assert tb.libpq_dsn("postgresql://u:p@h:6543/postgres?sslmode=require&uselibpqcompat=true") == "postgresql://u:p@h:6543/postgres?sslmode=require"
    assert tb.libpq_dsn("postgresql://u:p@h/d?uselibpqcompat=true") == "postgresql://u:p@h/d"
    assert tb.libpq_dsn("postgresql://u:p@h/d") == "postgresql://u:p@h/d"


def test_load_dsn_prefers_the_environment_then_env_local(tmp_path):
    (tmp_path / ".env.local").write_text("BB2DASH_TEST_DB_URL=postgres://file\n", encoding="utf-8")
    assert tb.load_dsn(env={"BB2DASH_TEST_DB_URL": "postgres://env"}, root=str(tmp_path)) == "postgres://env"
    assert tb.load_dsn(env={}, root=str(tmp_path)) == "postgres://file"
    with pytest.raises(SystemExit):
        tb.load_dsn(env={}, root=str(tmp_path / "missing"))
