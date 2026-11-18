import { test, expect } from "@playwright/test";
import { loadSeriesBooks } from "../src/series-expansion";

test("Series expansion fetches all volumes and distinguishes membership from an unknown rank", async () => {
  const all = Array.from({ length: 205 }, (_, index) => ({
    id: index + 1,
    author: "Author",
    english_title: `Volume ${index + 1}`,
    series_position: index + 1,
    series_id: 7,
    owned: index === 0,
  }));
  const calls: URLSearchParams[] = [];
  const get = async (path: string) => {
    const params = new URLSearchParams(path.split("?")[1]);
    calls.push(params);
    expect(params.get("series_id")).toBe("7");
    expect(params.get("sort")).toBe("series_position");
    expect(params.has("owned")).toBe(false);
    const list = params.get("curated_list_id");
    const items = list
      ? [
          { ...all[0], rank: 12 },
          { ...all[204], rank: null },
        ]
      : all;
    const offset = Number(params.get("offset"));
    return { total: items.length, items: items.slice(offset, offset + 200) };
  };
  const books = await loadSeriesBooks(7, 9, get);
  expect(books).toHaveLength(205);
  expect(books[0]).toMatchObject({
    id: 1,
    rank: 12,
    in_current_list: true,
    owned: true,
  });
  expect(books[1]).toMatchObject({ id: 2, rank: null, in_current_list: false });
  expect(books[204]).toMatchObject({
    id: 205,
    rank: null,
    in_current_list: true,
  });
  expect(calls).toHaveLength(3);
});

test("Series expansion in Collection needs no curated membership request", async () => {
  let requests = 0;
  const books = await loadSeriesBooks(7, null, async () => {
    requests++;
    return { total: 1, items: [{ id: 2, author: "A", english_title: "T" }] };
  });
  expect(requests).toBe(1);
  expect(books[0].in_current_list).toBe(true);
});
