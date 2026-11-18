"""Versioned UTF-8 YAML backups with atomic, reference-remapping imports."""
from datetime import datetime
from typing import Literal
import yaml
from pydantic import Field, StrictInt, ValidationError
from sqlalchemy import select
from fastapi import HTTPException
from .db import normalize
from .models import Book, Series, CuratedList, CuratedListEntry, CuratedSeriesEntry, ReturnedLoan, ReadingSession
from datetime import date
from .schemas import BookData, SeriesData, ListData, EntryData, Input, ReadingSessionData


class BackupBook(BookData):
    id: StrictInt = Field(ge=1)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BackupSeries(SeriesData):
    id: StrictInt = Field(ge=1)


class BackupList(ListData):
    id: StrictInt = Field(ge=1)


class BackupEntry(EntryData):
    id: StrictInt = Field(ge=1)
    curated_list_id: StrictInt = Field(ge=1)


class BackupSeriesEntry(Input):
    id: StrictInt = Field(ge=1)
    curated_list_id: StrictInt = Field(ge=1)
    series_id: StrictInt = Field(ge=1)
    rank: StrictInt | None = Field(default=None,ge=1)
    source_title: str | None = None
    source_author: str | None = None


class BackupReturnedLoan(Input):
    id: StrictInt = Field(ge=1)
    event_id: str = Field(min_length=1, max_length=36)
    book_id: StrictInt = Field(ge=1)
    borrower: str = Field(min_length=1, max_length=500)
    loan_date: date
    returned_at: datetime


class BackupReadingSession(ReadingSessionData):
    id: StrictInt = Field(ge=1)


class Backup(Input):
    schema_version: Literal[1, 2, 3, 4, 5, 6, 7]
    reading_sessions: list[BackupReadingSession] = Field(default_factory=list, max_length=200000)
    returned_loans: list[BackupReturnedLoan] = Field(default_factory=list, max_length=200000)
    series: list[BackupSeries] = Field(default_factory=list, max_length=50000)
    books: list[BackupBook] = Field(default_factory=list, max_length=100000)
    curated_lists: list[BackupList] = Field(default_factory=list, max_length=10000)
    curated_list_entries: list[BackupEntry] = Field(default_factory=list, max_length=200000)
    curated_series_entries: list[BackupSeriesEntry] = Field(default_factory=list,max_length=50000)


class BackupLoader(yaml.SafeLoader):
    def compose_node(self, parent, index):
        if self.check_event(yaml.AliasEvent):
            raise ValueError('YAML aliases are not supported in backups.')
        return super().compose_node(parent, index)

    def construct_mapping(self, node, deep=False):
        result = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, (str, int)):
                raise ValueError('YAML mapping keys must be strings or integers.')
            if key in result:
                raise ValueError(f'Duplicate YAML key: {key}')
            result[key] = self.construct_object(value_node, deep=deep)
        return result


