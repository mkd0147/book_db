import { t } from "./i18n";
export function InlineRating({
  title,
  rating,
  read,
  disabled,
  onChange,
}: {
  title: string;
  rating: number | null;
  read: boolean;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <select
      className="inline-rating"
      aria-label={t("Rating: {title}", { title })}
      title={read ? t("Rate this book") : t("Mark as read to change rating")}
      value={rating ?? ""}
      disabled={!read || disabled}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : Number(e.target.value))
      }
    >
      <option value="">{t("Unrated")}</option>
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n === 0 ? t("0 stars") : "★".repeat(n)}
        </option>
      ))}
    </select>
  );
}
