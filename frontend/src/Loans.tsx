import { useReadOnly } from "./library-access";
import { useEffect, useState } from "react";
import { api, type Book } from "./api";
import { t, errorText, number, useLanguage } from "./i18n";
import { formatDate } from "./reading-calendar";

export function LoanFields({
  borrower,
  loanDate,
  disabled,
  onChange,
}: {
  borrower: string;
  loanDate: string;
  disabled: boolean;
  onChange: (borrower: string, loanDate: string) => void;
}) {
  return (
    <fieldset className="loan-fields" disabled={disabled}>
      <legend>{t("Loan details")}</legend>
      <p>
        {t(
          "For books you lend to someone else. Leave both fields empty when the book is not on loan.",
        )}
      </p>
      <div className="form-grid">
        <label>
          {t("Borrower")}
          <input
            maxLength={500}
            value={borrower}
            required={!!loanDate}
            onChange={(e) => onChange(e.target.value, loanDate)}
          />
        </label>
        <label>
          {t("Date lent")}
          <input
            type="date"
            value={loanDate}
            required={!!borrower.trim()}
            onChange={(e) => onChange(borrower, e.target.value)}
          />
        </label>
      </div>
      {(borrower || loanDate) && (
        <button type="button" onClick={() => onChange("", "")}>
          {t("Mark returned")}
        </button>
      )}
      <p>
        {t(
          "Save the book to record changes. Returned loans remain in loan history.",
        )}
      </p>
    </fieldset>
  );
}

