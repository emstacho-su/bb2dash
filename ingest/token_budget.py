# bb2dash :: ingest/token_budget.py
#
#   uv run --with tokenizers --with "psycopg[binary]" python ingest/token_budget.py
#
# Phase 18 task 21 (P-81). Does every stored embedding part fit gte-small's window?
#
# embed-corpus embeds, per part, "{course} {bucket} — {file_name}: " plus the part's slice of
# bb_file_text.text (part_range, in code points, which Postgres substring() also counts). The model
# (thenlper/gte-small) reads at most 512 tokens with [CLS] and [SEP] included; anything past that
# is silently cut off before pooling, so the tail of an over-long part is never searchable. This
# script rebuilds each current part's exact input, tokenizes it with that model's own tokenizer
# (truncation off, so an over-long part is counted, not hidden), and prints
#
#   parts=<n> max_tokens=<n> over_budget=<n>
#
# exiting 1 when any part is over 512, with the five longest parts named (ids only) on stderr.
#
# Credential: BB2DASH_TEST_DB_URL (Phase 15's db_test_runner role), read the way
# scripts/db-test.mjs reads it: the process environment, else `.env.local` at the root of the
# checkout this script lives in, parsed here so the command above needs no extra package. The DSN
# is never printed.

import os
import sys

MODEL_ID = "thenlper/gte-small"
MAX_TOKENS = 512
REPORT_LONGEST = 5
DSN_NAME = "BB2DASH_TEST_DB_URL"

# Current files only (superseded rows are out of search), gte-small parts only.
PARTS_SQL = """
select e.text_id, e.part_no, f.course_id, f.bucket::text, f.file_name,
       substring(t.text from lower(e.part_range) + 1 for upper(e.part_range) - lower(e.part_range)) as slice
  from bb_text_embeddings e
  join bb_file_text t on t.id = e.text_id
  join bb_files f on f.id = t.file_id
 where e.model = 'gte-small' and f.superseded_by is null
 order by e.text_id, e.part_no
"""


def parse_env_file(text):
    """KEY=value lines, # comments, optional `export `, matching quotes stripped (scripts/db-test.mjs)."""
    out = {}
    for raw in str(text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        body = line[7:].strip() if line.startswith("export ") else line
        eq = body.find("=")
        if eq < 1:
            continue
        key = body[:eq].strip()
        if not key.replace("_", "a").isalnum() or key[0].isdigit():
            continue
        value = body[eq + 1:].strip()
        if len(value) >= 2 and value[0] in "\"'" and value[-1] == value[0]:
            value = value[1:-1]
        out[key] = value
    return out


def load_dsn(env=None, root=None):
    """The DSN from `env` (default os.environ), else from <root>/.env.local; exits 2 when absent."""
    env = os.environ if env is None else env
    root = root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_file = os.path.join(root, ".env.local")
    from_file = {}
    if os.path.exists(env_file):
        with open(env_file, encoding="utf-8") as fh:
            from_file = parse_env_file(fh.read())
    dsn = env.get(DSN_NAME) or from_file.get(DSN_NAME)
    if not dsn:
        print(f"{DSN_NAME} is not set: put it in the environment or in {env_file} (gitignored)", file=sys.stderr)
        raise SystemExit(2)
    return dsn.strip()


def load_tokenizer():
    from tokenizers import Tokenizer

    tok = Tokenizer.from_pretrained(MODEL_ID)
    tok.no_truncation()
    tok.no_padding()
    return tok


def token_count(tok, text):
    """Tokens the model would see for `text`, [CLS] and [SEP] included, never truncated."""
    return len(tok.encode(text, add_special_tokens=True).ids)


def fits(tok, text):
    return token_count(tok, text) <= MAX_TOKENS


def embedded_input(course_id, bucket, file_name, slice_text):
    """embed-corpus's header() plus the part's slice, nulls as empty strings."""
    return f"{course_id or ''} {bucket or ''} — {file_name or ''}: {slice_text or ''}"


def summarize(counts):
    over = sum(1 for n in counts if n > MAX_TOKENS)
    line = f"parts={len(counts)} max_tokens={max(counts, default=0)} over_budget={over}"
    return line, (1 if over else 0)


# Query parameters node-pg understands and libpq refuses (scripts/db-test.mjs's DSN carries one).
NODE_PG_ONLY_PARAMS = ("uselibpqcompat",)


def libpq_dsn(dsn):
    """The DSN with node-pg-only query parameters removed, so psycopg (libpq) accepts it."""
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    parts = urlsplit(dsn)
    kept = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in NODE_PG_ONLY_PARAMS]
    return urlunsplit(parts._replace(query=urlencode(kept)))


def fetch_parts(dsn):
    import psycopg

    # prepare_threshold=None keeps this safe on a transaction pooler (port 6543).
    with psycopg.connect(libpq_dsn(dsn), prepare_threshold=None) as conn, conn.cursor() as cur:
        cur.execute(PARTS_SQL)
        return cur.fetchall()


def main():
    dsn = load_dsn()
    tok = load_tokenizer()
    try:
        rows = fetch_parts(dsn)
    except Exception as exc:  # report the failure without the DSN
        message = str(exc).replace(dsn, "<redacted>")
        print(f"token_budget: database read failed: {message.splitlines()[0] if message else type(exc).__name__}", file=sys.stderr)
        return 2
    measured = [
        (token_count(tok, embedded_input(course, bucket, name, part)), text_id, part_no)
        for text_id, part_no, course, bucket, name, part in rows
    ]
    line, code = summarize([n for n, _, _ in measured])
    print(line)
    if code:
        for n, text_id, part_no in sorted(measured, reverse=True)[:REPORT_LONGEST]:
            print(f"over: text_id={text_id} part_no={part_no} tokens={n}", file=sys.stderr)
    return code


if __name__ == "__main__":
    sys.exit(main())
