# Windows 1.9 release candidate

This edition restores the Windows-only feature set of 1.8 from maintained source.
It includes books, translations, ranked curated lists, series, batch editing,
ratings, loans and returned loans, reading sessions and undo, page-based reading
pace, statistics, YAML import/export, and English/Czech/Slovak interface text.
Profiles, Google accounts, cloud synchronization and Android are excluded.

Extract the entire application folder and start BookDB.exe. Select the language
in Settings. Use the launcher to stop the app when finished.

## Your existing library

The default data folder is `%LOCALAPPDATA%\BookDB-1.9`, and the default local port
is 8769. On first launch only, the app copies the v1.8 database through SQLite's
backup API into the new folder if no candidate database already exists. It never
changes the original `%LOCALAPPDATA%\BookDB` folder. The two copies are independent:
edits in 1.9 do not appear in 1.8 or vice versa.

An explicit `--data-dir` uses that separate folder and skips automatic copying.
For example, to test with an empty library:

```powershell
.\BookDB.exe --data-dir C:\BookDB-Test --port 8770
```

You can also copy the optional public catalogue into that folder as `books.db`
before starting. Do not replace an existing database you need. Export YAML
backups from Import / Export regularly. The original 1.8 download remains
available as a fallback. This candidate is unsigned and is not yet a final
stable release.

## Build from the tagged source on Windows

Install Python 3.10 and Node.js 22 or newer, plus Git. In the repository root:

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
npm.cmd --prefix frontend ci
.\.venv\Scripts\python.exe -m pytest -q
npm.cmd --prefix frontend test
.\.venv\Scripts\python.exe scripts/package_windows.py
.\.venv\Scripts\python.exe scripts/smoke_package.py
```

Packaging requires a clean Git working tree and builds the frontend afresh.
Output is `dist/v1.9.0-rc.1/BookDB/BookDB.exe`; keep its whole folder together.
`SOURCE_COMMIT.txt` identifies the source revision. The build requires dependency
downloads; normal collection use is local. List imports contact their source
site only when requested. This is a documented build, not a claim that different
Windows build environments produce byte-for-byte identical executables.

## Features to try

- Import a list and confirm shared books retain a single identity across lists.
- Select a list in Collection and check its ranking order and series expansion.
- Edit translations, ownership, read status and ratings; select rows for batch edits.
- Lend an existing book, mark it returned, and inspect returned-loan history.
- Start reading, log/undo days, complete/reopen, and inspect book reading history.
- Export YAML, preview its import into an empty test library, then import it.

Source is published for inspection and building. A project-wide open-source
licence has not yet been selected; third-party notices retain their own terms.
