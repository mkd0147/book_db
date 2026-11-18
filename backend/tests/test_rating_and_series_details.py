import yaml
from fastapi.testclient import TestClient
from app.main import create_app


def test_inline_rating_requires_read_and_preserves_previous_rating(client):
    id=client.post('/api/books',json={'author':'A','english_title':'Title'}).json()['id']
    path=f'/api/books/{id}/rating'
    assert client.patch(path,json={'rating':5}).status_code==409
    assert client.get(f'/api/books/{id}').json()['rating'] is None
    client.patch(f'/api/books/{id}',json={'read':True})
    for value in [0,5,None]:
        response=client.patch(path,json={'rating':value})
        assert response.status_code==200 and response.json()['rating']==value
    for value in [6,-1,2.5,True]:
        assert client.patch(path,json={'rating':value}).status_code==422
    client.patch(path,json={'rating':4})
    client.patch(f'/api/books/{id}',json={'read':False})
    assert client.patch(path,json={'rating':1}).status_code==409
    assert client.get(f'/api/books/{id}').json()['rating']==4


def test_series_details_shared_searchable_and_backed_up(client,tmp_path):
    s=client.post('/api/series',json={'name':'Original name','original_author':'First author'}).json()
    b=client.post('/api/books',json={'author':'Volume author','english_title':'Volume','series_id':s['id']}).json()
    l=client.post('/api/lists',json={'name':'L'}).json()
    client.post(f"/api/lists/{l['id']}/series-entries",json={'series_id':s['id'],'rank':1})
    data={'name':'New name','original_author':'Original author','czech_name':'Česká série','slovak_name':'Slovenská séria','notes':'Notes'}
    response=client.patch(f"/api/series/{s['id']}",json=data)
    assert response.status_code==200,response.text
    assert all(response.json()[key]==value for key,value in data.items())
    assert client.get(f"/api/books/{b['id']}").json()['author']=='Volume author'
    assert client.get('/api/books?q=ceska').json()['total']==1
    row=client.get(f"/api/books?curated_list_id={l['id']}&include_series=true&q=slovenska").json()['items'][0]
    assert row['author']=='Original author' and row['czech_title']=='Česká série'
    assert row['slovak_title']=='Slovenská séria'
    exported=client.get('/api/backup/export')
    assert yaml.safe_load(exported.text)['schema_version']==7
    with TestClient(create_app(tmp_path/'restore.db')) as other:
        assert other.post('/api/backup/import',content=exported.content).status_code==200
        assert yaml.safe_load(other.get('/api/backup/export').text)==yaml.safe_load(exported.text)
    client.patch(f"/api/series/{s['id']}",json={'name':'New name','czech_name':''})
    after=client.get(f"/api/series/{s['id']}").json()
    assert after['czech_name'] is None and after['slovak_name']=='Slovenská séria'