export function LendBook({
  revision,
  onSaved,
}: {
  revision: number;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: Book[]; total: number }>({
    items: [],
    total: 0,
  });
  const [selected, setSelected] = useState<Book | null>(null);
  const [borrower, setBorrower] = useState("");
  const [loanDate, setLoanDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setData({ items: [], total: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api(
        "/books?" +
          new URLSearchParams({
            q: query,
            offset: String(offset),
            limit: "20",
          }),
      )
        .then((result) => {
          if (active) setData(result);
        })
        .catch((error) => {
          if (active) {
            setError(errorText(error));
            setData({ items: [], total: 0 });
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, offset, revision]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !borrower.trim() || !loanDate) return;
    setBusy(true);
    setError("");
    try {
      await api("/books/" + selected.id + "/loan", "POST", {
        borrower: borrower.trim(),
        loan_date: loanDate,
      });
      setSelected(null);
      setQuery("");
      setBorrower("");
      setLoanDate("");
      setData({ items: [], total: 0 });
      onSaved();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function returnBook(book: Book) {
    if (!confirm(t("Mark {title} as returned?", { title: book.english_title })))
      return;
    setBusy(true);
    setError("");
    try {
      await api("/books/" + book.id, "PATCH", {
        borrower: null,
        loan_date: null,
      });
      onSaved();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>{t("Lend a book")}</h2>
      <label>
        {t("Search existing books")}
        <input
          disabled={busy}
          placeholder={t("Search title, author, or series…")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOffset(0);
            setSelected(null);
            setError("");
            setLoading(!!event.target.value.trim());
          }}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">{t("Loading…")}</p>}
      {!loading && query.trim() && !selected && (
        <>
          {!data.items.length && <p>{t("No matching books")}</p>}
          <ul className="loan-search-results">
            {data.items.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  disabled={busy || !!book.borrower}
                  onClick={() => setSelected(book)}
                >
                  {book.english_title}
                  {book.czech_title || book.slovak_title
                    ? " / " + (book.czech_title || book.slovak_title)
                    : ""}{" "}
                  — {book.author}
                </button>
                {book.borrower && (
                  <>
                    <span>
                      {t("Already lent to {borrower}", {
                        borrower: book.borrower,
                      })}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => returnBook(book)}
                    >
                      {t("Mark returned")}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {data.total > 20 && (
            <div className="page-buttons">
              <button
                disabled={busy || offset === 0}
                onClick={() => {
                  setLoading(true);
                  setOffset(offset - 20);
                }}
              >
                {t("← Previous")}
              </button>
              <button
                disabled={busy || offset + 20 >= data.total}
                onClick={() => {
                  setLoading(true);
                  setOffset(offset + 20);
                }}
              >
                {t("Next →")}
              </button>
            </div>
          )}
        </>
      )}
      {selected && (
        <form onSubmit={submit}>
          <p>
            <strong>{selected.english_title}</strong> — {selected.author}
          </p>
          <div className="form-grid">
            <label>
              {t("Borrower")}
              <input
                required
                maxLength={500}
                disabled={busy}
                value={borrower}
                onChange={(event) => setBorrower(event.target.value)}
              />
            </label>
            <label>
              {t("Date lent")}
              <input
                required
                type="date"
                disabled={busy}
                value={loanDate}
                onChange={(event) => setLoanDate(event.target.value)}
              />
            </label>
          </div>
          <div className="actions">
            <button
              className="primary"
              disabled={busy || !borrower.trim() || !loanDate}
            >
              {t(busy ? "Saving…" : "Record loan")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              {t("Choose another book")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function Loans({
  revision,
  edit,
  refresh,
  setError,
  status,
}: {
  status: "lent" | "returned";
  revision: number;
  edit: (id: number) => void;
  refresh: () => void;
  setError: (message: string) => void;
}) {
  const language = useLanguage();
  const readOnly = useReadOnly();
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: Book[]; total: number }>({
    items: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api(
        "/loans?" +
          new URLSearchParams({
            status,
            q: query,
            offset: String(offset),
            limit: "50",
          }),
      )
        .then((result) => {
          if (!active) return;
          if (offset > 0 && offset >= result.total) {
            setOffset(Math.max(0, Math.floor((result.total - 1) / 50) * 50));
          } else setData(result);
        })
        .catch((error) => {
          if (active) setError(errorText(error));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, offset, revision, setError, status]);
  async function returned(book: Book) {
    if (!confirm(t("Mark {title} as returned?", { title: book.english_title })))
      return;
    setBusy(true);
    try {
      await api("/books/" + book.id, "PATCH", {
        borrower: null,
        loan_date: null,
      });
      refresh();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  const pages = (
    <div className="page-buttons">
      <button
        disabled={loading || busy || offset === 0}
        onClick={() => setOffset(offset - 50)}
      >
        {t("← Previous")}
      </button>
      <button
        disabled={loading || busy || offset + 50 >= data.total}
        onClick={() => setOffset(offset + 50)}
      >
        {t("Next →")}
      </button>
    </div>
  );
  return (
    <section>
      {status === "lent" && !readOnly && (
        <LendBook
          revision={revision}
          onSaved={() => {
            setQuery("");
            setOffset(0);
            refresh();
          }}
        />
      )}
      <h2>{t(status === "lent" ? "Lent books" : "Returned books")}</h2>
      <div className="toolbar">
        <label className="search">
          <input
            aria-label={t("Filter loan records")}
            placeholder={t("Filter loan records")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
              setLoading(true);
            }}
          />
        </label>
        <span className="count">
          {t(
            status === "lent"
              ? "Active loans: {count}"
              : "Returned loans: {count}",
            { count: number(data.total) },
          )}
        </span>
        {pages}
      </div>
      {loading && <p role="status">{t("Loading…")}</p>}
      {!loading && !data.total ? (
        <div className="empty">
          <h2>
            {t(
              query
                ? "No matching loans"
                : status === "lent"
                  ? "No books on loan"
                  : "No returned loans yet",
            )}
          </h2>
          <p>
            {t(
              status === "lent"
                ? "Search your collection above to record a new loan."
                : "Returned loans appear here after you mark a book returned.",
            )}
          </p>
        </div>
      ) : (
        <div className="table-wrap" aria-busy={loading || busy}>
          <table>
            <thead>
              <tr>
                {[
                  "English title",
                  "CZ / SK title",
                  "Author",
                  "Borrower",
                  "Date lent",
                  status === "lent" ? "Actions" : "Date returned",
                ].map((label) => (
                  <th key={label}>{t(label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((book) => (
                <tr key={book.loan_id || book.id}>
                  <td>
                    <button
                      className="title-link"
                      disabled={loading || busy}
                      onClick={() => edit(book.id)}
                    >
                      {book.english_title}
                    </button>
                  </td>
                  <td>{book.czech_title || book.slovak_title || "—"}</td>
                  <td>{book.author}</td>
                  <td>{book.borrower}</td>
                  <td>
                    <time dateTime={book.loan_date}>
                      {formatDate(book.loan_date, language)}
                    </time>
                  </td>
                  <td>
                    {status === "lent" ? (
                      <button
                        disabled={readOnly || loading || busy}
                        onClick={() => returned(book)}
                      >
                        {t("Mark returned")}
                      </button>
                    ) : (
                      <time dateTime={book.returned_at}>
                        {formatDate(book.returned_at, language)}
                      </time>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">{pages}</div>
    </section>
  );
}
