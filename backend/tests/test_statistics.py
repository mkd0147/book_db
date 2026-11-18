def test_dashboard_counts_and_prices(client):
    assert client.get('/api/statistics').json()['average_rating'] is None
    for title, values in [('A', {'owned': True, 'rating': 0, 'translated_cs': True, 'knihobot_watchlist': True, 'knihobot_wishlist': True, 'expected_price': 10}), ('B', {'read': True, 'rating': 4, 'translated_sk': True, 'knihobot_wishlist': True, 'expected_price': 20}), ('C', {})]:
        client.post('/api/books', json={'author': 'Author', 'english_title': title, **values})
    result = client.get('/api/statistics').json()
    assert result['total'] == 3 and result['unread_owned'] == 1
    assert result['average_rating'] == 2
    assert result['translated'] == 2 and result['untranslated'] == 1
    assert result['watchlist_price'] == 10 and result['wishlist_price'] == 30
    assert result['expected_price_total'] == 30
