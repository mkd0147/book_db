export type RowState = {
  [key: string]: unknown;
  read?: boolean;
  owned?: boolean;
  knihobot_watchlist?: boolean;
  knihobot_wishlist?: boolean;
  translated_cs?: boolean;
  translated_sk?: boolean;
  translated_cs_sk?: boolean;
};
export const hasTranslation = (book: RowState) =>
  !!(book.translated_cs || book.translated_sk || book.translated_cs_sk);
export function rowClasses(book: RowState) {
  const fill = book.owned
    ? "owned"
    : book.knihobot_watchlist || book.knihobot_wishlist
      ? "wanted"
      : hasTranslation(book)
        ? "translated"
        : "untranslated";
  return `book-row book-row-${fill}${book.read ? " book-row-read" : ""}`;
}
export function selectRows(
  selected: number[],
  order: number[],
  id: number,
  anchor: number | null,
  additive: boolean,
  range: boolean,
) {
  if (range && anchor !== null && order.includes(anchor)) {
    const a = order.indexOf(anchor),
      b = order.indexOf(id);
    const ids = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    return [...new Set([...(additive ? selected : []), ...ids])];
  }
  return additive
    ? selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id]
    : [id];
}
