def test_memberships_stats_and_cascade(client):
    b = client.post('/api/books', json={'author': 'A', 'english_title': 'T', 'owned': True, 'translated_sk': True}).json()
    for name in ['One', 'Two']:
        l = client.post('/api/lists', json={'name': name}).json()
        assert client.post(f"/api/lists/{l['id']}/entries", json={'book_id': b['id'], 'rank': 3}).status_code == 201
        assert client.post(f"/api/lists/{l['id']}/entries", json={'book_id': b['id']}).status_code == 409
        stats = client.get(f"/api/lists/{l['id']}").json()['stats']
        assert stats['total'] == stats['owned'] == stats['translated'] == 1
        assert stats['owned_percentage'] == 100
    assert client.get('/api/books').json()['total'] == 1
    assert len(client.get(f"/api/books/{b['id']}").json()['lists']) == 2
    client.patch(f"/api/books/{b['id']}", json={'read': True})
    assert all(l['stats']['read'] == 1 for l in client.get('/api/lists').json())
    client.delete(f"/api/books/{b['id']}")
    assert all(l['stats']['total'] == 0 for l in client.get('/api/lists').json())


def test_refresh_preserves_metadata(client):
    source = {'name': 'List', 'source_url': 'https://example.org/list', 'entries': [{'author': 'A', 'english_title': 'T', 'rank': 1}, {'author': 'B', 'english_title': 'Other', 'rank': 2}]}
    assert client.post('/api/lists/import', json=source).json()['created_books'] == 2
    b = client.get('/api/books?q=T&sort=author').json()['items'][0]
    personal = {'owned': True, 'read': True, 'rating': 5, 'translated_cs': True, 'czech_title': 'Český', 'knihobot_wishlist': True, 'expected_price': 12.5}
    client.patch(f"/api/books/{b['id']}", json=personal)
    source['entries'] = [{'author': 'a', 'english_title': 't', 'rank': 2}]
    result = client.post('/api/lists/import', json=source).json()
    assert result['created_books'] == 0 and result['entries'] == 1
    after = client.get(f"/api/books/{b['id']}").json()
    assert all(after[k] == v for k, v in personal.items())
    assert after['lists'][0]['rank'] == 2
    assert client.get('/api/books').json()['total'] == 2


def test_uncertain_match_requires_resolution_and_atomicity(client):
    b = client.post('/api/books', json={'author': 'George Orwell', 'english_title': 'Nineteen Eighty-Four'}).json()
    source = {'name': 'List', 'entries': [{'author': 'New', 'english_title': 'New'}, {'author': 'George Orwell', 'english_title': 'Nineteen Eighty Four'}]}
    result = client.post('/api/lists/import', json=source)
    assert result.status_code == 409
    assert client.get('/api/books').json()['total'] == 1
    assert client.get('/api/lists').json() == []
    source['entries'][1]['book_id'] = b['id']
    assert client.post('/api/lists/import', json=source).status_code == 200


def test_imported_lists_are_ranked_views_of_one_book(client):
    list_ids = []
    for name, rank in [('Greatest Novels', 12), ('Greatest Fantasy', 4)]:
        response = client.post('/api/lists/import', json={
            'name': name,
            'entries': [{'author': 'George Orwell', 'english_title': 'Animal Farm', 'rank': rank}],
        })
        assert response.status_code == 200
        result = response.json()
        assert result['created_books'] == (1 if not list_ids else 0)
        list_ids.append(result['id'])

    def view(list_id):
        return client.get('/api/books', params={
            'curated_list_id': list_id, 'sort': 'rank',
        }).json()['items'][0]

    first, second = [view(id) for id in list_ids]
    assert first['id'] == second['id']
    assert (first['rank'], second['rank']) == (12, 4)
    assert client.get('/api/books').json()['total'] == 1

    changes = {'owned': True, 'read': True, 'rating': 5,
               'knihobot_watchlist': True, 'notes': 'Shared across every view'}
    assert client.patch(f"/api/books/{first['id']}", json=changes).status_code == 200
    collection = client.get('/api/books').json()['items'][0]
    for book in [collection, *[view(id) for id in list_ids]]:
        assert book['id'] == first['id']
        assert all(book[key] == value for key, value in changes.items())

    # Removing a view does not remove the shared work or the other membership.
    assert client.delete(f'/api/lists/{list_ids[0]}').status_code == 204
    assert view(list_ids[1])['id'] == first['id']
    assert client.get('/api/books').json()['total'] == 1


def test_short_story_review_links_variants_but_keeps_different_work(client):
    novels = [
        ('Robert Louis Stevenson', 'The Strange Case of Dr. Jekyll and Mr. Hyde'),
        ('Leo Tolstoy', 'The Death of Ivan Ilyich'),
        ('Graham Greene', 'The End of the Affair'),
    ]
    result = client.post('/api/lists/import', json={'name': 'Novels', 'entries': [
        {'author': author, 'english_title': title} for author, title in novels
    ]})
    assert result.status_code == 200
    books = {b['author']: b for b in client.get('/api/books').json()['items']}
    tolstoy_id = books['Leo Tolstoy']['id']
    client.patch(f'/api/books/{tolstoy_id}', json={'owned': True, 'rating': 5})
    source = {'name': 'Short Stories', 'entries': [
        {'author': 'Robert Louis Stevenson', 'english_title': 'The Strange Case of Dr Jekyll and Mr Hyde'},
        {'author': 'Leo Tolstoy', 'english_title': 'The Death of Ivan Ilych'},
        {'author': 'Graham Greene', 'english_title': 'The End of The Party'},
    ]}
    response = client.post('/api/lists/import', json=source)
    assert response.status_code == 409
    conflicts = response.json()['detail']['conflicts']
    assert [c['index'] for c in conflicts] == [0, 1, 2]
    assert conflicts[2]['candidates'][0]['english_title'] == 'The End of the Affair'
    assert client.get('/api/books').json()['total'] == 3
    source['entries'][0]['book_id'] = books['Robert Louis Stevenson']['id']
    source['entries'][1]['book_id'] = tolstoy_id
    source['entries'][2]['create_separate'] = True
    result = client.post('/api/lists/import', json=source).json()
    assert result['created_books'] == 1 and result['reused_books'] == 2
    assert client.get('/api/books').json()['total'] == 4
    tolstoy = client.get(f'/api/books/{tolstoy_id}').json()
    assert tolstoy['owned'] and tolstoy['rating'] == 5
    assert len(tolstoy['lists']) == 2


def test_parser():
    import pytest
    from app.importers.digitaldreamdoor import parse_html
    url = 'https://www.digitaldreamdoor.com/pages/books/example.html'
    for html in ['<h1>2 Greatest Books</h1><div class="list">1.<span> Title </span>by Čapek<br>2. Second - by Author</div>', '<h1>2 Greatest Books</h1><div class="list"><span>1.</span> Title<span> - by Čapek</span><br><span>2.</span> Second - by Author</div>']:
        result = parse_html(html, url)
        assert len(result.entries) == 2
        assert result.entries[0].author == 'Čapek'
        assert result.entries[0].english_title == 'Title'
    for html in ['<h1>2 Greatest Books</h1><div class="list">1. Title by Author</div>', '<h1>List</h1><div class="list">1. Missing author</div>']:
        with pytest.raises(ValueError):
            parse_html(html, url)
