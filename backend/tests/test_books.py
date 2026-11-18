def test_create_edit_delete(client):
    response = client.post('/api/books', json={'author': 'Karel Čapek', 'english_title': 'War with the Newts'})
    assert response.status_code == 201
    book = response.json()
    assert book['owned'] is False and book['rating'] is None
    id = book['id']
    assert client.patch(f'/api/books/{id}', json={'owned': True, 'rating': 0}).json()['rating'] == 0
    assert client.get('/api/books?q=capek&owned=true').json()['total'] == 1
    assert client.get('/api/books?owned=false').json()['total'] == 0
    assert client.delete(f'/api/books/{id}').status_code == 204
    assert client.get(f'/api/books/{id}').status_code == 404


def test_validation(client):
    for data in [{}, {'author': 'A'}, {'author': ' ', 'english_title': 'T'}, {'author': 'A', 'english_title': 'T', 'rating': 6}, {'author': 'A', 'english_title': 'T', 'rating': 1.5}]:
        assert client.post('/api/books', json=data).status_code == 422
    id = client.post('/api/books', json={'author': 'A', 'english_title': 'T'}).json()['id']
    for patch in [{'author': None}, {'owned': None}, {'unexpected': True}, {'expected_price': -1}]:
        assert client.patch(f'/api/books/{id}', json=patch).status_code == 422


def test_duplicates(client):
    assert client.post('/api/books', json={'author': 'George Orwell', 'english_title': 'Animal Farm'}).status_code == 201
    assert client.post('/api/books', json={'author': ' george   ORWELL ', 'english_title': 'ANIMAL FARM'}).status_code == 409
    assert client.post('/api/books', json={'author': 'Someone Else', 'english_title': 'Animal Farm'}).status_code == 201


def test_pagination_sort_and_literal_search(client):
    for title in ['Zulu', 'Alpha', '100% book']:
        client.post('/api/books', json={'author': 'A', 'english_title': title})
    result = client.get('/api/books?sort=english_title&limit=1&offset=1').json()
    assert result['total'] == 3 and result['items'][0]['english_title'] == 'Alpha'
    assert client.get('/api/books', params={'q': '%'}).json()['total'] == 1
    assert client.get('/api/books?sort=invalid').status_code == 422


def test_cross_origin_write_rejected(client):
    assert client.post('/api/books', json={'author': 'A', 'english_title': 'B'}, headers={'Origin': 'https://example.org'}).status_code == 403
