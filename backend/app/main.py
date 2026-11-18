from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import database_path, make_engine, migrate, normalize, search_normalize
from .models import Book, CuratedList, CuratedListEntry, CuratedSeriesEntry, Series, ReturnedLoan
from .schemas import BookData, BatchEdit, RatingData, NewLoan
from .version import APP_VERSION


def record(obj):
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns if not c.name.startswith('normalized_')}


def get_session(request: Request):
    with Session(request.app.state.engine) as session:
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            session.connection().exec_driver_sql('BEGIN IMMEDIATE')
        yield session


def require(session, model, id):
    obj = session.get(model, id)
    if obj is None:
        raise HTTPException(404, 'Record not found')
    return obj


def save(session, obj):
    session.add(obj)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, 'This record already exists or references a missing record.')
    session.refresh(obj)
    return record(obj)


def validate_book(session, data, exclude_id=None):
    if data.series_id is not None:
        require(session, Series, data.series_id)
    duplicate = session.scalar(select(Book).where(Book.normalized_author == normalize(data.author), Book.normalized_title == normalize(data.english_title), Book.id != (exclude_id or -1)))
    if duplicate:
        raise HTTPException(409, {'message': 'A book with this author and title already exists.', 'book_id': duplicate.id})


def create_app(path=None, static_dir=None, session_token=None):
    path = path or database_path()
    engine = make_engine(path)

    @asynccontextmanager
    async def lifespan(app):
        migrate(engine)
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(title='BookDB', lifespan=lifespan)
    app.state.engine = engine
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', 'testserver'])
    app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'], allow_methods=['*'], allow_headers=['Content-Type', 'X-BookDB-Profile', 'X-BookDB-Cloud', 'X-BookDB-Generation'])

    @app.middleware('http')
    async def local_writes(request, call_next):
        origin = request.headers.get('origin')
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and origin:
            from urllib.parse import urlsplit
            parsed = urlsplit(origin)
            if parsed.hostname not in ('127.0.0.1', 'localhost') or parsed.scheme != 'http':
                return JSONResponse(status_code=403, content={'detail': 'Only local browser writes are allowed.'})
        return await call_next(request)

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'app': 'BookDB', 'version': APP_VERSION}

    @app.get('/api/settings')
    def settings(request: Request):
        return {'database_path': str(request.app.state.engine.url.database), 'schema_version': 7}

    @app.get('/api/books')
    def books(q: str = '', owned: bool | None = None, read: bool | None = None,
              translated: bool | None = None, translated_cs: bool | None = None, translated_sk: bool | None = None,
              knihobot_watchlist: bool | None = None, knihobot_wishlist: bool | None = None,
              series_id: int | None = None, curated_list_id: int | None = None, include_series: bool = False,
              rating: int | None = Query(None, ge=0, le=5), sort: str = 'author', direction: Literal['asc', 'desc'] = 'asc',
              offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200), session: Session = Depends(get_session)):
        stmt = select(Book, Series.name.label('series_name')).outerjoin(Series, Book.series_id == Series.id)
        if curated_list_id is not None:
            stmt = stmt.outerjoin(CuratedListEntry, (CuratedListEntry.book_id == Book.id) & (CuratedListEntry.curated_list_id == curated_list_id))
            stmt = stmt.outerjoin(CuratedSeriesEntry, (CuratedSeriesEntry.series_id == Book.series_id) & (CuratedSeriesEntry.curated_list_id == curated_list_id))
            stmt = stmt.where(CuratedListEntry.id.is_not(None) if include_series else or_(CuratedListEntry.id.is_not(None), CuratedSeriesEntry.id.is_not(None)))
            list_rank = case((CuratedListEntry.id.is_not(None), CuratedListEntry.rank), else_=CuratedSeriesEntry.rank)
            stmt = stmt.add_columns(list_rank)
        if q.strip():
            term = search_normalize(q).replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            stmt = stmt.where(or_(*[func.search_normalize(col).like('%' + term + '%', escape='\\') for col in (Book.author, Book.english_title, Book.czech_title, Book.slovak_title, Series.name, Series.czech_name, Series.slovak_name)]))
        for name, value in [('owned', owned), ('read', read), ('translated_cs', translated_cs), ('translated_sk', translated_sk), ('knihobot_watchlist', knihobot_watchlist), ('knihobot_wishlist', knihobot_wishlist), ('series_id', series_id), ('rating', rating)]:
            if value is not None:
                stmt = stmt.where(getattr(Book, name) == value)
        if translated is not None:
            expression = or_(Book.translated_cs, Book.translated_sk, Book.translated_cs_sk)
            stmt = stmt.where(expression if translated else ~expression)
        sorts = {name: getattr(Book, name) for name in BookData.model_fields}
        sorts['series'] = Series.name
        sorts['translated'] = or_(Book.translated_cs, Book.translated_sk, Book.translated_cs_sk)
        sorts['local_title'] = func.coalesce(Book.czech_title, Book.slovak_title)
        if curated_list_id is not None:
            sorts['rank'] = list_rank
        if sort not in sorts:
            raise HTTPException(422, 'Unknown sort column')
        if curated_list_id is not None and include_series:
            from .series_entries import list_series_rows
            items = [dict(record(row[0]), series_name=row[1], rank=row[2], entity_type='book') for row in session.execute(stmt)]
            for row in list_series_rows(session, curated_list_id):
                if q.strip() and search_normalize(q) not in search_normalize(' '.join(row.get(k) or '' for k in ('author','english_title','czech_title','slovak_title'))): continue
                checks={'owned':owned,'read':read,'knihobot_watchlist':knihobot_watchlist,'knihobot_wishlist':knihobot_wishlist,'series_id':series_id,'rating':rating}
                if any(value is not None and row.get(key)!=value for key,value in checks.items()): continue
                if translated is not None and row['translated_cs_sk']!=translated: continue
                if translated_cs is not None and (row['stats']['translated_cs']>0)!=translated_cs: continue
                if translated_sk is not None and (row['stats']['translated_sk']>0)!=translated_sk: continue
                items.append(row)
            def sort_value(row):
                value = row.get('series_name') if sort=='series' else (row.get('czech_title') or row.get('slovak_title')) if sort=='local_title' else bool(row.get('translated_cs') or row.get('translated_sk') or row.get('translated_cs_sk')) if sort=='translated' else row.get(sort)
                return search_normalize(value) if isinstance(value,str) else value
            present=sorted((row for row in items if sort_value(row) is not None),key=lambda row:(sort_value(row),row['id']),reverse=direction=='desc')
            ordered=present+[row for row in items if sort_value(row) is None]
            return {'total':len(ordered),'items':ordered[offset:offset+limit]}
        total = session.scalar(select(func.count()).select_from(stmt.subquery()))
        column = sorts[sort]
        if sort in ('author', 'english_title', 'czech_title', 'slovak_title', 'series'):
            column = func.search_normalize(column)
        stmt = stmt.order_by((column.desc() if direction == 'desc' else column.asc()).nulls_last(), Book.id).offset(offset).limit(limit)
        return {'total': total, 'items': [dict(record(row[0]), series_name=row[1], rank=row[2] if len(row) > 2 else None) for row in session.execute(stmt)]}

    @app.post('/api/books', status_code=201)
    def add_book(data: BookData, session: Session = Depends(get_session)):
        validate_book(session, data)
        return save(session, Book(**data.model_dump()))

    @app.patch('/api/books/batch')
    def batch_edit(data: BatchEdit, session: Session = Depends(get_session)):
        allowed = {'owned', 'read', 'translated', 'knihobot_watchlist', 'knihobot_wishlist', 'rating', 'expected_price', 'series_id', 'notes'}
        if set(data.changes) - allowed:
            raise HTTPException(422, 'Unsupported batch field')
        changes = dict(data.changes)
        if 'translated' in changes:
            value = changes.pop('translated')
            if type(value) is not bool:
                raise HTTPException(422, 'translated must be true or false')
            changes['translated_cs_sk'] = value
            if not value:
                changes.update(translated_cs=False, translated_sk=False)
        ids = list(dict.fromkeys(data.ids))
        books = [require(session, Book, id) for id in ids]
        validated = []
        for book in books:
            try:
                values = BookData.model_validate({**{k: getattr(book, k) for k in BookData.model_fields}, **changes})
            except ValidationError as error:
                raise HTTPException(422, jsonable_encoder(error.errors(include_context=False)))
            if values.series_id is not None:
                require(session, Series, values.series_id)
            validated.append(values)
        for book, values in zip(books, validated):
            for key in changes:
                setattr(book, key, getattr(values, key))
        session.commit()
        return {'updated': len(books), 'ids': ids}

    @app.get('/api/books/{id}')
    def book_detail(id: int, session: Session = Depends(get_session)):
        from .reading import reading_history
        book = require(session, Book, id)
        memberships = [dict(record(row[0]), rank=row[1]) for row in session.execute(select(CuratedList, CuratedListEntry.rank).join(CuratedListEntry).where(CuratedListEntry.book_id == id))]
        if book.series_id:
            direct_ids={entry['id'] for entry in memberships}
            memberships.extend(dict(record(row[0]),rank=row[1],via_series=True) for row in session.execute(select(CuratedList,CuratedSeriesEntry.rank).join(CuratedSeriesEntry,CuratedSeriesEntry.curated_list_id==CuratedList.id).where(CuratedSeriesEntry.series_id==book.series_id)) if row[0].id not in direct_ids)
        siblings = session.scalars(select(Book).where(Book.series_id == book.series_id).order_by(Book.series_position.asc().nulls_last(), Book.id)).all() if book.series_id else []
        return dict(record(book), lists=memberships, series_books=[record(b) for b in siblings], reading_history=reading_history(session, id))

    @app.post('/api/books/{id}/loan')
    def lend_book(id: int, data: NewLoan, session: Session = Depends(get_session)):
        book = require(session, Book, id)
        result = session.execute(update(Book).where(Book.id == id, Book.borrower.is_(None), Book.loan_date.is_(None)).values(**data.model_dump()))
        if result.rowcount != 1:
            session.rollback()
            raise HTTPException(409, 'This book is already lent out. Mark it returned before recording a new loan.')
        session.commit()
        session.refresh(book)
        return record(book)

    @app.patch('/api/books/{id}/rating')
    def inline_rating(id:int,data:RatingData,session:Session=Depends(get_session)):
        book=require(session,Book,id)
        if not book.read:
            raise HTTPException(409,'Mark this book as read before changing its rating in the table.')
        book.rating=data.rating
        return save(session,book)

    @app.patch('/api/books/{id}')
    def edit_book(id: int, patch: dict, session: Session = Depends(get_session)):
        book = require(session, Book, id)
        try:
            data = BookData.model_validate({**{k: getattr(book, k) for k in BookData.model_fields}, **patch})
        except ValidationError as error:
            raise HTTPException(422, jsonable_encoder(error.errors(include_context=False)))
        validate_book(session, data, id)
        if book.borrower and book.loan_date and not data.borrower:
            session.add(ReturnedLoan(book_id=book.id, borrower=book.borrower, loan_date=book.loan_date))
        for key, value in data.model_dump().items():
            setattr(book, key, value)
        return save(session, book)

    @app.delete('/api/books/{id}', status_code=204)
    def delete_book(id: int, session: Session = Depends(get_session)):
        session.delete(require(session, Book, id))
        session.commit()

    # Feature routers are included before mounting the built frontend.
    from .routes import register
    register(app)
    dist = Path(static_dir) if static_dir else Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
    if dist.is_dir():
        app.mount('/', StaticFiles(directory=dist, html=True), name='frontend')
    return app
