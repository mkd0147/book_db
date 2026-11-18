import yaml
from fastapi.testclient import TestClient
from app.main import create_app


def test_yaml_roundtrip(client, tmp_path):
    series = client.post('/api/series', json={'name': 'Česká série', 'notes': 'Ľúbim knihy'}).json()
    book = client.post('/api/books', json={'author': 'Karel Čapek', 'english_title': 'War with the Newts', 'czech_title': 'Válka s mloky', 'translated_cs': True, 'owned': True, 'rating': 0, 'series_id': series['id'], 'series_position': 1.5, 'expected_price': 12.25}).json()
    l = client.post('/api/lists', json={'name': 'Výber', 'source_name': 'Môj zoznam'}).json()
    client.post(f"/api/lists/{l['id']}/entries", json={'book_id': book['id'], 'rank': 1, 'source_title': 'Válka s mloky'})
    exported = client.get('/api/backup/export').text
    assert 'Čapek' in exported and 'Ľúbim' in exported
    with TestClient(create_app(tmp_path / 'other.db')) as other:
        preview = other.post('/api/backup/import?preview=true', content=exported.encode()).json()
        assert preview['created']['books'] == 1
        assert other.get('/api/books').json()['total'] == 0
        assert other.post('/api/backup/import', content=exported.encode()).status_code == 200
        assert yaml.safe_load(other.get('/api/backup/export').text) == yaml.safe_load(exported)
        second = other.post('/api/backup/import', content=exported.encode()).json()
        assert second['created']['books'] == 0 and second['matched']['books'] == 1


def test_remap_ids_and_explicit_overwrite(client):
    client.post('/api/books', json={'author': 'Existing', 'english_title': 'Different'})
    data = {'schema_version': 1, 'books': [{'id': 1, 'author': 'A', 'english_title': 'T', 'owned': True}], 'curated_lists': [{'id': 55, 'name': 'L'}], 'curated_list_entries': [{'id': 9, 'curated_list_id': 55, 'book_id': 1, 'rank': 2}]}
    assert client.post('/api/backup/import', content=yaml.safe_dump(data)).status_code == 200
    b = client.get('/api/books?q=T').json()['items'][0]
    assert b['id'] != 1 and b['owned']
    assert len(client.get(f"/api/books/{b['id']}").json()['lists']) == 1
    data['books'][0]['owned'] = False
    client.post('/api/backup/import', content=yaml.safe_dump(data))
    assert client.get(f"/api/books/{b['id']}").json()['owned']
    client.post('/api/backup/import?mode=update_existing', content=yaml.safe_dump(data))
    assert not client.get(f"/api/books/{b['id']}").json()['owned']


def test_malformed_import_atomic(client):
    examples = [
        'schema_version: 1\nbooks: [',
        'schema_version: 1\nschema_version: 1',
        'schema_version: 1\nbooks: &a [*a]',
        'schema_version: 99',
        'schema_version: 1\nbooks:\n- {id: 1, author: A, english_title: T}\n- {id: 2, author: B}',
        'schema_version: 1\nbooks:\n- {id: 1, author: A, english_title: T, series_id: 99}',
        'schema_version: 1\nbooks:\n- {id: 1, author: A, english_title: T}\n- {id: 2, author: a, english_title: t}',
    ]
    for text in examples:
        response = client.post('/api/backup/import', content=text)
        assert response.status_code == 422, response.text
        assert client.get('/api/books').json()['total'] == 0


def test_conflict_rolls_back_prior_writes(client):
    client.post('/api/lists', json={'name': 'L', 'source_url': 'https://one.example'})
    data = {'schema_version': 1, 'series': [{'id': 1, 'name': 'Should roll back'}], 'curated_lists': [{'id': 1, 'name': 'L', 'source_url': 'https://other.example'}]}
    assert client.post('/api/backup/import', content=yaml.safe_dump(data)).status_code == 409
    assert client.get('/api/series').json() == []