def parse_backup(text):
    try:
        data = Backup.model_validate(yaml.load(text, Loader=BackupLoader))
    except ValidationError as error:
        raise HTTPException(422, error.errors(include_context=False, include_input=False))
    except (yaml.YAMLError, ValueError, RecursionError) as error:
        raise HTTPException(422, 'Malformed YAML: ' + str(error)[:1000])
    ids = {}
    for name in ('series', 'books', 'curated_lists', 'curated_list_entries', 'curated_series_entries', 'returned_loans', 'reading_sessions'):
        rows = getattr(data, name)
        ids[name] = {r.id for r in rows}
        if len(ids[name]) != len(rows):
            raise HTTPException(422, f'Duplicate IDs in {name}')
    reading_events, active_books = set(), set()
    for item in data.reading_sessions:
        if item.book_id not in ids['books']:
            raise HTTPException(422, 'Reading history references a missing book.')
        if item.event_id in reading_events or item.status == 'active' and item.book_id in active_books:
            raise HTTPException(422, 'Duplicate reading session or active book.')
        reading_events.add(item.event_id)
        if item.status == 'active':
            active_books.add(item.book_id)
    events = set()
    for loan in data.returned_loans:
        if loan.book_id not in ids['books']:
            raise HTTPException(422, 'Returned loan references a missing book.')
        if loan.event_id in events:
            raise HTTPException(422, 'Duplicate returned loan event.')
        events.add(loan.event_id)
    identities = [(normalize(b.author), normalize(b.english_title)) for b in data.books]
    if len(identities) != len(set(identities)):
        raise HTTPException(422, 'Duplicate normalized author/title combinations in books')
    for name in ('series', 'curated_lists'):
        names = [r.name for r in getattr(data, name)]
        if len(set(names)) != len(names):
            raise HTTPException(422, f'Duplicate names in {name}')
    urls = [l.source_url for l in data.curated_lists if l.source_url]
    if len(urls) != len(set(urls)):
        raise HTTPException(422, 'Duplicate curated list source URLs')
    for i, b in enumerate(data.books):
        if b.series_id is not None and b.series_id not in ids['series']:
            raise HTTPException(422, f'books[{i}].series_id references a missing series')
    memberships = set()
    for i, entry in enumerate(data.curated_list_entries):
        if entry.book_id not in ids['books'] or entry.curated_list_id not in ids['curated_lists']:
            raise HTTPException(422, f'curated_list_entries[{i}] references a missing book or list')
        key = (entry.curated_list_id, entry.book_id)
        if key in memberships:
            raise HTTPException(422, f'Duplicate membership at curated_list_entries[{i}]')
        memberships.add(key)
    series_memberships=set()
    for i,entry in enumerate(data.curated_series_entries):
        if entry.series_id not in ids['series'] or entry.curated_list_id not in ids['curated_lists']:
            raise HTTPException(422,f'curated_series_entries[{i}] references a missing series or list')
        key=(entry.curated_list_id,entry.series_id)
        if key in series_memberships: raise HTTPException(422,f'Duplicate series membership at curated_series_entries[{i}]')
        series_memberships.add(key)
    return data


def export_yaml(session):
    from .main import record
    data = {'schema_version': 7}
    for name, model in [('series', Series), ('books', Book), ('curated_lists', CuratedList), ('curated_list_entries', CuratedListEntry), ('curated_series_entries',CuratedSeriesEntry), ('returned_loans', ReturnedLoan), ('reading_sessions', ReadingSession)]:
        data[name] = [record(r) for r in session.scalars(select(model).order_by(model.id))]
    # Round through the stable schema to serialize timestamps consistently.
    return yaml.safe_dump(Backup.model_validate(data).model_dump(mode='json'), allow_unicode=True, sort_keys=False, width=100)


