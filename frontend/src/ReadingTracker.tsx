import { useReadOnly } from "./library-access";
import { useEffect, useState } from "react";
import { api, type Book } from "./api";
import { t, errorText, number, useLanguage } from "./i18n";
import {
  formatDate,
  localDay,
  monthDays,
  shiftMonth,
  readingPace,
} from "./reading-calendar";

export type ReadingSession = {
  id: number;
  book_id: number;
  status: "active" | "completed" | "stopped";
  started_on: string | null;
  ended_on: string | null;
  reading_days: string[];
  book: Book;
};
const statusLabel = {
  active: "Currently reading",
  completed: "Completed",
  stopped: "Stopped without completion",
};

export function ReadingHistory({
  sessions,
  pages,
}: {
  sessions: ReadingSession[];
  pages: number | null;
}) {
  const language = useLanguage();
  return (
    <details className="reading-history">
      <summary>{t("Reading history")}</summary>
      {!sessions.length && <p>{t("No reading history yet.")}</p>}
      {sessions.map((item) => {
        const pace = readingPace(pages, item.reading_days);
        return (
          <section key={item.id}>
            <strong>
              {t(item.started_on ? statusLabel[item.status] : "Not started")}
            </strong>
            <p>
              {item.started_on
                ? formatDate(item.started_on, language)
                : t("Not started")}{" "}
              —{" "}
              {item.ended_on
                ? formatDate(item.ended_on, language)
                : t("In progress")}
            </p>
            <p>
              {t("Reading days")}:{" "}
              {item.reading_days.length
                ? item.reading_days
                    .map((day) => formatDate(day, language))
                    .join(", ")
                : "—"}
            </p>
            <p>
              {t("Reading pace")}:{" "}
              {pace === null
                ? "—"
                : t("{pace} pages/day", { pace: number(pace, 1) })}
            </p>
          </section>
        );
      })}
    </details>
  );
}

