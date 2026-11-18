"""Keep the 1.x library independent from the 1.9 release candidate."""
import os
import sqlite3
import tempfile
from pathlib import Path


def legacy_root():
    return Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'BookDB'


def ensure_separate(path):
    resolved = Path(path).resolve()
    old = legacy_root().resolve()
    if resolved == old or old in resolved.parents:
        raise ValueError('BookDB 1.9 uses a separate data folder. The BookDB 1.x folder is protected; copy its database into a new folder instead.')
    return resolved


def copy_legacy_once(destination, source):
    """Snapshot through SQLite, never move/migrate the source or overwrite a target.

    A destination-only SQLite lock serializes first-run copies across launchers.
    Read-only backup includes committed WAL data, unlike a raw file copy.
    """
    destination = ensure_separate(destination)
    source = Path(source).resolve()
    if destination == source:
        raise ValueError('Source and destination databases must differ.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    lock = sqlite3.connect(destination.parent / '.first-run-lock.db', timeout=30)
    scratch = None
    try:
        lock.execute('BEGIN IMMEDIATE')
        if destination.exists() or not source.is_file():
            return False
        handle, filename = tempfile.mkstemp(prefix='library-copy-', suffix='.db', dir=destination.parent)
        os.close(handle)
        scratch = Path(filename)
        original = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=10)
        target = sqlite3.connect(scratch)
        try:
            original.backup(target)
            if target.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise ValueError('Legacy database copy failed validation.')
        finally:
            target.close()
            original.close()
        os.replace(scratch, destination)
        scratch = None
        return True
    finally:
        if scratch is not None:
            scratch.unlink(missing_ok=True)
        lock.rollback()
        lock.close()
