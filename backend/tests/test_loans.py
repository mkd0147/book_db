import yaml
from fastapi.testclient import TestClient
from app.main import create_app


def make_book(client, **fields):
    response = client.post('/api/books', json={'author': 'Author', 'english_title': 'Title', 'owned': True, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_collection_search_and_record_loan_does_not_replace_existing_loan(client):
    book = make_book(client, czech_title='Český název')
    assert client.get('/api/books?q=cesky').json()['items'][0]['id'] == book['id']
    assert client.get('/api/loans').json()['total'] == 0
    endpoint = f"/api/books/{book['id']}/loan"
    for payload in [{'borrower': '', 'loan_date': '2026-09-01'}, {'borrower': 'Anna'}, {'borrower': 'Anna', 'loan_date': 123}]:
        assert client.post(endpoint, json=payload).status_code == 422
    response = client.post(endpoint, json={'borrower':'Anna', 'loan_date':'2026-09-01'})
    assert response.status_code == 200, response.text
    assert response.json()['owned'] and response.json()['id'] == book['id']
    assert client.post(endpoint, json={'borrower':'Peter','loan_date':'2026-10-01'}).status_code == 409
    assert client.get('/api/loans').json()['items'][0]['borrower'] == 'Anna'
    client.patch(f"/api/books/{book['id']}", json={'borrower':None, 'loan_date':None}).raise_for_status()
    assert client.post(endpoint, json={'borrower':'Peter','loan_date':'2026-10-01'}).status_code == 200
    history = client.get('/api/loans?status=returned').json()
    assert history['total'] == 1 and history['items'][0]['borrower'] == 'Anna'


def test_lend_edit_return_and_lend_again_preserves_history_and_book(client):
    book = make_book(client, read=True, rating=4)
    path = f"/api/books/{book['id']}"
    lists = [client.post('/api/lists', json={'name': name}).json() for name in ['First', 'Second']]
    for item in lists:
        client.post(f"/api/lists/{item['id']}/entries", json={'book_id': book['id'], 'rank': 1}).raise_for_status()
    assert client.get('/api/loans').json()['total'] == 0
    response = client.patch(path, json={'borrower': '  Žaneta  ', 'loan_date': '2026-09-01'})
    assert response.status_code == 200, response.text
    assert response.json()['borrower'] == 'Žaneta'
    client.patch(path, json={'notes': 'Keep me'})
    for item in lists:
        row = client.get(f"/api/books?curated_list_id={item['id']}").json()['items'][0]
        assert row['id'] == book['id'] and row['borrower'] == 'Žaneta'
    assert client.get('/api/loans?q=zaneta').json()['total'] == 1
    client.patch(path, json={'borrower': 'Žaneta Nová'})
    assert client.get('/api/loans?status=returned').json()['total'] == 0
    response = client.patch(path, json={'borrower': None, 'loan_date': None})
    assert response.status_code == 200, response.text
    assert client.get('/api/loans').json()['total'] == 0
    history = client.get('/api/loans?status=returned').json()['items'][0]
    assert history['borrower'] == 'Žaneta Nová' and history['loan_date'] == '2026-09-01'
    assert history['returned_at'] and history['id'] == book['id']
    client.patch(path, json={'borrower': None, 'loan_date': None})
    assert client.get('/api/loans?status=returned').json()['total'] == 1
    client.patch(path, json={'borrower': 'Peter', 'loan_date': '2026-10-01'})
    assert client.get('/api/loans').json()['items'][0]['borrower'] == 'Peter'
    assert client.get('/api/loans?status=returned&q=zaneta').json()['total'] == 1
    assert client.get('/api/loans?status=returned&q=Peter').json()['total'] == 0
    client.patch(path, json={'borrower': None, 'loan_date': None})
    assert client.get('/api/loans?status=returned').json()['total'] == 2
    saved = client.get(path).json()
    assert saved['owned'] and saved['read'] and saved['rating'] == 4 and saved['notes'] == 'Keep me'
    assert len(saved['lists']) == 2


def test_incomplete_and_invalid_loans_are_rejected_without_losing_data(client):
    book = make_book(client, borrower='Anna', loan_date='2026-09-01')
    path = f"/api/books/{book['id']}"
    for patch in [{'borrower': ''}, {'loan_date': None}, {'loan_date': '2026-02-30'}, {'loan_date': 1234}, {'loan_date': '2026-09-01T00:00:00'}, {'borrower': 'a'*501}]:
        response = client.patch(path, json=patch)
        assert response.status_code == 422, response.text
    saved = client.get(path).json()
    assert saved['borrower'] == 'Anna' and saved['loan_date'] == '2026-09-01'
    assert client.get('/api/loans?status=returned').json()['total'] == 0
    assert client.get('/api/loans?status=invalid').status_code == 422


def test_loans_pagination_and_literal_search(client):
    for index in range(3):
        make_book(client, english_title=f'Book {index}', borrower='A%_B' if index == 1 else 'Other', loan_date=f'2026-09-0{3-index}')
    make_book(client, english_title='Not lent')
    first = client.get('/api/loans?limit=1').json()
    assert first['total'] == 3 and first['items'][0]['english_title'] == 'Book 2'
    assert client.get('/api/loans?limit=1&offset=1').json()['items'][0]['english_title'] == 'Book 1'
    assert client.get('/api/loans', params={'q':'%_'}).json()['total'] == 1


def test_backup_preserves_current_and_returned_loans_and_deduplicates_history(client, tmp_path):
    book = make_book(client, borrower='Anna', loan_date='2026-09-01')
    client.patch(f"/api/books/{book['id']}", json={'borrower': None, 'loan_date': None})
    client.patch(f"/api/books/{book['id']}", json={'borrower': 'Peter', 'loan_date': '2026-10-01'})
    backup = client.get('/api/backup/export').content
    assert yaml.safe_load(backup)['schema_version'] == 7
    with TestClient(create_app(tmp_path / 'restore.db')) as other:
        make_book(other, english_title='Unrelated')
        response = other.post('/api/backup/import?preview=true', content=backup)
        assert response.status_code == 200, response.text
        assert other.get('/api/loans?status=returned').json()['total'] == 0
        for _ in range(2):
            response = other.post('/api/backup/import', content=backup)
            assert response.status_code == 200, response.text
        assert other.get('/api/loans').json()['items'][0]['borrower'] == 'Peter'
        history = other.get('/api/loans?status=returned').json()
        assert history['total'] == 1 and history['items'][0]['borrower'] == 'Anna'
        assert history['items'][0]['id'] != book['id']
        invalid = yaml.safe_load(backup)
        invalid['returned_loans'][0]['book_id'] = 9999
        assert other.post('/api/backup/import', content=yaml.safe_dump(invalid)).status_code == 422
        legacy = {'schema_version':4, 'books':[{'id':88,'author':'Old','english_title':'Legacy'}]}
        assert other.post('/api/backup/import', content=yaml.safe_dump(legacy)).status_code == 200
