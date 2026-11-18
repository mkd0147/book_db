import { t } from "./i18n";
import type { ImportConflict } from "./import-review";

export function ImportReview({
  conflicts,
  choices,
  onChoose,
  disabled,
}: {
  conflicts: ImportConflict[];
  choices: Record<number, string>;
  onChoose: (index: number, value: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="panel" aria-label={t("Review possible duplicates")}>
      <h3>
        {t("Review possible matches: {count}", { count: conflicts.length })}
      </h3>
      <p>
        {" "}
        {t(
          "Nothing has been imported yet. For each entry, choose the existing book if it is the same work, or create a separate book if it is different. Existing book details will be kept.",
        )}{" "}
      </p>
      {conflicts.map((conflict) => (
        <fieldset
          key={conflict.index}
          className="import-match"
          disabled={disabled}
        >
          <legend>
            {conflict.entry.rank ? `#${conflict.entry.rank} · ` : ""}
            {conflict.entry.english_title} — {conflict.entry.author}
          </legend>
          {conflict.candidates.map((candidate) => (
            <label key={candidate.id}>
              <input
                type="radio"
                name={`match-${conflict.index}`}
                value={candidate.id}
                checked={choices[conflict.index] === String(candidate.id)}
                onChange={() => onChoose(conflict.index, String(candidate.id))}
              />
              <span className="import-choice-text">
                <strong>{t("Same book — use existing")}</strong>
                <span>
                  {candidate.english_title} — {candidate.author}{" "}
                  {t("(Book #{id})", { id: candidate.id })}
                </span>
              </span>
            </label>
          ))}
          <label>
            <input
              type="radio"
              name={`match-${conflict.index}`}
              value="separate"
              checked={choices[conflict.index] === "separate"}
              onChange={() => onChoose(conflict.index, "separate")}
            />
            <span className="import-choice-text">
              <strong>{t("Different book — create separately")}</strong>
              <span>
                {t("Add this work to the collection with its own Book ID.")}
              </span>
            </span>
          </label>
        </fieldset>
      ))}
    </section>
  );
}
