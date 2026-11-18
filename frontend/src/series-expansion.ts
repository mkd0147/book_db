import { api, type Book } from "./api";

// Fetch the whole series, independently of the collection's other filters.
export async function loadSeriesBooks(
  seriesId: number,
  listId: number | null,
  get = api,
): Promise<Book[]> {
  async function pages(list: number | null) {
    const items: Book[] = [];
    for (let offset = 0; ;) {
      const params = new URLSearchParams({
        series_id: String(seriesId),
        sort: "series_position",
        direction: "asc",
        limit: "200",
        offset: String(offset),
      });
      if (list !== null) params.set("curated_list_id", String(list));
      const result = await get("/books?" + params);
      items.push(...result.items);
      offset += result.items.length;
      if (offset >= result.total || !result.items.length) return items;
    }
  }
  const all = await pages(null);
  const members = listId === null ? all : await pages(listId);
  const membership = new Map(members.map((book) => [book.id, book]));
  return all.map((book) => ({
    ...book,
    in_current_list: membership.has(book.id),
    rank: membership.get(book.id)?.rank ?? null,
  }));
}
