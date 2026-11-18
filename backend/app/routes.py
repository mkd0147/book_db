from fastapi import Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .main import get_session, record, require, save
from .models import Book, CuratedList, CuratedListEntry, Series, ReturnedLoan
from typing import Literal
from .schemas import ListData, EntryData, Input, SeriesData
from .curated import ListImport, import_list
from .stats import statistics


class SourceRequest(Input):
    url: str


def register(app):
    from .reading import router as reading_router
    app.include_router(reading_router)
    from .backup_routes import router
    app.include_router(router)
    from .series_entries import router as series_router
    app.include_router(series_router)

    @app.get('/api/loans')
    def loans(q: str = '', status: Literal['lent', 'returned'] = 'lent', offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200), session: Session = Depends(get_session)):
        from .db import search_normalize
        returned = status == 'returned'
        stmt = select(Book, ReturnedLoan).join(ReturnedLoan, ReturnedLoan.book_id == Book.id) if returned else select(Book).where(Book.borrower.is_not(None), Book.loan_date.is_not(None))
        if q.strip():
            term = search_normalize(q).replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            stmt = stmt.where(or_(*[func.search_normalize(column).like('%' + term + '%', escape='\\') for column in (Book.author, Book.english_title, Book.czech_title, Book.slovak_title, ReturnedLoan.borrower if returned else Book.borrower)]))
        total = session.scalar(select(func.count()).select_from(stmt.subquery()))
        if returned:
            rows = session.execute(stmt.order_by(ReturnedLoan.returned_at.desc(), ReturnedLoan.id.desc()).offset(offset).limit(limit))
            return {'total': total, 'items': [dict(record(book), loan_id=loan.id, borrower=loan.borrower, loan_date=loan.loan_date, returned_at=loan.returned_at) for book, loan in rows]}
        books = session.scalars(stmt.order_by(Book.loan_date, Book.id).offset(offset).limit(limit))
        return {'total': total, 'items': [record(book) for book in books]}

    @app.get('/api/statistics')
    def dashboard(session: Session = Depends(get_session)):
        return dict(statistics(session), lists=[dict(record(l), stats=statistics(session, list_id=l.id)) for l in session.scalars(select(CuratedList).order_by(CuratedList.name))])
    @app.get('/api/series')
    def all_series(session: Session = Depends(get_session)):
        return [dict(record(s), stats=statistics(session, series_id=s.id)) for s in session.scalars(select(Series).order_by(Series.name))]

    @app.post('/api/series', status_code=201)
    def create_series(data: SeriesData, session: Session = Depends(get_session)):
        return save(session, Series(**data.model_dump()))

    @app.get('/api/series/{id}')
    def series_detail(id: int, session: Session = Depends(get_session)):
        return dict(record(require(session, Series, id)), stats=statistics(session, series_id=id))

    @app.patch('/api/series/{id}')
    def edit_series(id: int, data: SeriesData, session: Session = Depends(get_session)):
        target = require(session, Series, id)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(target, k, v)
        return save(session, target)

    @app.delete('/api/series/{id}', status_code=204)
    def remove_series(id: int, session: Session = Depends(get_session)):
        session.delete(require(session, Series, id))
        session.commit()

    @app.get('/api/lists')
    def lists(session: Session = Depends(get_session)):
        return [dict(record(l), stats=statistics(session, list_id=l.id)) for l in session.scalars(select(CuratedList).order_by(CuratedList.name))]

    @app.post('/api/lists', status_code=201)
    def create_list(data: ListData, session: Session = Depends(get_session)):
        return save(session, CuratedList(**data.model_dump()))

    @app.post('/api/lists/preview')
    def preview(data: SourceRequest):
        from .importers.digitaldreamdoor import fetch_html, parse_html
        import httpx
        try:
            return parse_html(fetch_html(data.url), data.url).model_dump()
        except (ValueError, httpx.HTTPError) as error:
            raise HTTPException(422, str(error))

    @app.post('/api/lists/import')
    def apply_import(data: ListImport, session: Session = Depends(get_session)):
        try:
            result = import_list(session, data)
            session.commit()
            return result
        except IntegrityError:
            session.rollback()
            raise HTTPException(409, 'Conflicting list name or duplicate entries. Nothing imported.')

    @app.get('/api/lists/{id}')
    def list_detail(id: int, session: Session = Depends(get_session)):
        return dict(record(require(session, CuratedList, id)), stats=statistics(session, list_id=id))

    @app.patch('/api/lists/{id}')
    def edit_list(id: int, data: ListData, session: Session = Depends(get_session)):
        target = require(session, CuratedList, id)
        for k, v in data.model_dump().items():
            setattr(target, k, v)
        return save(session, target)

    @app.delete('/api/lists/{id}', status_code=204)
    def remove_list(id: int, session: Session = Depends(get_session)):
        session.delete(require(session, CuratedList, id))
        session.commit()

    @app.post('/api/lists/{id}/entries', status_code=201)
    def add_entry(id: int, data: EntryData, session: Session = Depends(get_session)):
        require(session, CuratedList, id)
        require(session, Book, data.book_id)
        return save(session, CuratedListEntry(curated_list_id=id, **data.model_dump()))

    @app.delete('/api/lists/{id}/entries/{book_id}', status_code=204)
    def remove_entry(id: int, book_id: int, session: Session = Depends(get_session)):
        entry = session.scalar(select(CuratedListEntry).where(CuratedListEntry.curated_list_id == id, CuratedListEntry.book_id == book_id))
        if entry is None:
            raise HTTPException(404, 'Membership not found')
        session.delete(entry)
        session.commit()

    @app.put('/api/lists/{id}/entries/{book_id}')
    def edit_entry(id: int, book_id: int, data: EntryData, session: Session = Depends(get_session)):
        if data.book_id != book_id:
            raise HTTPException(422, 'book_id must match the URL')
        entry = session.scalar(select(CuratedListEntry).where(CuratedListEntry.curated_list_id == id, CuratedListEntry.book_id == book_id))
        if entry is None:
            raise HTTPException(404, 'Membership not found')
        for k, v in data.model_dump().items():
            setattr(entry, k, v)
        return save(session, entry)
