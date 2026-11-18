def test_series_stats_order_and_deletion(client):
    series = client.post('/api/series', json={'name': 'A series', 'notes': 'Notes'}).json()
    id = series['id']
    assert client.get(f'/api/series/{id}').json()['stats']['owned_percentage'] == 0
    for title, position, cs, sk, owned, read in [('Third', 3, True, True, True, False), ('First', 1, True, False, True, True), ('Middle', 1.5, False, False, False, False)]:
        assert client.post('/api/books', json={'author': 'A', 'english_title': title, 'series_id': id, 'series_position': position, 'translated_cs': cs, 'translated_sk': sk, 'owned': owned, 'read': read}).status_code == 201
    stats = client.get(f'/api/series/{id}').json()['stats']
    assert stats['total'] == 3 and stats['translated_cs'] == 2 and stats['translated_sk'] == 1
    assert stats['translated'] == 2 and stats['owned_percentage'] == 66.7 and stats['read_percentage'] == 33.3
    books = client.get(f'/api/books?series_id={id}&sort=series_position').json()['items']
    assert [b['english_title'] for b in books] == ['First', 'Middle', 'Third']
    assert len(client.get(f"/api/books/{books[0]['id']}").json()['series_books']) == 3
    assert client.patch(f'/api/series/{id}', json={'name': 'Renamed', 'notes': 'New'}).status_code == 200
    assert client.get('/api/books?q=renamed').json()['total'] == 3
    assert client.delete(f'/api/series/{id}').status_code == 204
    assert client.get('/api/books').json()['total'] == 3
    assert all(b['series_id'] is None for b in client.get('/api/books').json()['items'])


def test_assign_existing_book(client):
    b = client.post('/api/books', json={'author': 'A', 'english_title': 'T'}).json()
    assert client.patch(f"/api/books/{b['id']}", json={'series_id': 99}).status_code == 404
    s = client.post('/api/series', json={'name': 'S'}).json()
    assert client.patch(f"/api/books/{b['id']}", json={'series_id': s['id'], 'series_position': 0.5}).status_code == 200
