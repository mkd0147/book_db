import { useReadOnly } from "./library-access";
import { t, errorText } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export function SeriesEntryEditor({
  book,
  series,
  lists,
  onClose,
  onSaved,
  onBook,
}: any) {
  const readOnly = useReadOnly();
  const dialog = useRef<HTMLDialogElement>(null);
  const [listId, setListId] = useState(
    String(book.list_context || book.lists?.[0]?.id || ""),
  );
  const [seriesId, setSeriesId] = useState(
    String(book.entity_type === "series" ? book.id : book.series_id || ""),
  );
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState(false);
  const [name, setName] = useState(book.english_title || book.name || "");
  const [author, setAuthor] = useState(
    book.author || book.original_author || "",
  );
  const [rank, setRank] = useState(book.list_rank ?? "");
  const [czechName, setCzechName] = useState(""),
    [slovakName, setSlovakName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const matches = series.filter((s: any) =>
    (s.name + " " + (s.original_author || ""))
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setError("");
    const body: any = create
      ? {
          new_series: {
            name,
            original_author: author || null,
            czech_name: czechName || null,
            slovak_name: slovakName || null,
          },
        }
      : { series_id: Number(seriesId) };
    if (book.entity_type === "series") {
      body.replace_series_id = book.id;
      body.rank = rank === "" ? null : Number(rank);
    } else if (
      book.id &&
      book.lists?.some((l: any) => l.id === Number(listId) && !l.via_series)
    )
      body.replace_book_id = book.id;
    else body.rank = rank === "" ? null : Number(rank);
    try {
      await api("/lists/" + listId + "/series-entries", "POST", body);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} onCancel={onClose}>
      <form onSubmit={save}>
        <div className="dialog-heading">
          <h2>{t("List entry")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close series editor")}
          >
            ✕
          </button>
        </div>
        <fieldset disabled={readOnly} style={{border: 0, padding: 0, margin: 0}}>
        <label>
          {" "}
          {t("Entry type")}{" "}
          <select value="series" onChange={() => onBook()}>
            <option value="book" disabled={book.entity_type === "series"}>
              {" "}
              {t("A book")}{" "}
            </option>
            <option value="series">{t("A book series")}</option>
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label>
          {" "}
          {t("Curated list")}{" "}
          <select
            required
            value={listId}
            disabled={book.entity_type === "series"}
            onChange={(e) => setListId(e.target.value)}
          >
            <option value="">{t("Choose a list")}</option>
            {lists.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button type="button" onClick={() => setCreate(!create)}>
            {create ? t("Choose an existing series") : t("Create a new series")}
          </button>
        </div>
        {create ? (
          <div className="form-grid">
            <label>
              {" "}
              {t("Series name")}{" "}
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              {" "}
              {t("Original author")}{" "}
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
            <label>
              {" "}
              {t("Czech name")}{" "}
              <input
                value={czechName}
                onChange={(e) => setCzechName(e.target.value)}
              />
            </label>
            <label>
              {" "}
              {t("Slovak name")}{" "}
              <input
                value={slovakName}
                onChange={(e) => setSlovakName(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <>
            <label>
              {" "}
              {t("Search series")}{" "}
              <input
                placeholder={t("Series name or original author")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              {" "}
              {t("Series")}{" "}
              <select
                required
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value)}
              >
                <option value="">{t("Choose a series")}</option>
                {series
                  .filter(
                    (s: any) =>
                      matches.includes(s) || String(s.id) === seriesId,
                  )
                  .map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.original_author ? " — " + s.original_author : ""}
                    </option>
                  ))}
              </select>
            </label>
            {!matches.length && (
              <p>{t("No matching series. You can create one above.")}</p>
            )}
          </>
        )}
        {book.entity_type === "series" || !book.id ? (
          <label>
            {" "}
            {t("List rank")}{" "}
            <input
              type="number"
              min="1"
              step="1"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
            />
          </label>
        ) : null}
        <p>
          {" "}
          {t(
            "This changes only the selected list entry. The existing book, its personal details, and other list memberships are kept. Books are assigned to the series separately.",
          )}{" "}
        </p>
        </fieldset>
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            {" "}
            {t("Cancel")}{" "}
          </button>
          <button
            className="primary"
            disabled={readOnly || busy || !listId || (!create && !seriesId)}
          >
            {busy ? t("Saving…") : t("Save series entry")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
