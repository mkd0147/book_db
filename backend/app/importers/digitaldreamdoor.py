"""Explicit, conservative importer. No requests occur during application startup."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.curated import ListImport, import_list
from app.db import database_path, make_engine, migrate


def canonical_url(url):
    p = urlsplit(url)
    if p.scheme != 'https' or p.hostname not in ('www.digitaldreamdoor.com', 'digitaldreamdoor.com') or p.port not in (None, 443) or p.username or p.password or not p.path.startswith('/pages/books/') or not p.path.endswith('.html'):
        raise ValueError('Use an HTTPS Digital Dream Door /pages/books/*.html URL.')
    return urlunsplit(('https', 'www.digitaldreamdoor.com', p.path, '', ''))


def fetch_html(url):
    url = canonical_url(url)
    # Redirects are rejected instead of fetching an unvalidated destination.
    with httpx.stream('GET', url, timeout=30, follow_redirects=False, headers={'User-Agent': 'BookDB personal-library importer/1.0'}) as response:
        response.raise_for_status()
        content = bytearray()
        for chunk in response.iter_bytes():
            content.extend(chunk)
            if len(content) > 5_000_000:
                raise ValueError('Source exceeds the 5 MB import limit.')
    return bytes(content)


def parse_html(html, url):
    soup = BeautifulSoup(html, 'html.parser')
    heading = soup.find('h1')
    if not heading:
        raise ValueError('List heading missing; source format is unsupported.')
    containers = soup.select('div.list')
    if not containers:
        raise ValueError('Ranked list blocks missing; source format is unsupported.')
    rows = []
    problems = []
    for container in containers:
        for br in container.find_all('br'):
            br.replace_with('\n')
        for line in container.get_text().splitlines():
            line = ' '.join(line.split())
            if not line:
                continue
            match = re.match(r'^(\d+)\.\s*(.+?)\s+(?:[-–—]\s+)?by\s+(.+)$', line, re.IGNORECASE)
            if not match:
                if re.match(r'^\d+[.)]', line):
                    problems.append(line)
                continue
            rank, title, author = match.groups()
            rows.append({'rank': int(rank), 'english_title': title, 'author': author})
    if problems:
        raise ValueError('Could not parse ranked rows; no import was made: ' + repr(problems[:5]))
    if not rows:
        raise ValueError('No supported title/author entries found.')
    ranks = [r['rank'] for r in rows]
    if sorted(ranks) != list(range(1, len(rows)+1)):
        raise ValueError('Ranks are missing or repeated; review the source manually.')
    name = heading.get_text(' ', strip=True)
    expected = re.match(r'^(\d+)\s', name)
    if expected and int(expected.group(1)) != len(rows):
        raise ValueError('Parsed count differs from the list heading; no import was made.')
    return ListImport(name=name, source_name='Digital Dream Door', source_url=canonical_url(url), entries=rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('--html', type=Path, help='Parse saved HTML instead of fetching')
    parser.add_argument('--apply', action='store_true', help='Write to the local database; default is preview')
    parser.add_argument('--resolved-json', type=Path, help='Reviewed preview with explicit book_id/create_separate resolutions')
    args = parser.parse_args()
    data = ListImport.model_validate_json(args.resolved_json.read_text(encoding='utf-8')) if args.resolved_json else parse_html(args.html.read_bytes() if args.html else fetch_html(args.url), args.url)
    if not args.apply:
        print(data.model_dump_json(indent=2))
        return
    engine = make_engine(database_path())
    migrate(engine)
    try:
        with Session(engine) as session, session.begin():
            print(json.dumps(import_list(session, data), ensure_ascii=False))
    except HTTPException as error:
        parser.exit(1, json.dumps(error.detail, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
