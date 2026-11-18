from sqlalchemy import case, func, or_, select
from .models import Book, CuratedListEntry, CuratedSeriesEntry


def statistics(session, *, series_id=None, list_id=None):
    either = or_(Book.translated_cs, Book.translated_sk, Book.translated_cs_sk)
    conditions = {'owned': Book.owned, 'read': Book.read, 'translated_cs': Book.translated_cs,
                  'translated_sk': Book.translated_sk, 'translated': either, 'untranslated': ~either,
                  'watchlist': Book.knihobot_watchlist, 'wishlist': Book.knihobot_wishlist,
                  'unread_owned': Book.owned & ~Book.read}
    stmt = select(func.count(Book.id).label('total'),
                  *[func.coalesce(func.sum(case((c, 1), else_=0)), 0).label(k) for k, c in conditions.items()],
                  func.avg(Book.rating).label('average_rating'),
                  func.coalesce(func.sum(case((or_(Book.knihobot_watchlist, Book.knihobot_wishlist), Book.expected_price), else_=0)), 0).label('expected_price_total'),
                  *[func.coalesce(func.sum(case((c, Book.expected_price), else_=0)), 0).label(k) for k, c in [('watchlist_price', Book.knihobot_watchlist), ('wishlist_price', Book.knihobot_wishlist)]])
    if series_id is not None:
        stmt = stmt.where(Book.series_id == series_id)
    if list_id is not None:
        stmt = stmt.where(or_(Book.id.in_(select(CuratedListEntry.book_id).where(CuratedListEntry.curated_list_id == list_id)), Book.series_id.in_(select(CuratedSeriesEntry.series_id).where(CuratedSeriesEntry.curated_list_id == list_id))))
    result = dict(session.execute(stmt).mappings().one())
    for key in ('owned', 'read'):
        result[key + '_percentage'] = round(result[key] / result['total'] * 100, 1) if result['total'] else 0
    if list_id is not None:
        result['series_entries'] = session.scalar(select(func.count()).select_from(CuratedSeriesEntry).where(CuratedSeriesEntry.curated_list_id == list_id))
        result['entries'] = result['series_entries'] + session.scalar(select(func.count()).select_from(CuratedListEntry).where(CuratedListEntry.curated_list_id == list_id))
    return result