def import_backup(session, data, mode='keep_existing'):
    report = {'created': {}, 'matched': {}, 'updated': {}, 'mode': mode}
    maps = {}
    for name, model, schema in [('series', Series, SeriesData), ('curated_lists', CuratedList, ListData), ('books', Book, BookData)]:
        maps[name] = {}
        report['created'][name] = report['matched'][name] = report['updated'][name] = 0
        for row in getattr(data, name):
            if name == 'books':
                existing = session.scalar(select(Book).where(Book.normalized_author == normalize(row.author), Book.normalized_title == normalize(row.english_title)))
            elif name == 'curated_lists':
                by_name = session.scalar(select(model).where(model.name == row.name))
                by_url = session.scalar(select(model).where(model.source_url == row.source_url)) if row.source_url else None
                if by_name and by_name.source_url != row.source_url or by_name and by_url and by_name.id != by_url.id:
                    raise HTTPException(409, 'Curated list name/source conflict. Nothing imported.')
                existing = by_url or by_name
            else:
                existing = session.scalar(select(model).where(model.name == row.name))
            values = {k: getattr(row, k) for k in schema.model_fields}
            if name == 'books':
                values['series_id'] = maps['series'].get(row.series_id)
            if existing is None:
                existing = model(**values)
                if name == 'books':
                    for timestamp in ('created_at', 'updated_at'):
                        if getattr(row, timestamp):
                            setattr(existing, timestamp, getattr(row, timestamp))
                session.add(existing)
                report['created'][name] += 1
            else:
                report['matched'][name] += 1
                if mode == 'update_existing':
                    for k, v in values.items():
                        setattr(existing, k, v)
                    if name == 'books':
                        for timestamp in ('created_at', 'updated_at'):
                            if getattr(row, timestamp):
                                setattr(existing, timestamp, getattr(row, timestamp))
                    report['updated'][name] += 1
            session.flush()
            maps[name][row.id] = existing.id
    report['created']['reading_sessions'] = report['matched']['reading_sessions'] = report['updated']['reading_sessions'] = 0
    pending = []
    for item in data.reading_sessions:
        values = item.model_dump(exclude={'id'})
        values['book_id'] = maps['books'][item.book_id]
        values['reading_days'] = [day.isoformat() for day in item.reading_days]
        existing = session.scalar(select(ReadingSession).where(ReadingSession.event_id == item.event_id))
        if existing:
            if existing.book_id != values['book_id']:
                raise HTTPException(409, 'Reading session identity conflicts with a different book.')
            report['matched']['reading_sessions'] += 1
            if mode == 'update_existing':
                for key, value in values.items():
                    setattr(existing, key, value)
                report['updated']['reading_sessions'] += 1
        else:
            pending.append(ReadingSession(**values))
            report['created']['reading_sessions'] += 1
    session.flush()
    session.add_all(pending)
    session.flush()
    report['created']['returned_loans'] = report['matched']['returned_loans'] = report['updated']['returned_loans'] = 0
    for loan in data.returned_loans:
        values = loan.model_dump(exclude={'id'})
        values['book_id'] = maps['books'][loan.book_id]
        existing = session.scalar(select(ReturnedLoan).where(ReturnedLoan.event_id == loan.event_id))
        if existing:
            if existing.book_id != values['book_id']:
                raise HTTPException(409, 'Returned loan identity conflicts with a different book.')
            report['matched']['returned_loans'] += 1
            if mode == 'update_existing':
                for key, value in values.items():
                    setattr(existing, key, value)
                report['updated']['returned_loans'] += 1
        else:
            session.add(ReturnedLoan(**values))
            report['created']['returned_loans'] += 1
    report['created']['memberships'] = report['matched']['memberships'] = report['updated']['memberships'] = 0
    for row in data.curated_list_entries:
        values = row.model_dump(exclude={'id'})
        values['book_id'] = maps['books'][row.book_id]
        values['curated_list_id'] = maps['curated_lists'][row.curated_list_id]
        existing = session.scalar(select(CuratedListEntry).where(CuratedListEntry.book_id == values['book_id'], CuratedListEntry.curated_list_id == values['curated_list_id']))
        if existing:
            report['matched']['memberships'] += 1
            if mode == 'update_existing':
                for k, v in values.items():
                    setattr(existing, k, v)
                report['updated']['memberships'] += 1
        else:
            session.add(CuratedListEntry(**values))
            report['created']['memberships'] += 1
    report['created']['series_memberships']=report['matched']['series_memberships']=report['updated']['series_memberships']=0
    for row in data.curated_series_entries:
        values=row.model_dump(exclude={'id'})
        values['series_id']=maps['series'][row.series_id]
        values['curated_list_id']=maps['curated_lists'][row.curated_list_id]
        existing=session.scalar(select(CuratedSeriesEntry).where(CuratedSeriesEntry.series_id==values['series_id'],CuratedSeriesEntry.curated_list_id==values['curated_list_id']))
        if existing:
            report['matched']['series_memberships']+=1
            if mode=='update_existing':
                for k,v in values.items(): setattr(existing,k,v)
                report['updated']['series_memberships']+=1
        else:
            session.add(CuratedSeriesEntry(**values))
            report['created']['series_memberships']+=1
    session.flush()
    return report
