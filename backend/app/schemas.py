from datetime import date
import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)


class BookData(Input):
    author: str = Field(min_length=1, max_length=500)
    english_title: str = Field(min_length=1, max_length=1000)
    release_year: StrictInt | None = None
    page_count: StrictInt | None = Field(default=None, ge=1)
    translated_cs: StrictBool = False
    translated_sk: StrictBool = False
    translated_cs_sk: StrictBool = False
    czech_title: str | None = None
    slovak_title: str | None = None
    czech_translation_year: StrictInt | None = None
    slovak_translation_year: StrictInt | None = None
    owned: StrictBool = False
    read: StrictBool = False
    rating: StrictInt | None = Field(default=None, ge=0, le=5)
    expected_price: float | None = Field(default=None, ge=0)
    knihobot_watchlist: StrictBool = False
    knihobot_wishlist: StrictBool = False
    series_id: StrictInt | None = None
    series_position: float | None = None
    notes: str | None = None
    borrower: str | None = Field(default=None, max_length=500)
    loan_date: date | None = None

    @field_validator('loan_date', mode='before')
    @classmethod
    def calendar_date(cls, value):
        if value is None or value == '':
            return None
        if type(value) is date or isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            return value
        raise ValueError('Loan date must be a calendar date (YYYY-MM-DD).')

    @model_validator(mode='after')
    def complete_loan(self):
        if bool(self.borrower) != (self.loan_date is not None):
            raise ValueError('Enter both borrower and loan date, or clear both to mark the book returned.')
        return self

    @field_validator('czech_title', 'slovak_title', 'notes', 'borrower')
    @classmethod
    def empty_to_null(cls, v):
        return v or None


class ReadingSessionData(Input):
    book_id: StrictInt = Field(ge=1)
    event_id: str = Field(min_length=1, max_length=36)
    status: Literal['active', 'completed', 'stopped']
    started_on: date | None = None
    ended_on: date | None = None
    reading_days: list[date] = Field(default_factory=list, max_length=50000)

    @model_validator(mode='after')
    def valid_timeline(self):
        if (self.status == 'active') != (self.ended_on is None):
            raise ValueError('Reading status and end date do not agree.')
        if self.started_on is None and self.status != 'active':
            raise ValueError('An ended reading session must have a start date.')
        if self.ended_on and self.started_on and self.ended_on < self.started_on:
            raise ValueError('Reading end date cannot precede its start.')
        if len(set(self.reading_days)) != len(self.reading_days):
            raise ValueError('Duplicate reading day.')
        if any(self.started_on and day < self.started_on or self.ended_on and day > self.ended_on for day in self.reading_days):
            raise ValueError('Reading days must be within the reading period.')
        if self.status == 'completed' and self.ended_on not in self.reading_days:
            raise ValueError('Completion date must be a reading day.')
        self.reading_days = sorted(self.reading_days)
        return self


class NewLoan(Input):
    borrower: str = Field(min_length=1, max_length=500)
    loan_date: date

    @field_validator('loan_date', mode='before')
    @classmethod
    def calendar_date(cls, value):
        return BookData.calendar_date(value)


class SeriesData(Input):
    name: str = Field(min_length=1, max_length=500)
    notes: str | None = None
    original_author: str | None = Field(default=None, max_length=500)
    czech_name: str | None = Field(default=None, max_length=500)
    slovak_name: str | None = Field(default=None, max_length=500)

    @field_validator('original_author','czech_name','slovak_name')
    @classmethod
    def empty_name_to_null(cls,value):
        return value or None


class RatingData(Input):
    rating: StrictInt | None = Field(ge=0,le=5)


class BatchEdit(Input):
    ids: list[StrictInt] = Field(min_length=1, max_length=200)
    changes: dict = Field(min_length=1)


class ListData(Input):
    name: str = Field(min_length=1, max_length=500)
    description: str | None = None
    source_url: str | None = None
    source_name: str | None = None


class EntryData(Input):
    book_id: StrictInt
    rank: StrictInt | None = Field(default=None, ge=1)
    source_title: str | None = None
    source_author: str | None = None
