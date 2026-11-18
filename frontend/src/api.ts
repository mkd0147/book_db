import { t } from "./i18n";
export type Book = {
  id: number;
  author: string;
  english_title: string;
  [key: string]: any;
};
export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, detail: any) {
    super(
      typeof detail === "string"
        ? t(detail)
        : Array.isArray(detail)
          ? t("Check the entered values.") +
            " " +
            detail
              .map((item) => {
                const field =
                  item.loc
                    ?.filter((part: unknown) => part !== "body")
                    .join(".") || "";
                const label = t(
                  (textFields as Record<string, string>)[field] ||
                    (
                      {
                        borrower: "Borrower",
                        loan_date: "Date lent",
                      } as Record<string, string>
                    )[field] ||
                    (boolFields as Record<string, string>)[field] ||
                    field,
                );
                return (
                  label +
                  ": " +
                  t(
                    item.type === "missing"
                      ? "Required field"
                      : item.msg?.startsWith("Value error, ")
                        ? item.msg.slice(13)
                        : item.msg || "Invalid value",
                  )
                );
              })
              .join("; ")
          : t(detail?.message || JSON.stringify(detail)),
    );
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}
export function profileHeaders(): Record<string, string> { return {}; }
export function profileUrl(path: string) { return path; }
export async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api" + path, {
    method,
    headers: {
      ...profileHeaders(),
      ...(path.startsWith("/cloud/") ? { "X-BookDB-Cloud": "1" } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = data.detail;
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? null : res.json();
}
export const boolFields = {
  translated_cs_sk: "CZ/SK translation (either language)",
  translated_cs: "Czech translation",
  translated_sk: "Slovak translation",
  owned: "Owned",
  read: "Read",
  knihobot_watchlist: "Watchlist",
  knihobot_wishlist: "Wishlist",
};
export const textFields = {
  author: "Author",
  english_title: "English title",
  release_year: "Release year",
  page_count: "Number of pages",
  czech_title: "Czech title",
  czech_translation_year: "Czech translation year",
  slovak_title: "Slovak title",
  slovak_translation_year: "Slovak translation year",
  expected_price: "Expected price",
  series_position: "Series position",
};
export const numeric = [
  "page_count",
  "release_year",
  "czech_translation_year",
  "slovak_translation_year",
  "expected_price",
  "series_position",
];
