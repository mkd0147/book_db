from datetime import date, timedelta
import yaml
from fastapi.testclient import TestClient
from app.main import create_app


def book(client, title='Book', **fields):
    response = client.post('/api/books', json={'english_title':title, 'author':'Author', **fields})
    assert response.status_code == 201, response.text
    return response.json()


def start(client, id, day=None):
    response = client.post('/api/reading', json={'book_id':id})
    assert response.status_code == 201, response.text
    item = response.json()
    assert item['started_on'] is None
    response = mark(client, item['id'], day or date.today(), 'start')
    assert response.status_code == 200, response.text
    return response.json()


def mark(client, id, day, action='read'):
    return client.post(f'/api/reading/{id}/days', json={'day':day.isoformat(), 'action':action})


def calendar(client, day=None):
    day = day or date.today()
    return client.get('/api/reading', params={'from_date':(day-timedelta(days=31)).isoformat(), 'to_date':day.isoformat()}).json()['items']


def test_parallel_reading_days_completion_and_stopping(client):
    first = book(client, 'First', page_count=300, owned=True, rating=3)
    second = book(client, 'Second', page_count=180)
    a, b = start(client,first['id'], date.today()-timedelta(days=1)), start(client,second['id'])
    today = date.today()
    yesterday = today-timedelta(days=1)
    assert len(calendar(client)) == 2
    assert client.post('/api/reading',json={'book_id':first['id']}).status_code == 409
    for _ in range(2):
        assert mark(client,a['id'],yesterday).status_code == 200
    assert mark(client,b['id'],today).status_code == 200
    assert mark(client,a['id'],today,'complete').status_code == 200
    assert mark(client,b['id'],today,'stop').status_code == 200
    first_saved = client.get(f"/api/books/{first['id']}").json()
    second_saved = client.get(f"/api/books/{second['id']}").json()
    assert first_saved['read'] and first_saved['owned'] and first_saved['rating'] == 3
    assert not second_saved['read']
    history = first_saved['reading_history'][0]
    assert history['reading_days'] == [yesterday.isoformat(), today.isoformat()]
    assert history['started_on'] == yesterday.isoformat() and history['ended_on'] == today.isoformat()
    assert history['status'] == 'completed'
    assert second_saved['reading_history'][0]['status'] == 'stopped'
    assert mark(client,a['id'],today).status_code == 409
    reread = start(client,first['id'])
    assert mark(client,reread['id'],today,'stop').status_code == 200
    saved = client.get(f"/api/books/{first['id']}").json()
    assert saved['read'] and len(saved['reading_history']) == 2


def test_backdating_undo_future_and_invalid_dates(client):
    item = start(client,book(client)['id'], date.today()-timedelta(days=60))
    today = date.today()
    earlier = today-timedelta(days=60)
    assert mark(client,item['id'],today+timedelta(days=1)).status_code == 422
    for value in ['2026-02-30', 1234, '2026-09-01T00:00:00']:
        assert client.post(f"/api/reading/{item['id']}/days",json={'day':value,'action':'read'}).status_code == 422
    assert mark(client,item['id'],earlier).status_code == 200
    assert mark(client,item['id'],today).status_code == 200
    assert mark(client,item['id'],earlier,'stop').status_code == 422
    assert mark(client,item['id'],today,'remove').status_code == 200
    assert mark(client,item['id'],earlier,'stop').status_code == 200
    assert not calendar(client)
    historic = calendar(client,earlier)[0]
    assert historic['reading_days'] == [earlier.isoformat()]


def test_page_count_validation_and_existing_book_attributes(client):
    item = book(client,page_count=450,read=True)
    for value in [0,-1,2.5,True,'300']:
        assert client.patch(f"/api/books/{item['id']}",json={'page_count':value}).status_code == 422
    response = client.patch(f"/api/books/{item['id']}",json={'page_count':None})
    assert response.status_code == 200 and response.json()['read']
    assert response.json()['page_count'] is None


def test_reading_backup_restores_history_and_remaps_book_ids(client,tmp_path):
    item = book(client,page_count=300)
    reading = start(client,item['id'])
    mark(client,reading['id'],date.today(),'complete').raise_for_status()
    client.post('/api/reading', json={'book_id':item['id']}).raise_for_status()
    backup = client.get('/api/backup/export').content
    data = yaml.safe_load(backup)
    assert data['schema_version'] == 7
    with TestClient(create_app(tmp_path/'restored.db')) as other:
        book(other,'Other')
        assert other.post('/api/backup/import?preview=true',content=backup).status_code == 200
        assert calendar(other) == []
        for _ in range(2):
            response = other.post('/api/backup/import',content=backup)
            assert response.status_code == 200, response.text
        restored = calendar(other)
        assert len(restored) == 2 and restored[0]['book_id'] != item['id']
        assert restored[0]['book']['page_count'] == 300 and restored[0]['book']['read']
        assert restored[0]['status'] == 'completed' and restored[1]['status'] == 'active'
        assert restored[1]['started_on'] is None
        before = other.get('/api/backup/export').content
        data['reading_sessions'][0]['book_id'] = 9999
        assert other.post('/api/backup/import',content=yaml.safe_dump(data)).status_code == 422
        assert other.get('/api/backup/export').content == before


