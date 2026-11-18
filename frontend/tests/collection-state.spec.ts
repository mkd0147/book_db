import { test, expect } from "@playwright/test";
import {
  hasTranslation,
  rowClasses,
  selectRows,
} from "../src/collection-state";

test("Read outline does not replace any fill", () => {
  expect(rowClasses({ read: true })).toBe(
    "book-row book-row-untranslated book-row-read",
  );
  expect(rowClasses({ read: true, translated_sk: true })).toBe(
    "book-row book-row-translated book-row-read",
  );
  expect(rowClasses({ owned: true })).toBe("book-row book-row-owned");
  expect(rowClasses({ owned: true, read: true, knihobot_wishlist: true })).toBe(
    "book-row book-row-owned book-row-read",
  );
  expect(hasTranslation({ translated_cs_sk: true })).toBe(true);
});
test("Click, Ctrl and Shift selection follows visible order", () => {
  const order = [8, 3, 10, 2, 5];
  expect(selectRows([8], order, 10, 8, false, false)).toEqual([10]);
  expect(selectRows([8], order, 10, 8, true, false)).toEqual([8, 10]);
  expect(selectRows([8, 10], order, 8, 10, true, false)).toEqual([10]);
  expect(selectRows([3], order, 2, 3, false, true)).toEqual([3, 10, 2]);
  expect(selectRows([5], order, 3, 2, true, true)).toEqual([5, 3, 10, 2]);
});
