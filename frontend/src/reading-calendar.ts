import type { Language } from "./i18n";

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function monthDays(month: string): string[] {
  const [year, index] = month.split("-").map(Number);
  return Array.from(
    { length: new Date(year, index, 0, 12).getDate() },
    (_, day) => `${month}-${String(day + 1).padStart(2, "0")}`,
  );
}
export function shiftMonth(month: string, amount: number): string {
  const [year, index] = month.split("-").map(Number);
  return localDay(new Date(year, index - 1 + amount, 1, 12)).slice(0, 7);
}
export function formatDate(value: string, locale: Language): string {
  // Calendar dates are local dates; UTC timestamps need their timezone restored.
  const date = new Date(
    value.length === 10
      ? value + "T12:00:00"
      : /(Z|[+-]\d\d:\d\d)$/.test(value)
        ? value
        : value + "Z",
  );
  if (Number.isNaN(date.getTime())) return "—";
  const month = new Intl.DateTimeFormat(locale, { month: "short" })
    .format(date)
    .replace(/\.$/, "");
  return `${String(date.getDate()).padStart(2, "0")}/${month}/${date.getFullYear()}`;
}
export function readingPace(
  pages: number | null | undefined,
  days: string[],
): number | null {
  const count = new Set(days).size;
  return pages && pages > 0 && count ? pages / count : null;
}
