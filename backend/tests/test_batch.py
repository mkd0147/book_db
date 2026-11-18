def test_batch_updates_shared_books_atomically(client):
    ids = [client.post('/api/books', json={'author':'A', 'english_title':title}).json()['id'] for title in ['First','Second','Untouched']]
    response=client.patch('/api/books/batch', json={'ids':ids[:2], 'changes':{'owned':True,'read':True,'translated':True,'knihobot_wishlist':True}})
    assert response.status_code == 200, response.text
    assert response.json()['updated'] == 2
    for id in ids[:2]:
        b=client.get(f'/api/books/{id}').json()
        assert b['owned'] and b['read'] and b['translated_cs_sk'] and b['knihobot_wishlist']
        assert not b['translated_cs'] and not b['translated_sk']
    assert not client.get(f'/api/books/{ids[2]}').json()['owned']
    assert client.get('/api/books?translated=true&sort=translated').json()['total'] == 2
    assert client.get('/api/statistics').json()['translated'] == 2
    for changes in [{'owned':None},{'read':'yes'},{'rating':6},{'author':'Change identity'},{'translated':None}]:
        assert client.patch('/api/books/batch',json={'ids':ids[:2],'changes':changes}).status_code==422
    assert client.patch('/api/books/batch',json={'ids':[ids[0],9999],'changes':{'owned':False}}).status_code==404
    assert client.get(f'/api/books/{ids[0]}').json()['owned']


def test_combined_translation_preserves_language_details(client):
    id=client.post('/api/books',json={'author':'A','english_title':'B','translated_sk':True,'slovak_title':'Názov'}).json()['id']
    client.patch('/api/books/batch',json={'ids':[id],'changes':{'translated':True}})
    assert client.get(f'/api/books/{id}').json()['translated_sk']
    client.patch('/api/books/batch',json={'ids':[id],'changes':{'translated':False}})
    b=client.get(f'/api/books/{id}').json()
    assert b['translated_sk'] and not b['translated_cs'] and not b['translated_cs_sk']
    assert b['slovak_title']=='Názov'
    exported=client.get('/api/backup/export')
    assert 'schema_version: 7' in exported.text
    assert client.post('/api/backup/import?preview=true',content=exported.content).status_code==200
