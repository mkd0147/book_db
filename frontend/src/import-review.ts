import { t } from "./i18n";
export type ImportConflict = {
  index: number;
  entry: { author: string; english_title: string; rank: number | null };
  candidates: { id: number; author: string; english_title: string }[];
};

export function resolveImport(
  preview: string,
  conflicts: ImportConflict[],
  choices: Record<number, string>,
) {
  const data = JSON.parse(preview);
  for (const conflict of conflicts) {
    const choice = choices[conflict.index];
    if (!choice)
      throw new Error(
        t("Choose how to handle every possible match before importing."),
      );
    const entry = data.entries[conflict.index];
    if (
      !entry ||
      entry.author !== conflict.entry.author ||
      entry.english_title !== conflict.entry.english_title
    ) {
      throw new Error(
        t(
          "The preview changed. Check the list again before resolving matches.",
        ),
      );
    }
    delete entry.book_id;
    delete entry.create_separate;
    if (choice === "separate") entry.create_separate = true;
    else {
      const id = Number(choice);
      if (!conflict.candidates.some((candidate) => candidate.id === id))
        throw new Error(t("Choose one of the displayed books."));
      entry.book_id = id;
    }
  }
  return data;
}
