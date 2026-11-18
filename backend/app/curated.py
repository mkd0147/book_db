from difflib import SequenceMatcher
from fastapi import HTTPException
from sqlalchemy import delete, select
from .db import normalize, search_normalize
from .models import Book, CuratedList, CuratedListEntry, CuratedSeriesEntry, Series
from .schemas import BookData, ListData, Input
from pydantic import Field, StrictInt


class ImportEntry(Input):
    author: str = Field(min_length=1, max_length=500)
    english_title: str = Field(min_length=1, max_length=1000)
    rank: StrictInt | None = Field(default=None, ge=1)
    book_id: StrictInt | None = None
    create_separate: bool = False
    series_id: StrictInt | None = None


class ListImport(ListData):
    entries: list[ImportEntry] = Field(min_length=1, max_length=10000)


def plan_import(session, data):
    books = session.scalars(select(Book)).all()
    index = {(b.normalized_author, b.normalized_title): b for b in books}
    planned, conflicts, seen = [], [], set()
    target_list = session.scalar(select(CuratedList).where(CuratedList.source_url==data.source_url)) if data.source_url else session.scalar(select(CuratedList).where(CuratedList.name==data.name))
    series_sources = {}
    if target_list:
        for entry in session.scalars(select(CuratedSeriesEntry).where(CuratedSeriesEntry.curated_list_id==target_list.id)):
            series_sources[(normalize(entry.source_author),normalize(entry.source_title))] = session.get(Series,entry.series_id)
    for i, entry in enumerate(data.entries):
        BookData(author=entry.author, english_title=entry.english_title)
        key = (normalize(entry.author), normalize(entry.english_title))
        if key in seen:
            raise HTTPException(422, f'Duplicate source entry at entries[{i}]')
        seen.add(key)
        if entry.series_id is not None or (key in series_sources and entry.book_id is None and not entry.create_separate):
            if entry.book_id is not None or entry.create_separate:
                raise HTTPException(422,'Choose a book or series target, not both.')
            series = session.get(Series,entry.series_id) if entry.series_id is not None else series_sources[key]
            if series is None: raise HTTPException(422,f'Unknown series at entries[{i}]')
            planned.append((entry,series))
            continue
        matched = index.get(key)
        if entry.book_id is not None:
            chosen = session.get(Book, entry.book_id)
            if chosen is None:
                raise HTTPException(422, f'Unknown book_id at entries[{i}]')
            if matched and matched.id != chosen.id:
                raise HTTPException(409, f'Explicit link conflicts with exact match at entries[{i}]')
            matched = chosen
        if matched is None and not entry.create_separate:
            candidates = []
            for b in books:
                author_score = SequenceMatcher(None, search_normalize(entry.author), search_normalize(b.author)).ratio()
                title_score = SequenceMatcher(None, search_normalize(entry.english_title), search_normalize(b.english_title)).ratio()
                if (author_score >= .84 and title_score >= .78) or (title_score == 1 and author_score >= .55):
                    candidates.append({'id': b.id, 'author': b.author, 'english_title': b.english_title})
            if candidates:
                conflicts.append({'index': i, 'entry': entry.model_dump(), 'candidates': candidates})
        planned.append((entry, matched))
    if conflicts:
        raise HTTPException(409, {'message': 'Possible duplicates need review. Link a book_id or explicitly set create_separate for each entry, then retry.', 'conflicts': conflicts})
    linked = [(type(b).__name__,b.id) for _, b in planned if b]
    if len(linked) != len(set(linked)):
        raise HTTPException(422, 'Multiple entries link to the same canonical book.')
    return planned


def import_list(session, data):
    planned = plan_import(session, data)
    target = session.scalar(select(CuratedList).where(CuratedList.source_url == data.source_url)) if data.source_url else None
    if target is None:
        target = session.scalar(select(CuratedList).where(CuratedList.name == data.name))
        if target and target.source_url != data.source_url:
            raise HTTPException(409, 'This list name already belongs to a different source.')
    created = 0
    if target is None:
        target = CuratedList(**data.model_dump(exclude={'entries'}))
        session.add(target)
        session.flush()
    else:
        for key, value in data.model_dump(exclude={'entries'}).items():
            setattr(target, key, value)
    session.execute(delete(CuratedListEntry).where(CuratedListEntry.curated_list_id == target.id))
    session.execute(delete(CuratedSeriesEntry).where(CuratedSeriesEntry.curated_list_id == target.id))
    series_count=0
    for entry, book in planned:
        if isinstance(book,Series):
            session.add(CuratedSeriesEntry(curated_list_id=target.id,series_id=book.id,rank=entry.rank,source_author=entry.author,source_title=entry.english_title))
            series_count+=1
            continue
        if book is None:
            book = Book(author=entry.author, english_title=entry.english_title)
            session.add(book)
            session.flush()
            created += 1
        session.add(CuratedListEntry(curated_list_id=target.id, book_id=book.id, rank=entry.rank, source_author=entry.author, source_title=entry.english_title))
    session.flush()
    return {'id': target.id, 'name': target.name, 'entries': len(planned), 'created_books': created, 'reused_books': len(planned)-created-series_count, 'series_entries':series_count}