export function ReadingTracker({
  revision,
  refresh,
  edit,
  setError,
}: {
  revision: number;
  refresh: () => void;
  edit: (id: number) => void;
  setError: (message: string) => void;
}) {
  const language = useLanguage();
  const readOnly = useReadOnly();
  const [today, setToday] = useState(localDay());
  const [startDates, setStartDates] = useState<Record<number, string>>({});
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0);
  const [matches, setMatches] = useState<{ items: Book[]; total: number }>({
    items: [],
    total: 0,
  });
  const [searching, setSearching] = useState(false);
  const days = monthDays(month);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const range = monthDays(month);
    api(
      "/reading?" +
        new URLSearchParams({
          from_date: range[0],
          to_date: range[range.length - 1],
        }),
    )
      .then((result) => {
        if (active) {
          setSessions(result.items);
          setToday(result.today);
        }
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month, revision, setError]);
  // Refresh the calendar date after midnight, without depending on UTC conversion.
  useEffect(() => {
    const timer = setInterval(() => setToday(localDay()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setMatches({ items: [], total: 0 });
      setSearching(false);
      return;
    }
    setSearching(true);
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
          if (active) setMatches(result);
        })
        .catch((error) => {
          if (active) {
            setMatches({ items: [], total: 0 });
            setError(errorText(error));
          }
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, offset, revision, setError]);
  async function start(book: Book) {
    setBusy(true);
    setError("");
    try {
      await api("/reading", "POST", { book_id: book.id });
      setQuery("");
      setMonth(today.slice(0, 7));
      refresh();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function reopen(item: ReadingSession) {
    setBusy(true);
    setError("");
    try {
      await api("/reading/" + item.id + "/reopen", "POST");
      refresh();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function mark(item: ReadingSession, day: string, action: string) {
    if (action === "stop" || action === "complete") {
      const message =
        action === "stop"
          ? "Stop reading {title} without completion on {date}?"
          : "Mark {title} completed on {date}?";
      if (
        !confirm(
          t(message, {
            title: item.book.english_title,
            date: formatDate(day, language),
          }),
        )
      )
        return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/reading/" + item.id + "/days", "POST", { day, action });
      refresh();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="panel">
        <h2>{t("Add a book to the tracker")}</h2>
        <label>
          {t("Search existing books")}
          <input
            disabled={busy}
            value={query}
            placeholder={t("Search title, author, or series…")}
            onChange={(event) => {
              setQuery(event.target.value);
              setOffset(0);
              setSearching(!!event.target.value.trim());
            }}
          />
        </label>
        {searching && <p role="status">{t("Loading…")}</p>}
        {!searching && query.trim() && (
          <>
            {!matches.items.length && <p>{t("No matching books")}</p>}
            <ul className="loan-search-results">
              {matches.items.map((book) => {
                const active = sessions.some(
                  (item) =>
                    item.book_id === book.id && item.status === "active",
                );
                return (
                  <li key={book.id}>
                    <span>
                      {book.english_title}
                      {book.czech_title || book.slovak_title
                        ? " / " + (book.czech_title || book.slovak_title)
                        : ""}{" "}
                      — {book.author}
                    </span>
                    <button
                      disabled={readOnly || busy || loading || active}
                      onClick={() => start(book)}
                    >
                      {t(active ? "Already in tracker" : "Add to tracker")}
                    </button>
                  </li>
                );
              })}
            </ul>
            {matches.total > 20 && (
              <div className="page-buttons">
                <button
                  disabled={busy || offset === 0}
                  onClick={() => {
                    setSearching(true);
                    setOffset(offset - 20);
                  }}
                >
                  {t("← Previous")}
                </button>
                <button
                  disabled={busy || offset + 20 >= matches.total}
                  onClick={() => {
                    setSearching(true);
                    setOffset(offset + 20);
                  }}
                >
                  {t("Next →")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="toolbar">
        <button
          disabled={busy || loading}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          {t("Previous month")}
        </button>
        <label>
          {t("Calendar month")}
          <input
            type="month"
            value={month}
            max={today.slice(0, 7)}
            disabled={busy}
            onChange={(event) => {
              if (
                /^\d{4}-\d{2}$/.test(event.target.value) &&
                event.target.value <= today.slice(0, 7)
              )
                setMonth(event.target.value);
            }}
          />
        </label>
        <button
          disabled={busy || loading || month >= today.slice(0, 7)}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          {t("Next month")}
        </button>
        <button disabled={busy} onClick={() => setMonth(today.slice(0, 7))}>
          {t("Current month")}
        </button>
      </div>
      <p>
        {t(
          "Use + to log a reading day, − to undo it, ■ to stop, and ✓ to complete the book. Only today and past days can be logged.",
        )}
      </p>
      <p>
        {t(
          "Choose a start date to unlock reading actions. Undo start preserves other logged days.",
        )}
      </p>
      <p>
        {t(
          "Pace = number of pages / logged reading days. It is an estimate until the book is completed.",
        )}
      </p>
      {loading && <p role="status">{t("Loading…")}</p>}
      {!loading && !sessions.length && (
        <p>
          {t(
            "No books tracked in this month. Search your collection above to start.",
          )}
        </p>
      )}
      {sessions.length > 0 && (
        <div
          className="reading-calendar table-wrap"
          aria-busy={loading || busy}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Calendar day")}</th>
                {sessions.map((item) => {
                  const pace = readingPace(
                    item.book.page_count,
                    item.reading_days,
                  );
                  return (
                    <th key={item.id} scope="col">
                      <button
                        className="title-link"
                        onClick={() => edit(item.book_id)}
                      >
                        {item.book.english_title}
                      </button>
                      <small>
                        {item.book.czech_title || item.book.slovak_title}
                      </small>
                      <small>{item.book.author}</small>
                      <small>
                        {t(
                          item.started_on
                            ? statusLabel[item.status]
                            : "Not started",
                        )}
                      </small>
                      {item.status === "active" && !item.started_on && (
                        <div>
                          <label>
                            {t("Start date")}
                            <input
                              type="date"
                              max={today}
                              disabled={readOnly || busy || loading}
                              value={startDates[item.id] || today}
                              onChange={(event) =>
                                setStartDates({
                                  ...startDates,
                                  [item.id]: event.target.value,
                                })
                              }
                            />
                          </label>
                          <button
                            disabled={readOnly || busy || loading}
                            onClick={() => {
                              const day = startDates[item.id] || today;
                              setMonth(day.slice(0, 7));
                              mark(item, day, "start");
                            }}
                          >
                            {t("Start reading")}
                          </button>
                        </div>
                      )}
                      <small>
                        {t("Reading days")}: {item.reading_days.length}
                      </small>
                      <small>
                        {t("Reading pace")}:{" "}
                        {pace === null
                          ? "—"
                          : t("{pace} pages/day", { pace: number(pace, 1) })}
                      </small>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr
                  key={day}
                  className={
                    day === today
                      ? "reading-today"
                      : day > today
                        ? "reading-future"
                        : ""
                  }
                >
                  <th scope="row">
                    <time dateTime={day}>{formatDate(day, language)}</time>
                  </th>
                  {sessions.map((item) => {
                    const logged = item.reading_days.includes(day);
                    const ended = item.ended_on === day;
                    return (
                      <td
                        key={item.id}
                        className={logged ? "reading-logged" : ""}
                      >
                        {item.status === "active" &&
                        item.started_on &&
                        day >= item.started_on &&
                        day <= today ? (
                          <div className="reading-actions">
                            {day === item.started_on && (
                              <button
                                disabled={readOnly || busy || loading}
                                onClick={() => mark(item, day, "undo_start")}
                              >
                                {t("Undo start")}
                              </button>
                            )}
                            <button
                              disabled={readOnly || busy || loading}
                              aria-pressed={logged}
                              title={t(
                                logged
                                  ? "Remove reading day"
                                  : "Log reading day",
                              )}
                              aria-label={t("{action}: {title}, {date}", {
                                action: t(
                                  logged
                                    ? "Remove reading day"
                                    : "Log reading day",
                                ),
                                title: item.book.english_title,
                                date: formatDate(day, language),
                              })}
                              onClick={() =>
                                mark(item, day, logged ? "remove" : "read")
                              }
                            >
                              {logged ? "−" : "+"}
                            </button>
                            <button
                              disabled={readOnly || busy || loading}
                              title={t("Stop without completion")}
                              aria-label={t("{action}: {title}, {date}", {
                                action: t("Stop without completion"),
                                title: item.book.english_title,
                                date: formatDate(day, language),
                              })}
                              onClick={() => mark(item, day, "stop")}
                            >
                              ■
                            </button>
                            <button
                              disabled={readOnly || busy || loading}
                              title={t("Complete book")}
                              aria-label={t("{action}: {title}, {date}", {
                                action: t("Complete book"),
                                title: item.book.english_title,
                                date: formatDate(day, language),
                              })}
                              onClick={() => mark(item, day, "complete")}
                            >
                              ✓
                            </button>
                          </div>
                        ) : ended && item.status === "completed" ? (
                          <div className="reading-actions">
                            <span title={t("Completed")}>?</span>
                            <button
                              disabled={readOnly || busy || loading}
                              aria-label={t("{action}: {title}, {date}", {
                                action: t("Undo completion"),
                                title: item.book.english_title,
                                date: formatDate(day, language),
                              })}
                              onClick={() => reopen(item)}
                            >
                              {t("Undo completion")}
                            </button>
                          </div>
                        ) : (
                          <span
                            title={t(
                              ended
                                ? statusLabel[item.status]
                                : logged
                                  ? "Reading day logged"
                                  : "No reading logged",
                            )}
                          >
                            {ended
                              ? item.status === "completed"
                                ? "✓"
                                : "■"
                              : logged
                                ? "●"
                                : "—"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
