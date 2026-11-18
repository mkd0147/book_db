import yaml
from fastapi.testclient import TestClient
from app.main import create_app


def test_convert_to_series_and_refresh_preserves_choice_and_books(client):
    payload={'name':'Greatest','source_url':'https://example.org/list','entries':[{'author':'Original Author','english_title':'A Saga','rank':3}]}
    client.post('/api/lists/import',json=payload)
    book=client.get('/api/books').json()['items'][0]
    client.patch(f"/api/books/{book['id']}",json={'owned':True,'rating':5})
    other=client.post('/api/lists',json={'name':'Other'}).json()
    client.post(f"/api/lists/{other['id']}/entries",json={'book_id':book['id'],'rank':7})
    l=client.get('/api/lists').json()[0]
    result=client.post(f"/api/lists/{l['id']}/series-entries",json={'replace_book_id':book['id'],'new_series':{'name':'A Saga','original_author':'Original Author'}})
    assert result.status_code==200,result.text
    entry=result.json()
    assert entry['rank']==3
    assert client.get(f"/api/books/{book['id']}").json()['owned']
    assert len(client.get(f"/api/books/{book['id']}").json()['lists'])==1
    assert client.get(f"/api/series/{entry['series_id']}").json()['original_author']=='Original Author'
    rows=client.get(f"/api/books?curated_list_id={l['id']}&include_series=true&sort=rank").json()
    assert rows['total']==1 and rows['items'][0]['entity_type']=='series'
    assert rows['items'][0]['rank']==3
    payload['entries'][0]['rank']=1
    refreshed=client.post('/api/lists/import',json=payload)
    assert refreshed.status_code==200,refreshed.text
    assert refreshed.json()['series_entries']==1 and refreshed.json()['created_books']==0
    rows=client.get(f"/api/books?curated_list_id={l['id']}&include_series=true&sort=rank").json()
    assert rows['items'][0]['series_id']==entry['series_id'] and rows['items'][0]['rank']==1
    assert client.get('/api/books').json()['total']==1


def test_series_membership_expands_and_statistics_deduplicate(client):
    s=client.post('/api/series',json={'name':'Series','original_author':'Author'}).json()
    l=client.post('/api/lists',json={'name':'List'}).json()
    ids=[]
    for name,pos,owned in [('Volume 2',2,False),('Volume 1',1,True)]:
        ids.append(client.post('/api/books',json={'author':'Author','english_title':name,'series_id':s['id'],'series_position':pos,'owned':owned}).json()['id'])
    client.post(f"/api/lists/{l['id']}/series-entries",json={'series_id':s['id'],'rank':4})
    client.post(f"/api/lists/{l['id']}/entries",json={'book_id':ids[0],'rank':None})
    stats=client.get(f"/api/lists/{l['id']}").json()['stats']
    assert stats['total']==2 and stats['owned']==1 and stats['entries']==2
    rows=client.get(f"/api/books?curated_list_id={l['id']}&series_id={s['id']}&sort=series_position").json()['items']
    assert [b['id'] for b in rows]==ids[::-1]
    assert rows[0]['rank']==4 and rows[1]['rank'] is None
    details=client.get(f'/api/books/{ids[1]}').json()
    assert details['lists'][0]['via_series']
    mixed=client.get(f"/api/books?curated_list_id={l['id']}&include_series=true&sort=rank&limit=1").json()
    assert mixed['total']==2 and mixed['items'][0]['entity_type']=='series'
    assert client.get(f"/api/books?curated_list_id={l['id']}&include_series=true&q=Series").json()['total']==2
    assert client.post(f"/api/lists/{l['id']}/series-entries",json={'series_id':s['id'],'replace_book_id':ids[0]}).status_code==409
    assert client.get(f'/api/books/{ids[0]}').json()['lists']


def test_series_backup_roundtrip(client,tmp_path):
    s=client.post('/api/series',json={'name':'Česká série','original_author':'Čapek'}).json()
    l=client.post('/api/lists',json={'name':'L'}).json()
    client.post(f"/api/lists/{l['id']}/series-entries",json={'series_id':s['id'],'rank':8})
    exported=client.get('/api/backup/export')
    with TestClient(create_app(tmp_path/'restore.db')) as other:
        result=other.post('/api/backup/import',content=exported.content)
        assert result.status_code==200,result.text
        assert yaml.safe_load(other.get('/api/backup/export').text)==yaml.safe_load(exported.text)
        assert other.get('/api/series').json()[0]['original_author']=='Čapek'
    data=yaml.safe_load(exported.text)
    data['curated_series_entries'][0]['series_id']=999
    assert client.post('/api/backup/import',content=yaml.safe_dump(data)).status_code==422
