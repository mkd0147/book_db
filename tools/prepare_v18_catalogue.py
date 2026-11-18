"""Build a fresh public catalogue; never copy private SQLite pages or history."""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

KEEP = {
    'alembic_version': 'version_num',
    'series': 'id name original_author czech_name slovak_name',
    'books': 'id author english_title normalized_author normalized_title release_year page_count translated_cs translated_sk translated_cs_sk czech_title slovak_title czech_translation_year slovak_translation_year series_id series_position',
    'curated_lists': 'id name source_url source_name',
    'curated_list_entries': 'id curated_list_id book_id rank source_title source_author',
    'curated_series_entries': 'id curated_list_id series_id rank source_title source_author',
    'returned_loans': '',
    'reading_sessions': '',
}


def prepare(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination.exists():
        raise ValueError('Destination must be a new file')
    destination.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
    src.execute('BEGIN')
    dst = sqlite3.connect(destination)
    try:
        schema = dict(src.execute("SELECT name, sql FROM sqlite_master WHERE type='table'"))
        if set(schema) != set(KEEP):
            raise ValueError('Unexpected schema: review before public export')
        for name in KEEP:
            dst.execute(schema[name])
        counts = {}
        for name, fields in KEEP.items():
            if not fields:
                counts[name] = 0
                continue
            columns = fields.split()
            rows = src.execute(f'SELECT {", ".join(columns)} FROM {name}').fetchall()
            if name == 'books':
                columns += ['created_at', 'updated_at']
                rows = [tuple(row) + ('2000-01-01 00:00:00',) * 2 for row in rows]
            placeholders = ','.join('?' for _ in columns)
            dst.executemany(f'INSERT INTO {name} ({", ".join(columns)}) VALUES ({placeholders})', rows)
            counts[name] = len(rows)
        for (sql,) in src.execute("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"):
            dst.execute(sql)
        assert dst.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
        assert dst.execute('PRAGMA foreign_key_check').fetchall() == []
        assert dst.execute('SELECT count(*) FROM books WHERE owned OR read OR knihobot_watchlist OR knihobot_wishlist OR rating IS NOT NULL OR expected_price IS NOT NULL OR notes IS NOT NULL OR borrower IS NOT NULL OR loan_date IS NOT NULL').fetchone()[0] == 0
        assert dst.execute('SELECT count(*) FROM series WHERE notes IS NOT NULL').fetchone()[0] == 0
        dst.commit()
    finally:
        dst.close()
        src.close()
    report = {'counts': counts, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'personal_data_removed': True}
    destination.with_suffix('.audit.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('destination')
    args = parser.parse_args()
    prepare(args.source, args.destination)
