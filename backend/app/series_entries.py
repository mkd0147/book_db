from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, StrictInt, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .main import get_session, require, record
from .models import Series, Book, CuratedList, CuratedListEntry, CuratedSeriesEntry
from .schemas import Input, SeriesData
from .stats import statistics

router = APIRouter(prefix='/api/lists')

class SeriesEntryData(Input):
    series_id: StrictInt | None = None
    new_series: SeriesData | None = None
    replace_book_id: StrictInt | None = None
    replace_series_id: StrictInt | None = None
    rank: StrictInt | None = Field(default=None, ge=1)

    @model_validator(mode='after')
    def one_target(self):
        if (self.series_id is None) == (self.new_series is None):
            raise ValueError('Choose an existing series or create a new series.')
        if self.replace_book_id is not None and self.replace_series_id is not None:
            raise ValueError('Choose only one entry to replace.')
        return self

@router.post('/{id}/series-entries')
def assign_series(id:int, data:SeriesEntryData, session:Session=Depends(get_session)):
    require(session,CuratedList,id)
    previous = None
    if data.replace_book_id is not None:
        previous=session.scalar(select(CuratedListEntry).where(CuratedListEntry.curated_list_id==id,CuratedListEntry.book_id==data.replace_book_id))
    elif data.replace_series_id is not None:
        previous=session.scalar(select(CuratedSeriesEntry).where(CuratedSeriesEntry.curated_list_id==id,CuratedSeriesEntry.series_id==data.replace_series_id))
    if (data.replace_book_id is not None or data.replace_series_id is not None) and previous is None:
        raise HTTPException(404,'The entry is no longer in this list.')
    target = require(session,Series,data.series_id) if data.series_id is not None else Series(**data.new_series.model_dump())
    if target.id and session.scalar(select(CuratedSeriesEntry).where(CuratedSeriesEntry.curated_list_id==id,CuratedSeriesEntry.series_id==target.id,CuratedSeriesEntry.id!=(previous.id if isinstance(previous,CuratedSeriesEntry) else -1))):
        raise HTTPException(409,'This series is already in the list. No changes were made.')
    try:
        session.add(target)
        session.flush()
        rank=previous.rank if previous is not None and 'rank' not in data.model_fields_set else data.rank
        source_title=previous.source_title if previous else target.name
        source_author=previous.source_author if previous else target.original_author
        if previous and isinstance(previous,CuratedListEntry):
            book=require(session,Book,previous.book_id)
            source_title=source_title or book.english_title
            source_author=source_author or book.author
        if previous:
            session.delete(previous)
            session.flush()
        entry=CuratedSeriesEntry(curated_list_id=id,series_id=target.id,rank=rank,source_title=source_title,source_author=source_author)
        session.add(entry)
        session.commit()
        return record(entry)
    except IntegrityError:
        session.rollback()
        raise HTTPException(409,'Series name or membership already exists. No changes were made.')

@router.delete('/{id}/series-entries/{series_id}',status_code=204)
def remove_series_entry(id:int,series_id:int,session:Session=Depends(get_session)):
    entry=session.scalar(select(CuratedSeriesEntry).where(CuratedSeriesEntry.curated_list_id==id,CuratedSeriesEntry.series_id==series_id))
    if entry is None: raise HTTPException(404,'Membership not found')
    session.delete(entry);session.commit()

def list_series_rows(session,list_id):
    result=[]
    for series,entry in session.execute(select(Series,CuratedSeriesEntry).join(CuratedSeriesEntry,CuratedSeriesEntry.series_id==Series.id).where(CuratedSeriesEntry.curated_list_id==list_id)):
        s=statistics(session,series_id=series.id)
        result.append(dict(id=-series.id,entity_type='series',entry_id=entry.id,series_id=series.id,series_name=series.name,
            author=series.original_author or '',english_title=series.name,czech_title=series.czech_name,slovak_title=series.slovak_name,rank=entry.rank,series_position=None,
            owned=s['total']>0 and s['owned']==s['total'],read=s['total']>0 and s['read']==s['total'],
            translated_cs_sk=s['translated']>0,knihobot_watchlist=s['watchlist']>0,knihobot_wishlist=s['wishlist']>0,
            rating=None,expected_price=None,stats=s,notes=series.notes))
    return result
