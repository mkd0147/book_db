from datetime import date, datetime, timezone
from uuid import uuid4
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, event, JSON, Index, text
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base, normalize


def now():
    return datetime.now(timezone.utc)


class Series(Base):
    __tablename__ = 'series'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    notes: Mapped[str | None] = mapped_column(Text)
    original_author: Mapped[str | None] = mapped_column(String)
    czech_name: Mapped[str | None] = mapped_column(String)
    slovak_name: Mapped[str | None] = mapped_column(String)


class Book(Base):
    __tablename__ = 'books'
    __table_args__ = (UniqueConstraint('normalized_author', 'normalized_title'), CheckConstraint('rating IS NULL OR rating BETWEEN 0 AND 5'), CheckConstraint('expected_price IS NULL OR expected_price >= 0'))
    id: Mapped[int] = mapped_column(primary_key=True)
    author: Mapped[str] = mapped_column(String)
    english_title: Mapped[str] = mapped_column(String)
    normalized_author: Mapped[str] = mapped_column(String)
    normalized_title: Mapped[str] = mapped_column(String, index=True)
    release_year: Mapped[int | None] = mapped_column(Integer)
    page_count: Mapped[int | None] = mapped_column(Integer)
    translated_cs: Mapped[bool] = mapped_column(Boolean, default=False)
    translated_sk: Mapped[bool] = mapped_column(Boolean, default=False)
    translated_cs_sk: Mapped[bool] = mapped_column(Boolean, default=False)
    czech_title: Mapped[str | None] = mapped_column(String)
    slovak_title: Mapped[str | None] = mapped_column(String)
    czech_translation_year: Mapped[int | None] = mapped_column(Integer)
    slovak_translation_year: Mapped[int | None] = mapped_column(Integer)
    owned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    rating: Mapped[int | None] = mapped_column(Integer)
    expected_price: Mapped[float | None] = mapped_column(Float)
    knihobot_watchlist: Mapped[bool] = mapped_column(Boolean, default=False)
    knihobot_wishlist: Mapped[bool] = mapped_column(Boolean, default=False)
    series_id: Mapped[int | None] = mapped_column(ForeignKey('series.id', ondelete='SET NULL'), index=True)
    series_position: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    borrower: Mapped[str | None] = mapped_column(String(500))
    loan_date: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


@event.listens_for(Book, 'before_insert')
@event.listens_for(Book, 'before_update')
def normalize_book(_, __, book):
    book.normalized_author = normalize(book.author)
    book.normalized_title = normalize(book.english_title)
    if book.czech_title and book.czech_title.strip():
        book.translated_cs = True
    if book.slovak_title and book.slovak_title.strip():
        book.translated_sk = True


class ReadingSession(Base):
    __tablename__ = 'reading_sessions'
    __table_args__ = (
        CheckConstraint("status IN ('active', 'completed', 'stopped')"),
        Index('ix_reading_active_book', 'book_id', unique=True, sqlite_where=text("status = 'active'")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid4()))
    book_id: Mapped[int] = mapped_column(ForeignKey('books.id', ondelete='CASCADE'), index=True)
    status: Mapped[str] = mapped_column(String(20), default='active')
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ended_on: Mapped[date | None] = mapped_column(Date)
    reading_days: Mapped[list] = mapped_column(JSON, default=list)


class ReturnedLoan(Base):
    __tablename__ = 'returned_loans'
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid4()))
    book_id: Mapped[int] = mapped_column(ForeignKey('books.id', ondelete='CASCADE'), index=True)
    borrower: Mapped[str] = mapped_column(String(500))
    loan_date: Mapped[date] = mapped_column(Date)
    returned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CuratedList(Base):
    __tablename__ = 'curated_lists'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String, unique=True)
    source_name: Mapped[str | None] = mapped_column(String)


class CuratedListEntry(Base):
    __tablename__ = 'curated_list_entries'
    __table_args__ = (UniqueConstraint('curated_list_id', 'book_id'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    curated_list_id: Mapped[int] = mapped_column(ForeignKey('curated_lists.id', ondelete='CASCADE'), index=True)
    book_id: Mapped[int] = mapped_column(ForeignKey('books.id', ondelete='CASCADE'), index=True)
    rank: Mapped[int | None] = mapped_column(Integer)
    source_title: Mapped[str | None] = mapped_column(String)
    source_author: Mapped[str | None] = mapped_column(String)


class CuratedSeriesEntry(Base):
    __tablename__ = 'curated_series_entries'
    __table_args__ = (UniqueConstraint('curated_list_id', 'series_id'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    curated_list_id: Mapped[int] = mapped_column(ForeignKey('curated_lists.id', ondelete='CASCADE'), index=True)
    series_id: Mapped[int] = mapped_column(ForeignKey('series.id', ondelete='CASCADE'), index=True)
    rank: Mapped[int | None] = mapped_column(Integer)
    source_title: Mapped[str | None] = mapped_column(String)
    source_author: Mapped[str | None] = mapped_column(String)
