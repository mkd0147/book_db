from app.db import database_path
from app.main import create_app
from fastapi.testclient import TestClient
import pytest


def test_windows_edition_has_no_cloud_or_profiles(tmp_path):
    with TestClient(create_app(tmp_path / 'books.db')) as client:
        paths = client.get('/openapi.json').json()['paths']
        assert not any(p.startswith(('/api/cloud', '/api/profiles', '/api/sync')) for p in paths)
        assert client.get('/api/health').json()['version'] == '1.9.0-rc.1'


def test_original_library_is_protected(tmp_path, monkeypatch):
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path))
    monkeypatch.setenv('BOOK_DB_DATA_DIR', str(tmp_path / 'BookDB'))
    with pytest.raises(ValueError, match='protected'):
        database_path()


def test_first_launch_copies_once_without_changing_original(tmp_path, monkeypatch):
    import sqlite3
    from hashlib import sha256
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path))
    monkeypatch.delenv('BOOK_DB_DATA_DIR', raising=False)
    legacy = tmp_path / 'BookDB' / 'books.db'
    legacy.parent.mkdir()
    with sqlite3.connect(legacy) as db:
        db.execute('CREATE TABLE fixture(value TEXT)')
        db.execute("INSERT INTO fixture VALUES ('original')")
    before = sha256(legacy.read_bytes()).digest()
    candidate = database_path()
    assert candidate == tmp_path / 'BookDB-1.9' / 'books.db'
    with sqlite3.connect(candidate) as db:
        assert db.execute('SELECT value FROM fixture').fetchone() == ('original',)
        db.execute("UPDATE fixture SET value='candidate'")
    assert database_path() == candidate
    with sqlite3.connect(candidate) as db:
        assert db.execute('SELECT value FROM fixture').fetchone() == ('candidate',)
    assert sha256(legacy.read_bytes()).digest() == before
