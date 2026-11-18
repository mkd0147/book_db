"""Exercise the built EXE without a browser, GUI, or real library data."""
import argparse
from datetime import date
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import runpy
import httpx


def main():
    root = Path(__file__).resolve().parents[1]
    version = runpy.run_path(str(root / 'backend/app/version.py'))['APP_VERSION']
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path, nargs='?', default=root / 'dist' / f'v{version}' / 'BookDB' / 'BookDB.exe')
    parser.add_argument('--profiles', action='store_true', help='Also verify version 2 library isolation.')
    args = parser.parse_args()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    scratch = root / 'build' / 'smoke-data'
    scratch.mkdir(parents=True, exist_ok=True)
    # Unique data directory remains available for inspecting the smoke-test log.
    data = Path(tempfile.mkdtemp(dir=scratch))
    process = subprocess.Popen([str(args.executable.resolve()), '--headless', '--no-browser', '--port', str(port), '--data-dir', str(data)], creationflags=subprocess.CREATE_NO_WINDOW)
    url = f'http://127.0.0.1:{port}'
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError('Packaged server exited: ' + (data / 'bookdb.log').read_text(encoding='utf-8'))
            try:
                if httpx.get(url + '/api/health', timeout=.5).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(.1)
        else:
            raise RuntimeError('Server did not start within 10 seconds.')
        with httpx.Client(base_url=url, timeout=5) as client:
            assert '<div id="root">' in client.get('/').text
            book = client.post('/api/books', json={'author': 'Smoke test', 'english_title': 'Česká kniha', 'owned': True})
            assert book.status_code == 201, book.text
            assert client.get('/api/books?q=ceska').json()['total'] == 1
            assert client.get('/api/statistics').json()['owned'] == 1
            reading = client.post('/api/reading', json={'book_id': book.json()['id']})
            assert reading.status_code == 201, reading.text
            begun = client.post(f"/api/reading/{reading.json()['id']}/days", json={'day': date.today().isoformat(), 'action': 'start'})
            assert begun.status_code == 200, begun.text

            done = client.post(f"/api/reading/{reading.json()['id']}/days", json={'day': date.today().isoformat(), 'action': 'complete'})
            assert done.status_code == 200, done.text
            detail = client.get(f"/api/books/{book.json()['id']}").json()
            assert detail['read'] and detail['reading_history'][0]['status'] == 'completed'
            reopened = client.post(f"/api/reading/{reading.json()['id']}/reopen")
            assert reopened.status_code == 200 and reopened.json()['status'] == 'active'
            assert reopened.json()['ended_on'] is None
            done = client.post(f"/api/reading/{reading.json()['id']}/days", json={'day': date.today().isoformat(), 'action': 'complete'})
            assert done.status_code == 200

            client.patch(f"/api/books/{book.json()['id']}", json={'read': False}).raise_for_status()
            loan_path = f"/api/books/{book.json()['id']}"
            lent = client.post(loan_path + '/loan', json={'borrower': 'Loan smoke', 'loan_date': '2026-09-01'})
            assert lent.status_code == 200, lent.text
            assert client.get('/api/loans').json()['total'] == 1
            client.patch(loan_path, json={'borrower': None, 'loan_date': None}).raise_for_status()
            assert client.get('/api/loans').json()['total'] == 0
            history = client.get('/api/loans?status=returned').json()
            assert history['total'] == 1 and history['items'][0]['borrower'] == 'Loan smoke'
            translated = client.patch(f"/api/books/{book.json()['id']}", json={'czech_title': 'Local title'})
            assert translated.status_code == 200 and translated.json()['translated_cs'], translated.text
            rating_path = f"/api/books/{book.json()['id']}/rating"
            assert client.patch(rating_path, json={'rating': 4}).status_code == 409
            batch = client.patch('/api/books/batch', json={'ids': [book.json()['id']], 'changes': {'read': True, 'translated': True}})
            assert batch.status_code == 200, batch.text
            assert client.patch(rating_path, json={'rating': 4}).json()['rating'] == 4
            assert client.get('/api/books?translated=true').json()['total'] == 1
            curated=client.post('/api/lists',json={'name':'Series smoke'}).json()
            client.post(f"/api/lists/{curated['id']}/entries",json={'book_id':book.json()['id'],'rank':1}).raise_for_status()
            conversion=client.post(f"/api/lists/{curated['id']}/series-entries",json={'replace_book_id':book.json()['id'],'new_series':{'name':'Smoke series','original_author':'Smoke author'}})
            conversion.raise_for_status()
            rows=client.get(f"/api/books?curated_list_id={curated['id']}&include_series=true&sort=rank").json()
            assert rows['items'][0]['entity_type']=='series'
            series_id = rows['items'][0]['series_id']
            details = client.patch(f'/api/series/{series_id}', json={'name': 'Smoke series', 'original_author': 'Updated author', 'czech_name': 'Local series name'})
            assert details.status_code == 200, details.text
            assert details.json()['czech_name'] == 'Local series name'
            backup = client.get('/api/backup/export')
            assert 'Česká kniha' in backup.text
            assert client.post('/api/backup/import?preview=true', content=backup.content).status_code == 200
            if args.profiles:
                created = client.post('/api/profiles', json={'name': 'Isolated packaged library'})
                created.raise_for_status()
                profile_id = created.json()['id']
                headers = {'X-BookDB-Profile': profile_id}
                assert client.get('/api/books', headers=headers).json()['total'] == 0
                other = client.post('/api/books', headers=headers,
                                    json={'author': 'Other author', 'english_title': 'Other profile'})
                other.raise_for_status()
                assert client.get('/api/books', headers=headers).json()['total'] == 1
                assert client.get('/api/books').json()['items'][0]['english_title'] == book.json()['english_title']
                assert client.get('/api/books', headers={'X-BookDB-Profile': 'missing'}).status_code == 404
                assert client.get('/api/books').json()['total'] == 1
                print('Packaged EXE: profile isolation and invalid-profile rejection passed.')
            assert client.delete('/api/books/' + str(book.json()['id'])).status_code == 204
        print('Packaged EXE: startup, migrations, frontend, CRUD, Unicode search, statistics and YAML preview passed. No browser launched.')
    finally:
        process.terminate()
        process.wait(timeout=10)


if __name__ == '__main__':
    main()
