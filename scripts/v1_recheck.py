"""bb2dash :: scripts/v1_recheck.py -- the V-1 machine-block checker (brief 96, P-67; R-31, R-33, P-75).

Reads the `## Machine block` of each V-1 verdict file (one fenced yaml list) and:

  --check <files...>                       validates every entry; prints
                                           `rows: N, errors: E, differs without call: D`; exit 1 on E > 0
  --summary <files...> [--compare <96d>]   prints the counts table 96d carries verbatim (distinct target
                                           rows, never entries); --compare exits 1 unless 96d holds it
  --emit-sql <out> <files...>              writes the runner unit db/tests/phase16_106_v1_recheck.sql:
                                           one `do` block per keep / change_to / mark_ungraded entry

Run:  uv run --with pyyaml python scripts/v1_recheck.py --check docs/planning/sprint-2/verification/96b_*.md

Security: verdict files are written by a model session from document text, and --emit-sql turns
their `recheck` and `value` fields into executed SQL. Every field is treated as hostile: yaml is
read with safe_load; a recheck must be one plain SELECT (no dollar quotes, backslashes, comments or
second statement, none of the write keywords, only allowlisted relations and functions, and no
SQL text, write keyword or snake_case call inside a string literal); values are emitted as standard-quoted literals; ids
are pattern-checked; and the emitted unit runs `set transaction read only` before any recheck.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path

import yaml

# --- the closed sets (brief 96 §Contract "Verdict files"; research 75 §2) --------------------

VERDICTS = frozenset({"matches", "differs", "not_in_materials", "materials_say_more"})
CALLS = frozenset({"keep", "change_to", "ask_professor", "mark_ungraded"})
REASON_CODES = frozenset({
    "SYLLABUS_AUTHORITATIVE", "BLACKBOARD_AUTHORITATIVE", "SUPERSEDED_DOC", "BOOKKEEPING_COLUMN",
    "ROLLS_UP_TO_PARENT", "NOT_IN_MATERIALS", "OCR_UNREADABLE", "PROF_TO_CONFIRM",
    "ROUNDING_TOLERANCE", "STACK_OVERRIDE",
})
CONFIDENCE = frozenset({"confirmed", "tentative", "inferred"})  # prod enum confidence_level
TABLE_KEYS = {
    "assignments": ("id",),
    "grade_components": ("course_id", "code"),
    "grading_schemes": ("course_id",),
    "grade_column_links": ("course_id", "column_id"),
}
CITATION_TABLES = frozenset({"assignments", "grade_components", "grading_schemes"})
ALLOWED_KEYS = frozenset({
    "id", "target", "stored", "materials", "citation", "quote", "verdict", "call", "value",
    "reason_code", "why", "decided_by", "decided_on", "confidence_after", "recheck",
})
RECHECKED_CALLS = ("keep", "change_to", "mark_ungraded")
CORRECTING_CALLS = ("change_to", "mark_ungraded")
STACK_OVERRIDE = "STACK_OVERRIDE"

ID_RE = re.compile(r"^[A-Z]{2,4}\.\d{3}(\.[a-z]+)?-\d{2,}$")
CITATION_RE = re.compile(r"^bb_file:\d+#unit:\d+$")
FIELD_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
FIELD_LABEL_MAX = 120
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MACHINE_HEADING_RE = re.compile(r"^##\s+Machine block\s*$", re.MULTILINE)
YAML_FENCE_RE = re.compile(r"^```ya?ml[ \t]*\r?\n(.*?)^```[ \t]*$", re.MULTILINE | re.DOTALL)

# Whole words a recheck may not hold (the Contract's twelve), plus words that write or reach
# outside the grading tables through a SELECT. Checked outside AND inside string literals.
FORBIDDEN_WORDS = (
    "insert", "update", "delete", "drop", "alter", "create", "grant", "revoke", "truncate",
    "copy", "call", "do", "table",
    "into", "merge", "execute", "set_config", "nextval", "setval", "dblink", "dblink_exec", "vault",
    "lo_import", "lo_export", "lo_unlink", "lo_put", "lo_from_bytea",
)
FORBIDDEN_RE = re.compile(r"\b(" + "|".join(re.escape(w) for w in FORBIDDEN_WORDS) + r")\b", re.IGNORECASE)
FORBIDDEN_PATTERNS = (
    (re.compile(r"\bpg_\w*", re.IGNORECASE), "pg_* functions and catalogs"),
    (re.compile(r"\w*_to_xml\w*", re.IGNORECASE), "the *_to_xml functions"),
    (re.compile(r"\bnet\s*\.", re.IGNORECASE), "the net schema"),
)
# Inside a literal, SQL text is refused too: a literal holding a query is only useful to a function
# that executes it, and none is allowlisted, but the literal is refused as well (round 2, item 2).
LITERAL_SQL_RE = re.compile(r"\bselect\b[\s\S]*\bfrom\b", re.IGNORECASE)

# Round 2, item 2: the only relations and functions a recheck may name. The functions are those the
# six 2026-09-29 verdict files use (sum, count, coalesce, split_part) plus plain scalar and aggregate
# built-ins that read values and never execute text as SQL.
ALLOWED_RELATIONS = frozenset({
    "grading_schemes", "grade_components", "assignments", "grade_column_links",
    "v_gradebook_latest", "v_grade_model_items",
})
ALLOWED_FUNCTIONS = frozenset({
    "coalesce", "count", "sum", "split_part", "left", "right", "length", "lower", "upper",
    "round", "min", "max", "avg", "abs", "trim", "btrim", "nullif", "greatest", "least",
    "bool_and", "bool_or", "string_agg", "jsonb_array_length", "cast",
})
# Keywords that may stand before '(' without being a function call.
PAREN_KEYWORDS = frozenset({
    "in", "exists", "any", "all", "some", "as", "and", "or", "not", "from", "join", "on",
    "where", "select", "values", "filter", "over", "then", "else", "when", "is", "distinct", "by",
    "with", "array", "case", "like", "ilike",
})
IDENT = r"[A-Za-z_][A-Za-z0-9_]*"
FUNCTION_CALL_RE = re.compile(rf"({IDENT})\s*\(")
RELATION_RE = re.compile(rf"\b(?:from|join)\s+({IDENT}(?:\s*\.\s*{IDENT})?)", re.IGNORECASE)
FROM_LIST_RE = re.compile(
    r"\bfrom\b(.*?)(?=\bwhere\b|\bgroup\b|\border\b|\bhaving\b|\blimit\b|\bjoin\b|\bleft\b|\binner\b"
    r"|\bcross\b|\bright\b|\bfull\b|\bunion\b|\bexcept\b|\bintersect\b|\)|$)",
    re.IGNORECASE | re.DOTALL,
)
LIST_ITEM_RE = re.compile(rf"\s*({IDENT}(?:\s*\.\s*{IDENT})?)")
QUALIFIED_RE = re.compile(rf"({IDENT})\s*\.\s*{IDENT}")
CTE_RE = re.compile(rf"(?:\bwith|,)\s*({IDENT})\s+as\s*\(", re.IGNORECASE)

EMIT_UNIT_NAME = "phase16_106_v1_recheck"
NUMERIC_RE = re.compile(r"^\s*-?\d+(\.\d+)?\s*$")


class UsageError(Exception):
    """Bad command line; exit 2."""


class ParseError(Exception):
    """A verdict file whose machine block cannot be read."""


# --- parsing ----------------------------------------------------------------------------------


def parse_machine_block(text: str, source: str) -> list[dict]:
    heading = MACHINE_HEADING_RE.search(text)
    if not heading:
        raise ParseError(f"{source}: no '## Machine block' heading")
    fence = YAML_FENCE_RE.search(text, heading.end())
    if not fence:
        raise ParseError(f"{source}: no fenced yaml block under '## Machine block'")
    try:
        data = yaml.safe_load(fence.group(1))
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        where = f" (line {mark.line + 1})" if mark else ""
        raise ParseError(f"{source}: the machine block does not parse as yaml{where}") from exc
    if not isinstance(data, list) or not data:
        raise ParseError(f"{source}: the machine block must be a non-empty yaml list")
    return data


def read_entries(paths: list[str]) -> tuple[list[tuple[str, dict]], list[str]]:
    """(source, entry) pairs in file order, and the parse errors."""
    pairs: list[tuple[str, dict]] = []
    errors: list[str] = []
    for p in paths:
        try:
            text = Path(p).read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"{p}: cannot read ({exc.strerror})")
            continue
        try:
            pairs.extend((p, e) for e in parse_machine_block(text, p))
        except ParseError as exc:
            errors.append(str(exc))
    return pairs, errors


# --- normalisation ----------------------------------------------------------------------------


def row_key(entry: dict) -> tuple[str, tuple[str, ...]]:
    """(table, key values in the table's key order); assumes a checked entry."""
    target = entry["target"]
    table = target["table"]
    cols = TABLE_KEYS[table]
    key = target["key"]
    if isinstance(key, dict):
        return table, tuple(str(key[c]) for c in cols)
    return table, (str(key),)


def row_label(key: tuple[str, tuple[str, ...]]) -> str:
    return f"{key[0]} {'/'.join(key[1])}"


def canonical(value):
    """A comparable form: numbers by value, json by content, dates as ISO text."""
    if value is None:
        return None
    if isinstance(value, bool):
        return ("b", value)
    if isinstance(value, (int, float, Decimal)):
        return ("n", Decimal(str(value)))
    if isinstance(value, (dt.date, dt.datetime)):
        return ("s", value.isoformat())
    if isinstance(value, (list, dict)):
        return ("j", json.dumps(value, sort_keys=True))
    text = str(value)
    if NUMERIC_RE.match(text):
        try:
            return ("n", Decimal(text.strip()))
        except InvalidOperation:
            pass
    if text in ("true", "false"):
        return ("b", text == "true")
    return ("s", text)


def values_equal(a, b) -> bool:
    return canonical(a) == canonical(b)


def sql_text(value) -> str | None:
    """The text Postgres would print for a value, or None for NULL."""
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if isinstance(value, (list, dict)):
        return json.dumps(value)
    return str(value)


def quote_literal(text: str | None) -> str:
    if text is None:
        return "null::text"
    if "\x00" in text:
        raise ValueError("a value holds a NUL character")
    return "'" + text.replace("'", "''") + "'"


# --- the recheck guard ------------------------------------------------------------------------


def _strip_literals(sql: str) -> str:
    """Blank standard-quoted string literals (no backslashes reach here, so '' is the only escape)."""
    return re.sub(r"'(?:[^']|'')*'", "''", sql)


def recheck_error(sql) -> str | None:
    """None when `sql` is one plain SELECT the emitted unit may run, else why not."""
    if not isinstance(sql, str) or not sql.strip():
        return "must be a non-empty SELECT"
    for char, what in (("\x00", "a NUL"), ("$", "a dollar sign"), ("\\", "a backslash"), ('"', "a quoted identifier")):
        if char in sql:
            return f"must not contain {what}"
    if "--" in sql or "/*" in sql:
        return "must not contain comments"
    body = sql.strip()
    if body.endswith(";"):
        body = body[:-1].rstrip()
    if body.count("'") % 2:
        return "has an unterminated string literal"
    code = _strip_literals(body)
    if ";" in code or ";" in body:
        return "must be one statement (no ';' inside)"
    first = re.match(r"[A-Za-z]+", code)
    if not first or first.group(0).lower() not in ("select", "with"):
        return "must start with select (or with ... select)"
    problem = _denied_word(code) or _relation_error(code) or _function_error(code)
    if problem:
        return problem
    for literal in _literals(body):
        problem = _denied_word(literal) or _function_error_in_literal(literal)
        if not problem and LITERAL_SQL_RE.search(literal):
            problem = "must not hold SQL text"
        if problem:
            return f"{problem} (inside a string literal)"
    return None


def _literals(sql: str) -> list[str]:
    return [m.group(1).replace("''", "'") for m in re.finditer(r"'((?:[^']|'')*)'", sql)]


def _denied_word(text: str) -> str | None:
    hit = FORBIDDEN_RE.search(text)
    if hit:
        return f"must not contain '{hit.group(1).lower()}'"
    for pattern, what in FORBIDDEN_PATTERNS:
        if pattern.search(text):
            return f"must not reach {what}"
    return None


def _relation_error(code: str) -> str | None:
    """Every relation after from / join, or in a from comma list, is allowlisted or a CTE name."""
    allowed = ALLOWED_RELATIONS | {m.group(1).lower() for m in CTE_RE.finditer(code)}
    names = [m.group(1) for m in RELATION_RE.finditer(code)]
    for m in FROM_LIST_RE.finditer(code):
        for item in m.group(1).split(",")[1:]:
            first = LIST_ITEM_RE.match(item)
            if first:
                names.append(first.group(1))
    for name in names:
        plain = re.sub(r"\s+", "", name).lower()
        if plain not in allowed:
            return f"may read only {sorted(ALLOWED_RELATIONS)}, not '{plain}'"
    for m in QUALIFIED_RE.finditer(code):
        if m.group(1).lower() not in allowed:
            return f"must not name '{m.group(0)}' (qualify a column only with an allowed table)"
    return None


def _function_error(code: str) -> str | None:
    for m in FUNCTION_CALL_RE.finditer(code):
        name = m.group(1).lower()
        if name not in PAREN_KEYWORDS and name not in ALLOWED_FUNCTIONS:
            return f"may call only {sorted(ALLOWED_FUNCTIONS)}, not '{name}'"
    return None


def _function_error_in_literal(literal: str) -> str | None:
    """Inside a literal, prose like 're-cut (2026-09-29)' is fine; a snake_case call is not."""
    for m in FUNCTION_CALL_RE.finditer(literal):
        name = m.group(1).lower()
        if "_" in name and name not in ALLOWED_FUNCTIONS:
            return f"must not name the function '{name}'"
    return None


# --- --check ----------------------------------------------------------------------------------


@dataclass
class CheckResult:
    rows: int = 0
    errors: list[str] = field(default_factory=list)
    differs_without_call: int = 0


def _is_date(value) -> bool:
    if isinstance(value, dt.date):
        return True
    if isinstance(value, str) and DATE_RE.match(value):
        try:
            dt.date.fromisoformat(value)
            return True
        except ValueError:
            return False
    return False


def _has_nul(value) -> bool:
    if isinstance(value, str):
        return "\x00" in value
    if isinstance(value, list):
        return any(_has_nul(v) for v in value)
    if isinstance(value, dict):
        return any(_has_nul(k) or _has_nul(v) for k, v in value.items())
    return False


def _check_target(target, labels_ok: bool = False) -> list[str]:
    """labels_ok: a keep / ask_professor entry changes nothing, so its field may be a label
    (e.g. "component_id / points_possible", "check: weights sum to 100"); its recheck carries the value."""
    if not isinstance(target, dict):
        return ["target must be a mapping {table, key, field}"]
    errs = []
    table = target.get("table")
    if table not in TABLE_KEYS:
        return [f"target.table must be one of {sorted(TABLE_KEYS)}"]
    cols = TABLE_KEYS[table]
    key = target.get("key")
    if isinstance(key, dict):
        if set(key) != set(cols) or not all(isinstance(key[c], (str, int)) and str(key[c]) for c in cols):
            errs.append(f"target.key for {table} must be exactly {list(cols)}")
    elif isinstance(key, (str, int)) and len(cols) == 1 and str(key):
        pass
    else:
        errs.append(f"target.key for {table} must be {list(cols)}")
    field = target.get("field")
    if not isinstance(field, str) or not field.strip() or len(field) > FIELD_LABEL_MAX or "\n" in field or "\r" in field:
        errs.append(f"target.field must be one line of at most {FIELD_LABEL_MAX} characters")
    elif not labels_ok and not FIELD_RE.match(field):
        errs.append("target.field must be a column name on a change_to / mark_ungraded entry")
    if set(target) - {"table", "key", "field"}:
        errs.append("target has unknown keys")
    return errs


def _check_citation(e: dict) -> list[str]:
    reason = e.get("reason_code")
    citation = e.get("citation")
    if citation is None:
        if e.get("verdict") == "not_in_materials" or reason == STACK_OVERRIDE:
            return []
        return ["citation is required (bb_file:<id>#unit:<n>) unless not_in_materials or STACK_OVERRIDE"]
    if citation == STACK_OVERRIDE:
        return [] if reason == STACK_OVERRIDE else ["citation STACK_OVERRIDE needs reason_code STACK_OVERRIDE"]
    if not isinstance(citation, str) or not CITATION_RE.match(citation):
        return ["citation must match bb_file:<id>#unit:<n> exactly (one dialect, P-75)"]
    if not isinstance(e.get("quote"), str) or not e["quote"].strip():
        return ["a bb_file citation needs a verbatim quote"]
    return []


def check_entry(e) -> list[str]:
    if not isinstance(e, dict):
        return ["entry must be a mapping"]
    errs = []
    unknown = set(e) - ALLOWED_KEYS
    if unknown:
        errs.append(f"unknown keys {sorted(map(str, unknown))}")
    if not isinstance(e.get("id"), str) or not ID_RE.match(e["id"]):
        errs.append("id must look like <COURSE>-NN")
    errs += _check_target(e.get("target"), labels_ok=e.get("call") not in CORRECTING_CALLS)
    verdict = e.get("verdict")
    if verdict not in VERDICTS:
        errs.append(f"verdict must be one of {sorted(VERDICTS)}")
    call = e.get("call")
    if call is not None and call not in CALLS:
        errs.append(f"call must be one of {sorted(CALLS)}")
    if e.get("reason_code") is not None and e["reason_code"] not in REASON_CODES:
        errs.append("reason_code must be one of research 75's ten")
    if e.get("confidence_after") is not None and e["confidence_after"] not in CONFIDENCE:
        errs.append(f"confidence_after must be one of {sorted(CONFIDENCE)}")
    if verdict in VERDICTS and verdict != "matches":
        for name in ("call", "reason_code", "why", "decided_on"):
            if e.get(name) in (None, ""):
                errs.append(f"a {verdict} row needs {name}")
    if e.get("why") is not None and not isinstance(e["why"], str):
        errs.append("why must be text")
    if e.get("decided_on") is not None and not _is_date(e["decided_on"]):
        errs.append("decided_on must be YYYY-MM-DD")
    errs += _check_citation(e)
    if call in CORRECTING_CALLS and "value" not in e:
        errs.append(f"a {call} row needs value")
    # A correcting entry with no `stored` would compare value with None and could be counted as
    # already applied (round 2, item 6); keep compares its recheck with stored.
    if call in RECHECKED_CALLS and "stored" not in e:
        errs.append(f"a {call} row needs stored")
    if call in RECHECKED_CALLS:
        problem = recheck_error(e.get("recheck")) if "recheck" in e else "is required for keep / change_to / mark_ungraded"
        if problem:
            errs.append(f"recheck {problem}")
    elif "recheck" in e and e["recheck"] is not None:
        problem = recheck_error(e["recheck"])
        if problem:
            errs.append(f"recheck {problem}")
    if _has_nul(e):
        errs.append("a field holds a NUL character")
    return errs


def check_entries(entries: list[dict], sources: list[str] | None = None) -> CheckResult:
    result = CheckResult(rows=len(entries))
    seen: dict[str, str] = {}
    for i, e in enumerate(entries):
        src = sources[i] if sources else "<entries>"
        label = e.get("id") if isinstance(e, dict) and isinstance(e.get("id"), str) else f"entry {i + 1}"
        for err in check_entry(e):
            result.errors.append(f"{src}: {label}: {err}")
        if isinstance(e, dict):
            if e.get("verdict") == "differs" and e.get("call") in (None, ""):
                result.differs_without_call += 1
            if isinstance(e.get("id"), str):
                if e["id"] in seen:
                    result.errors.append(f"{src}: {label}: duplicate id (also in {seen[e['id']]})")
                else:
                    seen[e["id"]] = src
    return result


# --- --summary --------------------------------------------------------------------------------


@dataclass
class Summary:
    entries: int
    target_rows: int
    corrections: int
    citation_only: int
    left_tentative: int
    already_applied: int
    already_applied_rows: list[str]
    verdicts: dict[str, int]


def summarize(entries: list[dict]) -> Summary:
    rows: dict[tuple, list[dict]] = {}
    for e in entries:
        rows.setdefault(row_key(e), []).append(e)
    corrections = citation_only = tentative = applied = 0
    applied_rows = []
    for key, group in rows.items():
        correcting = [e for e in group if e.get("call") in CORRECTING_CALLS]
        if any(not values_equal(e.get("value"), e.get("stored")) for e in correcting):
            corrections += 1
            continue
        if correcting:
            applied += 1
            applied_rows.append(f"already applied: {row_label(key)} ({', '.join(e['id'] for e in correcting)})")
        if any(e.get("confidence_after") == "tentative" for e in group):
            tentative += 1
        elif key[0] in CITATION_TABLES:
            citation_only += 1
    verdicts = {v: sum(1 for e in entries if e.get("verdict") == v) for v in sorted(VERDICTS)}
    return Summary(len(entries), len(rows), corrections, citation_only, tentative, applied, applied_rows, verdicts)


def format_summary_table(s: Summary) -> list[str]:
    lines = [
        "| count | n |",
        "|---|---|",
        f"| target rows | {s.target_rows} |",
        f"| machine-block entries | {s.entries} |",
    ]
    lines += [f"| entries {v} | {n} |" for v, n in s.verdicts.items()]
    lines += [
        f"| corrections | {s.corrections} |",
        f"| citation-only | {s.citation_only} |",
        f"| left tentative | {s.left_tentative} |",
        f"| already applied | {s.already_applied} |",
    ]
    return lines


# --- --emit-sql -------------------------------------------------------------------------------


def _unused_tag(body: str, base: str) -> str:
    tag = base
    while f"${tag}$" in body:
        tag += "x"
    return f"${tag}$"


def comparison_expr(want) -> str:
    """The boolean SQL expression comparing the recheck's text result `got` with `want`, chosen by
    the YAML type of `want`: null -> is null; bool -> boolean; number -> numeric; list / dict -> jsonb;
    anything else (text, dates) -> text. Every literal is standard-quoted by quote_literal."""
    if want is None:
        return "got is null"
    literal = quote_literal(sql_text(want))
    if isinstance(want, bool):
        return f"got::boolean = {literal}::boolean"
    if isinstance(want, (int, float, Decimal)):
        return f"got::numeric = {literal}::numeric"
    if isinstance(want, (list, dict)):
        return f"got::jsonb = {literal}::jsonb"
    return f"got = {literal}"


def emit_block(e: dict) -> str:
    want = e.get("stored") if e["call"] == "keep" else e.get("value")
    recheck = e["recheck"].strip()
    if recheck.endswith(";"):
        recheck = recheck[:-1].rstrip()
    rc = _unused_tag(recheck, "rc")  # recheck holds no '$' (recheck_error), so this is $rc$
    ident = quote_literal(e["id"])
    body = (
        "\ndeclare\n"
        "  got text;\n"
        f"  want text := {quote_literal(sql_text(want))};\n"
        "  ok boolean;\n"
        "begin\n"
        "  begin\n"
        f"    execute {rc}{recheck}{rc} into strict got;\n"
        "  exception when others then\n"
        f"    raise exception 'FAIL % (the recheck did not return exactly one value: %)', {ident}, sqlerrm;\n"
        "  end;\n"
        "  begin\n"
        f"    ok := {comparison_expr(want)};\n"
        "  exception when others then\n"
        "    ok := false;\n"
        "  end;\n"
        "  if ok is not true then\n"
        f"    raise exception 'FAIL % (got %, want %)', {ident}, coalesce(got, 'null'), coalesce(want, 'null');\n"
        "  end if;\n"
        "end\n"
    )
    outer = _unused_tag(body, "v1")
    return f"do {outer}{body}{outer};"


def emit_sql(entries: list[dict]) -> str:
    blocks = [emit_block(e) for e in entries if e.get("call") in RECHECKED_CALLS]
    lines = [
        "-- bb2dash :: db/tests/phase16_106_v1_recheck.sql",
        "-- GENERATED by scripts/v1_recheck.py --emit-sql from the V-1 verdict files; do not edit by hand.",
        "-- One block per keep / change_to / mark_ungraded entry: runs the entry's recheck and raises",
        "-- FAIL <id> unless it returns the entry's value (change_to, mark_ungraded) or stored (keep).",
        "-- Brief 95's lint and pass rule: begin first, rollback last, no commit / end; read only.",
        "begin;",
        "set transaction read only;",
        *blocks,
        f"select '{EMIT_UNIT_NAME}: PASS';",
        "rollback;",
    ]
    return "\n".join(lines) + "\n"


# --- CLI --------------------------------------------------------------------------------------

USAGE = (
    "usage: v1_recheck.py --check <files...>\n"
    "       v1_recheck.py --summary <files...> [--compare <96d>]\n"
    "       v1_recheck.py --emit-sql <out> <files...>"
)


def parse_args(argv: list[str]) -> dict:
    if not argv or argv[0] not in ("--check", "--summary", "--emit-sql"):
        raise UsageError(USAGE)
    mode, rest = argv[0], list(argv[1:])
    args = {"mode": mode, "out": None, "compare": None}
    if mode == "--emit-sql":
        if not rest or rest[0].startswith("--"):
            raise UsageError("--emit-sql needs <out> then <files...>")
        args["out"] = rest.pop(0)
    if mode == "--summary" and "--compare" in rest:
        i = rest.index("--compare")
        if i + 1 >= len(rest):
            raise UsageError("--compare needs a file")
        args["compare"] = rest[i + 1]
        del rest[i:i + 2]
    if any(r.startswith("--") for r in rest):
        raise UsageError(f"unknown option in {rest}\n{USAGE}")
    if not rest:
        raise UsageError(f"{mode} needs at least one verdict file")
    args["files"] = rest
    return args


def _load_and_check(files: list[str]) -> tuple[list[dict], CheckResult, list[str]]:
    pairs, parse_errors = read_entries(files)
    entries = [e for _, e in pairs]
    result = check_entries(entries, [s for s, _ in pairs])
    result.errors = parse_errors + result.errors
    return entries, result, parse_errors


def _print_check(result: CheckResult) -> None:
    for err in result.errors:
        print(f"error: {err}")
    print(f"rows: {result.rows}, errors: {len(result.errors)}, differs without call: {result.differs_without_call}")


def main(argv: list[str]) -> int:
    try:
        args = parse_args(argv)
    except UsageError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    entries, result, _ = _load_and_check(args["files"])
    if args["mode"] == "--check" or result.errors:
        _print_check(result)
        return 1 if result.errors else 0

    if args["mode"] == "--summary":
        s = summarize(entries)
        table = format_summary_table(s)
        print("\n".join(table + s.already_applied_rows))
        if args["compare"]:
            try:
                have = set(Path(args["compare"]).read_text(encoding="utf-8").splitlines())
            except OSError as exc:
                print(f"error: cannot read {args['compare']} ({exc.strerror})")
                return 1
            missing = [line for line in table if line not in {h.rstrip() for h in have}]
            if missing:
                print(f"compare: {args['compare']} does not carry these lines verbatim:")
                print("\n".join(missing))
                return 1
            print(f"compare: {args['compare']} carries the counts table")
        return 0

    try:
        sql = emit_sql(entries)
    except ValueError as exc:
        print(f"error: {exc}")
        return 1
    Path(args["out"]).write_text(sql, encoding="utf-8", newline="\n")
    blocks = sum(1 for e in entries if e.get("call") in RECHECKED_CALLS)
    print(f"wrote {args['out']}: {blocks} recheck blocks from {len(entries)} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