def test_backup_rejects_invalid_reading_timeline(client):
    item = book(client)
    reading = start(client,item['id'])
    mark(client,reading['id'],date.today(),'complete')
    original = yaml.safe_load(client.get('/api/backup/export').content)
    for changes in [{'reading_days':[]}, {'ended_on':None}, {'started_on':'9999-01-01'}]:
        payload = {**original,'reading_sessions':[{**original['reading_sessions'][0],**changes}]}
        assert client.post('/api/backup/import',content=yaml.safe_dump(payload)).status_code == 422


def test_reopen_completion_and_fill_missing_days(client):
    b = book(client, page_count=300)
    item = start(client, b['id'], date.today()-timedelta(days=5))
    today = date.today()
    first = today - timedelta(days=5)
    missing = today - timedelta(days=2)
    mark(client, item['id'], first)
    mark(client, item['id'], today, 'complete')
    url = f"/api/reading/{item['id']}/reopen"
    reopened = client.post(url)
    assert reopened.status_code == 200
    assert reopened.json()['status'] == 'active'
    assert reopened.json()['ended_on'] is None
    assert reopened.json()['reading_days'] == [first.isoformat(), today.isoformat()]
    assert client.post(url).status_code == 409
    assert mark(client, item['id'], missing).status_code == 200
    assert mark(client, item['id'], today, 'complete').status_code == 200
    saved = client.get(f"/api/books/{b['id']}").json()
    assert saved['read']
    assert len(saved['reading_history']) == 1
    assert saved['reading_history'][0]['reading_days'] == [first.isoformat(), missing.isoformat(), today.isoformat()]
    reread = start(client, b['id'])
    assert client.post(url).status_code == 409
    assert client.get(f"/api/books/{b['id']}").json()['reading_history'][1]['status'] == 'completed'
    assert mark(client, reread['id'], today, 'stop').status_code == 200
    assert client.post(f"/api/reading/{reread['id']}/reopen").status_code == 409
    assert client.post(url).status_code == 200
    assert client.post('/api/reading/999999/reopen').status_code == 404


def test_explicit_start_undo_and_day_boundaries(client):
    b = book(client)
    queued = client.post('/api/reading', json={'book_id':b['id']}).json()
    id = queued['id']
    today = date.today()
    earlier = today-timedelta(days=3)
    assert queued['started_on'] is None and queued['reading_days'] == []
    assert calendar(client)[0]['id'] == id
    for action in ['read','remove','stop','complete']:
        assert mark(client,id,today,action).status_code == 409
    assert mark(client,id,today+timedelta(days=1),'start').status_code == 422
    assert mark(client,id,earlier,'start').status_code == 200
    assert mark(client,id,earlier,'start').status_code == 409
    for action in ['read','remove','stop','complete']:
        assert mark(client,id,earlier-timedelta(days=1),action).status_code == 422
    assert mark(client,id,earlier,'remove').status_code == 200
    assert mark(client,id,today,'read').status_code == 200
    undone = mark(client,id,earlier,'undo_start')
    assert undone.status_code == 200
    assert undone.json()['started_on'] is None
    assert undone.json()['reading_days'] == [today.isoformat()]
    assert mark(client,id,today,'complete').status_code == 409
    payload = client.get('/api/backup/export').content
    assert client.post('/api/backup/import?preview=true', content=payload).status_code == 200
    assert mark(client,id,earlier,'start').status_code == 200
    assert mark(client,id,today,'remove').status_code == 200
    assert mark(client,id,earlier,'complete').status_code == 200


def test_replacement_start_cannot_skip_preserved_days(client):
    today = date.today()
    first = today-timedelta(days=4)
    item = start(client,book(client)['id'],first)
    mark(client,item['id'],today-timedelta(days=2))
    mark(client,item['id'],first,'undo_start')
    assert mark(client,item['id'],today,'start').status_code == 422
    assert mark(client,item['id'],first-timedelta(days=1),'start').status_code == 200
