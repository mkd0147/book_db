from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, StrictInt, field_validator
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .main import get_session, record, require
from .models import Book, ReadingSession
from .schemas import Input, BookData

router = APIRouter(prefix='/api/reading')


class StartReading(Input):
    book_id: StrictInt = Field(ge=1)


class ReadingAction(Input):
    day: date
    action: Literal['start', 'undo_start', 'read', 'remove', 'stop', 'complete']

    @field_validator('day', mode='before')
    @classmethod
    def calendar_date(cls, value):
        return BookData.calendar_date(value)


def reading_history(session, book_id):
    return [record(item) for item in session.scalars(select(ReadingSession).where(ReadingSession.book_id == book_id).order_by(ReadingSession.started_on.desc(), ReadingSession.id.desc()))]


@router.get('')
def reading(from_date: date, to_date: date, session: Session = Depends(get_session)):
    if to_date < from_date or (to_date - from_date).days > 366:
        raise HTTPException(422, 'Choose a reading calendar range of at most one year.')
    # Keep all active books visible so previously missed reading days can be logged.
    stmt = select(ReadingSession, Book).join(Book).where(or_(ReadingSession.status == 'active', (ReadingSession.started_on <= to_date) & (ReadingSession.ended_on >= from_date))).order_by(ReadingSession.id)
    return {'today': date.today(), 'items': [dict(record(item), book=record(book)) for item, book in session.execute(stmt)]}


@router.post('', status_code=201)
def start_reading(data: StartReading, session: Session = Depends(get_session)):
    require(session, Book, data.book_id)
    item = ReadingSession(book_id=data.book_id)
    session.add(item)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, 'This book is already being read.')
    session.refresh(item)
    return record(item)


@router.post('/{id}/reopen')
def reopen_reading(id: int, session: Session = Depends(get_session)):
    item = require(session, ReadingSession, id)
    # Preserve the canonical Read flag: this action corrects the session log.
    try:
        result = session.execute(update(ReadingSession).where(
            ReadingSession.id == id, ReadingSession.status == 'completed'
        ).values(status='active', ended_on=None))
        if result.rowcount != 1:
            session.rollback()
            raise HTTPException(409, 'Only completed reading sessions can be reopened.')
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, 'This book is already being read.')
    session.refresh(item)
    return record(item)


@router.post('/{id}/days')
def reading_action(id: int, data: ReadingAction, session: Session = Depends(get_session)):
    item = require(session, ReadingSession, id)
    if item.status != 'active':
        raise HTTPException(409, 'This reading session has ended. Start it again to track a reread.')
    if data.day > date.today():
        raise HTTPException(422, 'Reading can only be logged for today or earlier.')
    days = set(item.reading_days)
    started = item.started_on
    if data.action == 'start':
        if started is not None:
            raise HTTPException(409, 'Reading has already started. Undo start first.')
        if any(day < data.day.isoformat() for day in days):
            raise HTTPException(422, 'Choose a start date on or before existing reading days.')
        started = data.day
        days.add(data.day.isoformat())
    elif data.action == 'undo_start':
        if started is None or data.day != started:
            raise HTTPException(409, 'Reading start changed. Refresh and try again.')
        days.discard(started.isoformat())
        started = None
    else:
        if started is None:
            raise HTTPException(409, 'Choose a start date before logging reading.')
        if data.day < started:
            raise HTTPException(422, 'Reading days cannot precede the start date.')
    status, ended = item.status, None
    if data.action in ('read', 'complete'):
        days.add(data.day.isoformat())
    elif data.action == 'remove':
        days.discard(data.day.isoformat())
    if data.action in ('stop', 'complete'):
        if any(day > data.day.isoformat() for day in days):
            raise HTTPException(422, 'Remove later reading days before ending on this date.')
        status = 'completed' if data.action == 'complete' else 'stopped'
        ended = data.day
    # Reject stale concurrent edits instead of silently losing a logged day.
    result = session.execute(update(ReadingSession).where(ReadingSession.id == id, ReadingSession.status == 'active', ReadingSession.started_on == item.started_on, ReadingSession.reading_days == item.reading_days).values(reading_days=sorted(days), started_on=started, status=status, ended_on=ended))
    if result.rowcount != 1:
        session.rollback()
        raise HTTPException(409, 'Reading changed. Refresh and try again.')
    if data.action == 'complete':
        require(session, Book, item.book_id).read = True
    session.commit()
    session.refresh(item)
    return record(item)
