import { useReadOnly } from "./library-access";
import {
  t,
  errorText,
  number,
  useLanguage,
  setLanguage,
  type Language,
} from "./i18n";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  api,
  ApiError,
  Book,
  boolFields,
  textFields,
  numeric,
  profileHeaders,
  profileUrl,
} from "./api";
import { ImportReview } from "./ImportReview";
import { resolveImport, type ImportConflict } from "./import-review";
import "./style.css";
import { loadSeriesBooks } from "./series-expansion";
import { hasTranslation, rowClasses, selectRows } from "./collection-state";
import { SeriesEntryEditor } from "./SeriesEntryEditor";
import { SeriesDetailsEditor } from "./SeriesDetailsEditor";
import { InlineRating } from "./InlineRating";
import { Loans, LoanFields } from "./Loans";
import { ReadingTracker, ReadingHistory } from "./ReadingTracker";

const nav = [
  "Collection",
  "Greatest Books",
  "Series",
  "Loans",
  "Reading tracker",
  "Statistics",
  "Import / Export",
  "Settings",
];

function App() {
  const readOnly = useReadOnly();
  useLanguage();
  const [loanStatus, setLoanStatus] = useState<"lent" | "returned">("lent");
  const [page, setPage] = useState("Collection"),
    [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<any>(null),
    [error, setError] = useState("");
  const [series, setSeries] = useState<any[]>([]),
    [lists, setLists] = useState<any[]>([]);
  const [scope, setScope] = useState<any>(null);
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    api("/series")
      .then(setSeries)
      .catch(() => {});
    api("/lists")
      .then(setLists)
      .catch(() => {});
  }, [revision]);
  async function edit(id: number, context: any = {}) {
    try {
      const item = await api(
        (context.entity_type === "series" ? "/series/" : "/books/") +
          (context.entity_type === "series" ? context.series_id : id),
      );
      setEditor({
        ...item,
        entity_type: context.entity_type || "book",
        list_context: context.list_id,
        list_rank: context.rank,
        view: context.view,
      });
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="brand-mark">B</span>
          <div>
            BookDB<small>{t("A personal library")}</small>
          </div>
        </div>
        <nav>
          {nav.map((n, i) => (
            <React.Fragment key={n}>
              <button
                key={n}
                className={page === n ? "active" : ""}
                onClick={() => {
                  setPage(n);
                  setScope(null);
                  setError("");
                }}
              >
                <span>{["▤", "◇", "▥", "⇄", "▦", "▥", "↕", "⚙"][i]}</span>
                {t(n)}
              </button>
              {n === "Loans" && page === "Loans" && (
                <div className="loan-submenu">
                  {(["lent", "returned"] as const).map((status) => (
                    <button
                      key={status}
                      className={loanStatus === status ? "active" : ""}
                      aria-current={loanStatus === status ? "page" : undefined}
                      onClick={() => {
                        setLoanStatus(status);
                        setError("");
                      }}
                    >
                      {t(status === "lent" ? "Lent books" : "Returned books")}
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
          ))}
        </nav>
        <div className="local">
          <i /> {t("Local & private")}
          <small>{t("Your books. On your computer.")}</small>
        </div>
      </aside>
      <main>
        <header>
          <div className="eyebrow">
            {t("YOUR LIBRARY /")} {t(page).toLocaleUpperCase()}
          </div>
          <div className="header-line">
            <h1>{scope?.name || t(page)}</h1>
            <button
              className="primary"
              disabled={readOnly}
              onClick={() =>
                setEditor({
                  series_id: page === "Series" ? scope?.id : null,
                  author:
                    page === "Series"
                      ? series.find((s) => s.id === scope?.id)
                          ?.original_author || ""
                      : "",
                  list_context: page === "Greatest Books" ? scope?.id : null,
                })
              }
            >
              {" "}
              {t("+ Add book")}{" "}
            </button>
          </div>
          <p className="subtitle">
            {page === "Collection"
              ? t(
                  "Every book, one place. Keep track of what you own, read, and want to discover.",
                )
              : page === "Greatest Books"
                ? t("Explore curated reading lists and follow your progress.")
                : page === "Series"
                  ? t("Keep the next book in sight.")
                  : page === "Statistics"
                    ? t("A little perspective on your reading life.")
                    : page === "Import / Export"
                      ? t("Bring your library with you. Keep a copy close.")
                      : page === "Loans"
                        ? t("Keep track of books you have lent out.")
                        : t("Your local workspace.")}
          </p>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
            <button onClick={() => setError("")}>{t("Dismiss")}</button>
          </div>
        )}
        {page === "Collection" && (
          <Collection
            {...{ revision, series, lists, edit, refresh, setError }}
          />
        )}
        {page === "Greatest Books" && (
          <FeaturePage
            kind="lists"
            {...{
              scope,
              setScope,
              lists,
              series,
              revision,
              edit,
              refresh,
              setError,
            }}
          />
        )}
        {page === "Series" && (
          <FeaturePage
            kind="series"
            {...{
              scope,
              setScope,
              lists,
              series,
              revision,
              edit,
              refresh,
              setError,
            }}
          />
        )}
        {page === "Statistics" && (
          <Statistics revision={revision} setError={setError} />
        )}
        {page === "Import / Export" && (
          <Transfers refresh={refresh} setError={setError} />
        )}
        {page === "Loans" && (
          <Loans
            key={loanStatus}
            status={loanStatus}
            {...{ revision, edit, refresh, setError }}
          />
        )}
        {page === "Reading tracker" && (
          <ReadingTracker {...{ revision, refresh, edit, setError }} />
        )}
        {page === "Settings" && <Settings />}
        <footer>
          BOOKDB <span>{t("Made for the books you keep.")}</span>
        </footer>
      </main>
      {editor?.entity_type === "series" && editor.view !== "membership" ? (
        <SeriesDetailsEditor
          key={editor.id}
          series={editor}
          onClose={() => setEditor(null)}
          onSaved={(result: any) => {
            setEditor(null);
            if (page === "Series" && scope?.id === result.id) setScope(result);
            refresh();
          }}
          onMembership={
            editor.list_context
              ? () => setEditor({ ...editor, view: "membership" })
              : undefined
          }
        />
      ) : (
        editor && (
          <BookEditor
            key={`${editor.entity_type || "book"}-${editor.id || "new"}`}
            lists={lists}
            book={editor}
            series={series}
            onClose={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              refresh();
            }}
            edit={edit}
          />
        )
      )}
    </div>
  );
}

function Collection({
  revision,
  series,
  lists,
  edit,
  refresh,
  setError,
  scope,
  kind,
}: any) {
  const readOnly = useReadOnly();
  const [selected, setSelected] = useState<number[]>([]);
  const [batch, setBatch] = useState<Record<string, string>>({});
  const [batchBusy, setBatchBusy] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [seriesBooks, setSeriesBooks] = useState<Record<number, Book[]>>({});
  const [seriesBusy, setSeriesBusy] = useState(false);
  const anchor = useRef<number | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("blur", stop);
    };
  }, []);
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(
      kind === "lists"
        ? "rank"
        : kind === "series"
          ? "series_position"
          : "author",
    ),
    [direction, setDirection] = useState("asc"),
    [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: Book[]; total: number }>({
      items: [],
      total: 0,
    }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState<number[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setOffset(0);
    }, 220);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({
      q: search,
      sort,
      direction,
      offset: String(offset),
      limit: "50",
      include_series: "true",
      ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== ""),
      ),
    });
    if (scope)
      params.set(
        kind === "lists" ? "curated_list_id" : "series_id",
        String(scope.id),
      );
    api("/books?" + params)
      .then((d) => {
        if (active) {
          setData(d);
          if (offset > 0 && offset >= d.total)
            setOffset(Math.max(0, Math.floor((d.total - 1) / 50) * 50));
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, search, sort, direction, offset, filters, scope, kind]);
  const currentListId =
    kind === "lists" && scope
      ? Number(scope.id)
      : filters.curated_list_id
        ? Number(filters.curated_list_id)
        : null;
  useEffect(() => {
    let active = true;
    const ids = [
      ...new Set(
        data.items
          .filter((b) => expanded.includes(b.id) && b.series_id)
          .map((b) => Number(b.series_id)),
      ),
    ];
    if (!ids.length) {
      setSeriesBusy(false);
      return;
    }
    setSeriesBusy(true);
    Promise.all(
      ids.map(
        async (id) => [id, await loadSeriesBooks(id, currentListId)] as const,
      ),
    )
      .then((entries) => {
        if (active) setSeriesBooks(Object.fromEntries(entries));
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e));
          setExpanded([]);
        }
      })
      .finally(() => {
        if (active) setSeriesBusy(false);
      });
    return () => {
      active = false;
    };
  }, [expanded, data.items, revision, currentListId]);
  const visibleRows = data.items.flatMap((book) => [
    { book, nested: false, parent: 0 },
    ...(expanded.includes(book.id)
      ? (seriesBooks[book.series_id] || []).map((child) => ({
          book: child,
          nested: true,
          parent: book.id,
        }))
      : []),
  ]);
  const visibleIds = [
    ...new Set(
      visibleRows
        .filter((row) => row.book.entity_type !== "series")
        .map((row) => row.book.id),
    ),
  ];
  const visibleKey = visibleIds.join(",");
  useEffect(() => {
    setSelected([]);
    anchor.current = null;
    setBatch({});
    setExpanded([]);
    setSeriesBooks({});
  }, [search, sort, direction, offset, filters, scope, kind]);
  useEffect(() => {
    setSelected((ids) => ids.filter((id) => visibleIds.includes(id)));
  }, [visibleKey]);
  function selectRow(id: number, additive = false, range = false) {
    if (id < 0) return;
    setSelected((ids) =>
      selectRows(ids, visibleIds, id, anchor.current, additive, range),
    );
    if (!range) anchor.current = id;
  }
  async function applyBatch(changes: Record<string, unknown>, ids = selected) {
    if (!ids.length || !Object.keys(changes).length) return;
    setBatchBusy(true);
    setError("");
    try {
      await api("/books/batch", "PATCH", { ids, changes });
      setBatch({});
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBatchBusy(false);
    }
  }
  function filter(k: string, v: string) {
    setFilters({ ...filters, [k]: v });
    setOffset(0);
    if (k === "curated_list_id") {
      if (v) {
        setSort("rank");
        setDirection("asc");
      } else if (sort === "rank") {
        setSort("author");
        setDirection("asc");
      }
    }
  }
  function order(k: string) {
    setSort(k);
    setDirection(sort === k && direction === "asc" ? "desc" : "asc");
    setOffset(0);
  }
  async function toggle(book: Book, key: string) {
    const value = key === "translated" ? !hasTranslation(book) : !book[key];
    if (key === "translated" || selected.includes(book.id)) {
      await applyBatch(
        { [key]: value },
        selected.includes(book.id) ? selected : [book.id],
      );
      return;
    }
    setBusy((b) => [...b, book.id]);
    try {
      await api("/books/" + book.id, "PATCH", { [key]: !book[key] });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy((b) => b.filter((id) => id !== book.id));
    }
  }
  async function rate(book: Book, rating: number | null) {
    if (!book.read) return;
    setBusy((ids) => [...ids, book.id]);
    setError("");
    try {
      await api("/books/" + book.id + "/rating", "PATCH", { rating });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy((ids) => ids.filter((id) => id !== book.id));
    }
  }
  const columns = [
    ...(kind === "lists" || filters.curated_list_id ? [["rank", "#"]] : []),
    ...(currentListId !== null ? [["list_membership", "On list"]] : []),
    ["author", "Author"],
    ["english_title", "English title"],
    ["release_year", "Year"],
    ["translated", "CZ / SK"],
    ["local_title", "CZ / SK title"],
    ["owned", "Owned"],
    ["read", "Read"],
    ["rating", "Rating"],
    ["knihobot_watchlist", "Watch"],
    ["knihobot_wishlist", "Wish"],
    ["expected_price", "Price"],
    ["series", "Series"],
    ["series_position", "Series #"],
  ];
  const pageButtons = (
    <div className="page-buttons">
      <button
        disabled={offset === 0 || loading || batchBusy}
        onClick={() => setOffset(offset - 50)}
      >
        {" "}
        {t("← Previous")}{" "}
      </button>
      <button
        disabled={offset + 50 >= data.total || loading || batchBusy}
        onClick={() => setOffset(offset + 50)}
      >
        {" "}
        {t("Next →")}{" "}
      </button>
    </div>
  );
  return (
    <section>
      <div className="toolbar">
        <label className="search">
          <span>⌕</span>
          <input
            aria-label={t("Search books")}
            placeholder={t("Search title, author, or series…")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <span className="count">
          {number(data.total)}{" "}
          {currentListId !== null ? t("entries") : t("books")}
        </span>
        {pageButtons}
      </div>
      <div className="filters">
        {[
          ["owned", "Ownership", "Owned", "Not owned"],
          ["read", "Reading", "Read", "Unread"],
          ["translated", "Translation", "CZ or SK", "No known CZ/SK"],
          ["knihobot_watchlist", "Watchlist", "On watchlist", "Off watchlist"],
          ["knihobot_wishlist", "Wishlist", "On wishlist", "Off wishlist"],
        ].map(([key, label, yes, no]) => (
          <select
            aria-label={t(label)}
            key={key}
            value={filters[key] || ""}
            onChange={(e) => filter(key, e.target.value)}
          >
            <option value="">
              {t(label)}
              {t(": all")}
            </option>
            <option value="true">{t(yes)}</option>
            <option value="false">{t(no)}</option>
          </select>
        ))}
        <select
          aria-label={t("Rating filter")}
          value={filters.rating || ""}
          onChange={(e) => filter("rating", e.target.value)}
        >
          <option value="">{t("Rating: all")}</option>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} {t("stars")}{" "}
            </option>
          ))}
        </select>
        {!scope && (
          <>
            <select
              aria-label={t("Series filter")}
              value={filters.series_id || ""}
              onChange={(e) => filter("series_id", e.target.value)}
            >
              <option value="">{t("All series")}</option>
              {series.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Curated list filter")}
              value={filters.curated_list_id || ""}
              onChange={(e) => filter("curated_list_id", e.target.value)}
            >
              <option value="">{t("All curated lists")}</option>
              {lists.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </>
        )}
        {(q || Object.values(filters).some(Boolean)) && (
          <button
            className="subtle"
            onClick={() => {
              setQ("");
              setFilters({});
              setOffset(0);
              if (sort === "rank" && kind !== "lists") {
                setSort("author");
                setDirection("asc");
              }
            }}
          >
            {" "}
            {t("Clear filters")}{" "}
          </button>
        )}
      </div>
      <p className="selection-help">
        {" "}
        {t(
          "Click or drag rows to select. Ctrl-click adds/removes rows; Shift-click selects a range. Selection stays on this page. A checkbox in a selected row applies to all selected books.",
        )}{" "}
      </p>
      {selected.length > 0 && (
        <div
          className="batch-toolbar"
          aria-label={t("Batch edit selected books")}
        >
          <strong>
            {selected.length} {t("selected")}
          </strong>
          {Object.entries({
            translated: "CZ/SK available",
            owned: "Owned",
            read: "Read",
            knihobot_watchlist: "Watchlist",
            knihobot_wishlist: "Wishlist",
          }).map(([key, label]) => (
            <label key={key}>
              {t(label)}
              <select
                disabled={readOnly || batchBusy}
                value={batch[key] || ""}
                onChange={(e) => setBatch({ ...batch, [key]: e.target.value })}
              >
                <option value="">{t("Keep unchanged")}</option>
                <option value="true">{t("Yes")}</option>
                <option value="false">{t("No")}</option>
              </select>
            </label>
          ))}
          <button
            className="primary"
            disabled={
              readOnly || batchBusy || loading || !Object.values(batch).some(Boolean)
            }
            onClick={() =>
              applyBatch(
                Object.fromEntries(
                  Object.entries(batch)
                    .filter(([, v]) => v)
                    .map(([k, v]) => [k, v === "true"]),
                ),
              )
            }
          >
            {batchBusy ? t("Saving…") : t("Apply changes")}
          </button>
          <button disabled={readOnly || batchBusy} onClick={() => setSelected([])}>
            {" "}
            {t("Clear selection")}{" "}
          </button>
        </div>
      )}
      <div className="table-wrap" aria-busy={loading || batchBusy}>
        <table>
          <thead>
            <tr>
              <th colSpan={2}>
                <input
                  type="checkbox"
                  aria-label={t("Select all books on this page")}
                  checked={
                    visibleIds.length > 0 &&
                    selected.length === visibleIds.length
                  }
                  disabled={loading || batchBusy}
                  onChange={(e) =>
                    setSelected(e.target.checked ? visibleIds : [])
                  }
                />
              </th>
              {columns.map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={
                    sort === key
                      ? direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    disabled={key === "list_membership"}
                    onClick={() => order(key)}
                  >
                    {t(label)}{" "}
                    {sort === key ? (direction === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ book: b, nested, parent }, rowIndex) => (
              <React.Fragment key={`${parent}-${b.id}`}>
                <tr
                  key={`${parent}-${b.id}`}
                  className={`${rowClasses(b)}${selected.includes(b.id) ? " row-selected" : ""}${nested ? " series-child" : ""}`}
                  aria-selected={selected.includes(b.id)}
                  tabIndex={0}
                  onMouseDown={(e) => {
                    if (
                      b.entity_type === "series" ||
                      e.button !== 0 ||
                      batchBusy ||
                      loading ||
                      (e.target as HTMLElement).closest(
                        "button,input,select,label,a",
                      )
                    )
                      return;
                    e.preventDefault();
                    selectRow(b.id, e.ctrlKey || e.metaKey, e.shiftKey);
                    dragging.current = true;
                  }}
                  onMouseEnter={(e) => {
                    if (dragging.current && e.buttons === 1 && !batchBusy)
                      selectRow(b.id, e.ctrlKey || e.metaKey, true);
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === " ") {
                      e.preventDefault();
                      selectRow(b.id, e.ctrlKey || e.metaKey, e.shiftKey);
                    } else if (e.key === "Escape") setSelected([]);
                  }}
                >
                  {nested && (
                    <td className="series-indent" aria-hidden="true" />
                  )}
                  <td colSpan={nested ? 1 : 2}>
                    {b.entity_type === "series" ? (
                      <span className="series-label">{t("Series")}</span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={t("Select {title}", {
                          title: b.english_title,
                        })}
                        checked={selected.includes(b.id)}
                        disabled={loading || batchBusy}
                        onChange={() => selectRow(b.id, true)}
                      />
                    )}
                  </td>
                  {columns.map(([key]) => (
                    <td key={key}>
                      {(key in boolFields || key === "translated") &&
                      b.entity_type === "series" ? (
                        <span>
                          {b.stats[
                            key === "translated"
                              ? "translated"
                              : key === "knihobot_watchlist"
                                ? "watchlist"
                                : key === "knihobot_wishlist"
                                  ? "wishlist"
                                  : key
                          ] ?? 0}
                          /{b.stats.total}
                        </span>
                      ) : key in boolFields || key === "translated" ? (
                        <input
                          type="checkbox"
                          aria-label={`${t(key === "translated" ? "CZ/SK translation" : boolFields[key as keyof typeof boolFields])}: ${b.english_title}`}
                          checked={
                            key === "translated" ? hasTranslation(b) : b[key]
                          }
                          disabled={readOnly || loading || batchBusy || busy.includes(b.id)}
                          onChange={() => toggle(b, key)}
                        />
                      ) : key === "author" && b.entity_type === "series" ? (
                        b.author || t("Not entered")
                      ) : key === "english_title" ? (
                        <button
                          className="title-link"
                          onClick={() =>
                            edit(b.id, {
                              entity_type: b.entity_type,
                              series_id: b.series_id,
                              list_id: currentListId,
                              rank: b.rank,
                            })
                          }
                        >
                          {b.english_title}
                        </button>
                      ) : key === "local_title" ? (
                        <div className="translated-titles">
                          {b.czech_title || b.slovak_title || "—"}
                        </div>
                      ) : key === "rating" ? (
                        b.entity_type === "series" ? (
                          "—"
                        ) : (
                          <InlineRating
                            title={b.english_title}
                            rating={b.rating}
                            read={b.read}
                            disabled={
                              readOnly || loading || batchBusy || busy.includes(b.id)
                            }
                            onChange={(value) => rate(b, value)}
                          />
                        )
                      ) : key === "list_membership" ? (
                        b.in_current_list === false ? (
                          "Not on list"
                        ) : (
                          "On list"
                        )
                      ) : key === "series" ? (
                        b.series_id ? (
                          <span className="series-cell">
                            {!nested && (
                              <button
                                className="series-toggle"
                                aria-expanded={expanded.includes(b.id)}
                                aria-label={t(
                                  "{action} series {series} for {title}",
                                  {
                                    action: t(
                                      expanded.includes(b.id)
                                        ? "Collapse"
                                        : "Expand",
                                    ),
                                    series: b.series_name,
                                    title: b.english_title,
                                  },
                                )}
                                onClick={() =>
                                  setExpanded((ids) =>
                                    ids.includes(b.id)
                                      ? ids.filter((id) => id !== b.id)
                                      : [...ids, b.id],
                                  )
                                }
                              >
                                <span aria-hidden="true">
                                  {expanded.includes(b.id) ? "▾" : "▸"}
                                </span>
                                {expanded.includes(b.id) && seriesBusy && (
                                  <small> {t("Loading…")}</small>
                                )}
                              </button>
                            )}
                            <button
                              className="title-link"
                              onClick={() =>
                                edit(b.series_id, {
                                  entity_type: "series",
                                  series_id: b.series_id,
                                  list_id:
                                    b.entity_type === "series"
                                      ? currentListId
                                      : undefined,
                                  rank: b.rank,
                                })
                              }
                            >
                              {b.series_name}
                            </button>
                          </span>
                        ) : (
                          b.series_name || "—"
                        )
                      ) : (
                        (b[key] ?? "—")
                      )}
                    </td>
                  ))}
                </tr>
                {nested &&
                  visibleRows[rowIndex + 1] &&
                  (!visibleRows[rowIndex + 1].nested ||
                    visibleRows[rowIndex + 1].parent !== parent) && (
                    <tr className="series-gap" aria-hidden="true">
                      <td colSpan={columns.length + 2} />
                    </tr>
                  )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {!data.items.length && (
          <div className="empty">
            <div className="empty-icon">▤</div>
            <h2>
              {loading
                ? t("Loading your books…")
                : search || Object.values(filters).some(Boolean)
                  ? t("No matching books")
                  : t("A place for your next chapter")}
            </h2>
            <p>
              {loading
                ? ""
                : search || Object.values(filters).some(Boolean)
                  ? t("Try another search or clear the filters.")
                  : t(
                      "Add a book or import a list to start building your library.",
                    )}
            </p>
          </div>
        )}
      </div>
      <div className="pagination">
        <span>
          {loading
            ? t("Updating…")
            : data.total
              ? t("{start}–{end} of {total}", {
                  start: number(offset + 1),
                  end: number(Math.min(offset + 50, data.total)),
                  total: number(data.total),
                })
              : t("0 books")}
        </span>
        {pageButtons}
      </div>
    </section>
  );
}

function BookEditor({ book, series, lists, onClose, onSaved, edit }: any) {
  const readOnly = useReadOnly();
  const [entryMode, setEntryMode] = useState(
    book.entity_type === "series" ? "series" : "book",
  );
  const [form, setForm] = useState<any>({}),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setForm(book);
    setError("");
  }, [book]);
  useEffect(() => {
    dialog.current?.showModal();
  }, [entryMode]);
  function change(k: string, v: any) {
    setForm((f: any) => ({
      ...f,
      [k]: v,
      ...(k === "czech_title" && v.trim() ? { translated_cs: true } : {}),
      ...(k === "slovak_title" && v.trim() ? { translated_sk: true } : {}),
    }));
  }
  async function submit(e: React.FormEvent) {
    if (readOnly) { e.preventDefault(); return; }
    e.preventDefault();
    setSaving(true);
    setError("");
    const body: any = {};
    for (const k of [
      ...Object.keys(textFields),
      ...Object.keys(boolFields),
      "rating",
      "series_id",
      "notes",
      "borrower",
      "loan_date",
    ]) {
      const v = form[k];
      body[k] =
        k in boolFields
          ? !!v
          : numeric.includes(k) || k === "rating" || k === "series_id"
            ? v === "" || v === undefined || v === null
              ? null
              : Number(v)
            : v || null;
    }
    try {
      await api(
        "/books" + (book.id ? "/" + book.id : ""),
        book.id ? "PATCH" : "POST",
        body,
      );
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm(t("Delete this book and its curated-list memberships?")))
      return;
    setSaving(true);
    try {
      await api("/books/" + book.id, "DELETE");
      onSaved();
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  }
  if (entryMode === "series")
    return (
      <SeriesEntryEditor
        {...{ book, series, lists, onClose, onSaved }}
        onBook={() => setEntryMode("book")}
      />
    );
  return (
    <dialog ref={dialog} onCancel={onClose}>
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <div className="eyebrow">{t("BOOK DETAILS")}</div>
            <h2>{book.id ? t("Edit book") : t("Add a book")}</h2>
          </div>
          <button
            type="button"
            aria-label={t("Close book editor")}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <fieldset disabled={readOnly} style={{border: 0, padding: 0, margin: 0}}>
        <label>
          {" "}
          {t("Entry type")}{" "}
          <select
            value={entryMode}
            onChange={(e) => setEntryMode(e.target.value)}
          >
            <option value="book">{t("A book")}</option>
            <option value="series">{t("A book series")}</option>
          </select>
        </label>
        <div className="form-grid">
          {Object.entries(textFields).map(([k, label]) => (
            <label key={k}>
              {t(label)}
              {["author", "english_title"].includes(k) && " *"}
              <input
                required={["author", "english_title"].includes(k)}
                type={numeric.includes(k) ? "number" : "text"}
                step={
                  k === "series_position" || k === "expected_price"
                    ? "any"
                    : "1"
                }
                min={
                  k === "page_count"
                    ? 1
                    : k === "expected_price"
                      ? 0
                      : undefined
                }
                value={form[k] ?? ""}
                onChange={(e) => change(k, e.target.value)}
              />
            </label>
          ))}
          <label>
            {" "}
            {t("Series")}{" "}
            <select
              value={form.series_id ?? ""}
              onChange={(e) => {
                change("series_id", e.target.value);
                if (!book.id && !form.author)
                  change(
                    "author",
                    series.find((s: any) => s.id === Number(e.target.value))
                      ?.original_author || "",
                  );
              }}
            >
              <option value="">{t("No series")}</option>
              {series.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label>{t("Rating")}</label>
            <div className="rating" role="group" aria-label={t("Book rating")}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  aria-label={t("{count} stars", { count: n })}
                  aria-pressed={form.rating === n}
                  type="button"
                  className={
                    form.rating !== null && form.rating >= n ? "selected" : ""
                  }
                  onClick={() => change("rating", n)}
                >
                  {n === 0 ? "0" : "★"}
                </button>
              ))}
              <button type="button" onClick={() => change("rating", null)}>
                {" "}
                {t("Clear")}{" "}
              </button>
            </div>
          </div>
        </div>
        <p>
          {t(
            "A Czech or Slovak title automatically marks that translation as available. Clearing the title keeps the flag; you can then uncheck it if needed.",
          )}
        </p>
        <LoanFields
          borrower={form.borrower || ""}
          loanDate={form.loan_date || ""}
          disabled={readOnly || saving}
          onChange={(borrower, loan_date) =>
            setForm((previous: any) => ({ ...previous, borrower, loan_date }))
          }
        />
        <div className="checkbox-grid">
          {Object.entries(boolFields).map(([k, label]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={
                  k === "translated_cs_sk"
                    ? !!(
                        form.translated_cs_sk ||
                        form.translated_cs ||
                        form.translated_sk
                      )
                    : !!form[k]
                }
                disabled={
                  k === "translated_cs"
                    ? !!form.czech_title?.trim()
                    : k === "translated_sk"
                      ? !!form.slovak_title?.trim()
                      : k === "translated_cs_sk"
                        ? !!(form.translated_cs || form.translated_sk)
                        : false
                }
                onChange={(e) => change(k, e.target.checked)}
              />
              {t(label)}
            </label>
          ))}
        </div>
        <label>
          {" "}
          {t("Notes")}{" "}
          <textarea
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => change("notes", e.target.value)}
          />
        </label>
        {book.lists?.length > 0 && (
          <div className="related">
            <h3>{t("Appears in")}</h3>
            {book.lists.map((l: any) => (
              <div key={l.id}>
                {l.name}
                <span>{l.rank ? `#${l.rank}` : t("Unranked")}</span>
              </div>
            ))}
          </div>
        )}
        {book.series_books?.length > 0 && (
          <div className="related">
            <h3>{t("In this series")}</h3>
            {book.series_books.map((b: Book) => (
              <div key={b.id}>
                <button
                  type="button"
                  className="title-link"
                  onClick={() => {
                    if (
                      JSON.stringify(form) !== JSON.stringify(book) &&
                      !confirm(t("Discard unsaved changes?"))
                    )
                      return;
                    edit(b.id);
                  }}
                >
                  {b.english_title}
                </button>
                <span>{b.series_position ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
        {book.id && (
          <ReadingHistory
            sessions={book.reading_history || []}
            pages={form.page_count ? Number(form.page_count) : null}
          />
        )}
        </fieldset>
        <div className="dialog-actions">
          {book.id && (
            <button
              type="button"
              className="danger"
              disabled={readOnly || saving}
              onClick={remove}
            >
              {" "}
              {t("Delete book")}{" "}
            </button>
          )}
          <div className="spacer" />
          <button type="button" onClick={onClose}>
            {" "}
            {t("Cancel")}{" "}
          </button>
          <button className="primary" disabled={readOnly || saving}>
            {saving ? t("Saving…") : t("Save book")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Metrics({ stats }: any) {
  return (
    <div className="metrics">
      {[
        ["total", "Books"],
        ["owned", "Owned"],
        ["read", "Read"],
        ["translated", "CZ / SK translated"],
        ["untranslated", "No known CZ / SK"],
        ["watchlist", "Watchlist"],
        ["wishlist", "Wishlist"],
      ].map(([k, label]) => (
        <div className="metric" key={k}>
          <span>{t(label)}</span>
          <strong>
            {stats[k] ?? 0}
            {(k === "owned" || k === "read") && (
              <small style={{ fontSize: 13, marginLeft: 8 }}>
                {stats[k + "_percentage"]}%
              </small>
            )}
          </strong>
        </div>
      ))}
    </div>
  );
}

function FeaturePage(props: any) {
  const readOnly = useReadOnly();
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const { kind, scope, setScope, lists, series, revision, refresh, setError } =
    props;
  const [detail, setDetail] = useState<any>(null),
    [originalAuthor, setOriginalAuthor] = useState(""),
    [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (scope)
      api("/" + kind + "/" + scope.id)
        .then(setDetail)
        .catch((e) => setError(errorText(e)));
    else setDetail(null);
  }, [scope, kind, revision]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
        if (readOnly) return;
    setBusy(true);
    try {
      const d = await api("/" + kind, "POST", {
        name,
        ...(kind === "series"
          ? { original_author: originalAuthor || null }
          : {}),
      });
      setName("");
      setOriginalAuthor("");
      refresh();
      setScope(d);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function loadPreview() {
    setBusy(true);
    setMessage("");
    setError("");
    setConflicts([]);
    setChoices({});
    setPreview("");
    try {
      const d = await api("/lists/preview", "POST", { url });
      setPreview(JSON.stringify(d, null, 2));
      setMessage(
        t("Parsed {count} entries. Review before importing.", {
          count: d.entries.length,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (readOnly) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = resolveImport(preview, conflicts, choices);
      setPreview(JSON.stringify(payload, null, 2));
      const d = await api("/lists/import", "POST", payload);
      setMessage(
        t(
          "Imported {entries} entries: {created} new books, {reused} existing books, {series} series.",
          {
            entries: d.entries,
            created: d.created_books,
            reused: d.reused_books,
            series: d.series_entries || 0,
          },
        ),
      );
      setPreview("");
      setConflicts([]);
      setChoices({});
      refresh();
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        Array.isArray(e.detail?.conflicts)
      ) {
        setConflicts(e.detail.conflicts);
        setChoices({});
      } else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (readOnly) return;
    if (
      !confirm(
        t(
          kind === "lists"
            ? "Delete this list and its memberships? Books will be kept."
            : "Delete this series? Books will be kept.",
        ),
      )
    )
      return;
    try {
      await api("/" + kind + "/" + scope.id, "DELETE");
      setScope(null);
      refresh();
    } catch (e) {
      setError(errorText(e));
    }
  }
  if (scope)
    return (
      <>
        <button onClick={() => setScope(null)}>
          {t(kind === "lists" ? "← All lists" : "← All series")}
        </button>
        {detail && (
          <>
            <p>{detail.description || detail.notes}</p>
            {kind === "series" && (detail.czech_name || detail.slovak_name) && (
              <p>
                {detail.czech_name && (
                  <>
                    {" "}
                    {t("Czech name:")} {detail.czech_name}
                    <br />
                  </>
                )}
                {detail.slovak_name && (
                  <>
                    {t("Slovak name:")} {detail.slovak_name}
                  </>
                )}
              </p>
            )}
            {kind === "series" && (
              <p>
                <strong>{t("Original author:")}</strong>{" "}
                {detail.original_author || t("Not entered")}
              </p>
            )}
            {detail.source_url && (
              <a href={detail.source_url} target="_blank" rel="noreferrer">
                {detail.source_name || t("View source")} ↗
              </a>
            )}
            <Metrics stats={detail.stats} />
            {kind === "lists" && detail.stats.series_entries > 0 && (
              <p>
                {detail.stats.entries} {t("ranked entries, including")}{" "}
                {detail.stats.series_entries}{" "}
                {t("series. Progress above counts the")} {detail.stats.total}{" "}
                {t("distinct books represented by this list.")}{" "}
              </p>
            )}
            {kind === "series" && (
              <p>
                {" "}
                {t("Czech:")} {detail.stats.translated_cs} {t("· Slovak:")}{" "}
                {detail.stats.translated_sk}
              </p>
            )}
            <details className="panel">
              <summary>
                {t(
                  kind === "lists"
                    ? "Edit list details"
                    : "Edit series details",
                )}
              </summary>
              <MetadataForm
                key={detail.id + revision}
                kind={kind}
                item={detail}
                onSaved={(d: any) => {
                  setScope(d);
                  refresh();
                }}
                setError={setError}
              />
            </details>
            {!readOnly && (
              <details className="panel">
                <summary>{t("Assign an existing book")}</summary>
                <AssignBook {...props} />
              </details>
            )}
            <div className="actions">
              <button className="danger" disabled={readOnly} onClick={remove}>
                {t(kind === "lists" ? "Delete list" : "Delete series")}
              </button>
            </div>
          </>
        )}
        <Collection key={kind + scope.id} {...props} />
      </>
    );
  const items = kind === "lists" ? lists : series;
  return (
    <>
      <div className="cards">
        {items.map((item: any) => (
          <div className="card" key={item.id}>
            <h2>
              <button
                className="title-link"
                onClick={() =>
                  kind === "series"
                    ? props.edit(item.id, {
                        entity_type: "series",
                        series_id: item.id,
                      })
                    : setScope(item)
                }
              >
                {item.name}
              </button>
            </h2>
            {kind === "series" && (
              <p className="series-author">
                {" "}
                {t("Original author:")}{" "}
                {item.original_author || t("Not entered")}
              </p>
            )}
            <small>
              {item.stats.total} {t("books")}{" "}
              {item.source_name ? " · " + item.source_name : ""}
            </small>
            {["owned", "read"].map((k) => (
              <div key={k}>
                <div className="progress-line">
                  <span>{k === "owned" ? t("Owned") : t("Read")}</span>
                  <span>
                    {item.stats[k]} / {item.stats.total} ·{" "}
                    {item.stats[k + "_percentage"]}%
                  </span>
                </div>
                <progress max={item.stats.total || 1} value={item.stats[k]} />
              </div>
            ))}
            <button
              className="view-series-books"
              onClick={() => setScope(item)}
            >
              {" "}
              {t("View books →")}{" "}
            </button>
          </div>
        ))}
      </div>
      {!items.length && (
        <div className="empty">
          <h2>
            {kind === "lists"
              ? t("A reading list worth exploring")
              : t("Every story has a place")}
          </h2>
          <p>
            {kind === "lists"
              ? t("Import a curated list below, or create your own.")
              : t("Create a series, then assign books from their edit forms.")}
          </p>
        </div>
      )}
      <div className="panel">
        <h2>
          {t("Create")} {kind === "lists" ? t("a list") : t("a series")}
        </h2>
        <form className="inline-form" onSubmit={create}>
          <label>
            {" "}
            {t("Name")}{" "}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {kind === "series" && (
            <label>
              {" "}
              {t("Original author")}{" "}
              <input
                value={originalAuthor}
                onChange={(e) => setOriginalAuthor(e.target.value)}
              />
            </label>
          )}
          <button disabled={readOnly || busy} className="primary">
            {" "}
            {t("Create")}{" "}
          </button>
        </form>
      </div>
      {kind === "lists" && (
        <div className="panel">
          <h2>{t("Import from Digital Dream Door")}</h2>
          <p>
            {" "}
            {t(
              "Fetch once, review, then keep the list offline. Refreshes replace list memberships and ranks while preserving all personal book details.",
            )}{" "}
          </p>
          <div className="inline-form">
            <label>
              {" "}
              {t("Source URL")}{" "}
              <input
                type="url"
                placeholder="https://www.digitaldreamdoor.com/pages/books/greatest-novels.html"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <button disabled={readOnly || busy || !url} onClick={loadPreview}>
              {busy ? t("Working…") : t("Preview source")}
            </button>
          </div>
          <label>
            {" "}
            {t("Reviewed import JSON")}{" "}
            <textarea
              className="transfer-text"
              placeholder={t(
                "Preview appears here. You can also paste a saved preview.",
              )}
              value={preview}
              disabled={readOnly || busy}
              onChange={(e) => {
                setPreview(e.target.value);
                setConflicts([]);
                setChoices({});
                setMessage("");
              }}
            />
          </label>
          <p>
            {" "}
            {t(
              "Exact matches reuse the same book automatically. If possible matches need review, choices will appear below before anything is imported.",
            )}{" "}
          </p>
          {conflicts.length > 0 && (
            <ImportReview
              conflicts={conflicts}
              choices={choices}
              disabled={readOnly || busy}
              onChoose={(index, value) =>
                setChoices((current) => ({ ...current, [index]: value }))
              }
            />
          )}
          <button
            disabled={
              readOnly || busy ||
              !preview ||
              conflicts.some((conflict) => !choices[conflict.index])
            }
            className="primary"
            onClick={apply}
          >
            {conflicts.length
              ? t("Import with these choices")
              : t("Import reviewed list")}
          </button>
          {message && <p role="status">{message}</p>}
        </div>
      )}
    </>
  );
}
function MetadataForm({ kind, item, onSaved, setError }: any) {
  const readOnly = useReadOnly();
  const [form, setForm] = useState(item),
    [busy, setBusy] = useState(false);
  const fields =
    kind === "lists"
      ? ["name", "description", "source_name", "source_url"]
      : ["name", "original_author", "czech_name", "slovak_name", "notes"];
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (readOnly) return;
        setBusy(true);
        try {
          onSaved(
            await api(
              "/" + kind + "/" + item.id,
              "PATCH",
              Object.fromEntries(fields.map((k) => [k, form[k] || null])),
            ),
          );
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {fields.map((k) => (
          <label key={k}>
            {t(
              (
                {
                  name: "Name",
                  original_author: "Original author",
                  czech_name: "Czech name",
                  slovak_name: "Slovak name",
                  notes: "Notes",
                  description: "Description",
                  source_url: "Source URL",
                  source_name: "Source name",
                } as Record<string, string>
              )[k] || k,
            )}
            <input
              readOnly={readOnly}
              required={k === "name"}
              value={form[k] ?? ""}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <button disabled={readOnly || busy}>{t("Save details")}</button>
    </form>
  );
}
function AssignBook({ kind, scope, refresh, setError }: any) {
  const readOnly = useReadOnly();
  const [q, setQ] = useState(""),
    [items, setItems] = useState<Book[]>([]),
    [bookId, setBookId] = useState(""),
    [position, setPosition] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        api("/books?limit=50&q=" + encodeURIComponent(q))
          .then((d) => {
            if (active) setItems(d.items);
          })
          .catch((e) => setError(errorText(e))),
      220,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q]);
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (readOnly) return;
        setBusy(true);
        setMessage("");
        try {
          if (kind === "lists")
            await api("/lists/" + scope.id + "/entries", "POST", {
              book_id: Number(bookId),
              rank: position ? Number(position) : null,
            });
          else
            await api("/books/" + bookId, "PATCH", {
              series_id: scope.id,
              series_position: position ? Number(position) : null,
            });
          setMessage(t("Book assigned."));
          refresh();
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {" "}
        {t("Search existing books")}{" "}
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setBookId("");
          }}
        />
      </label>
      <label>
        {" "}
        {t("Book")}{" "}
        <select
          required
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
        >
          <option value="">{t("Choose a book")}</option>
          {items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.author} — {b.english_title}
            </option>
          ))}
        </select>
      </label>
      <label>
        {kind === "lists" ? t("Rank") : t("Series position")}
        <input
          type="number"
          step={kind === "lists" ? "1" : "any"}
          min={kind === "lists" ? 1 : undefined}
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
      </label>
      <button disabled={readOnly || busy || !bookId}>{t("Assign")}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
function Statistics({ revision, setError }: any) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    let active = true;
    api("/statistics")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => setError(errorText(e)));
    return () => {
      active = false;
    };
  }, [revision]);
  if (!data) return <p>{t("Loading statistics…")}</p>;
  return (
    <>
      <Metrics stats={data} />
      <div className="cards">
        <div className="panel">
          <h2>{t("On your shelves")}</h2>
          <div className="related">
            <div>
              {" "}
              {t("Unread owned books")}
              <span>{data.unread_owned}</span>
            </div>
            <div>
              {" "}
              {t("Average rating")}{" "}
              <span>
                {data.average_rating === null
                  ? t("No ratings yet")
                  : number(data.average_rating, 2) + " / 5"}
              </span>
            </div>
          </div>
        </div>
        <div className="panel">
          <h2>{t("In your language")}</h2>
          <div className="related">
            <div>
              {" "}
              {t("Czech translation known")}
              <span>{data.translated_cs}</span>
            </div>
            <div>
              {" "}
              {t("Slovak translation known")}
              <span>{data.translated_sk}</span>
            </div>
            <div>
              {" "}
              {t("Either Czech or Slovak")}
              <span>{data.translated}</span>
            </div>
            <div>
              {" "}
              {t("No known Czech / Slovak translation")}{" "}
              <span>{data.untranslated}</span>
            </div>
          </div>
        </div>
        <div className="panel">
          <h2>{t("Knihobot plans")}</h2>
          <div className="related">
            <div>
              {" "}
              {t("Watchlist expected total")}{" "}
              <span>{number(data.watchlist_price, 2)}</span>
            </div>
            <div>
              {" "}
              {t("Wishlist expected total")}{" "}
              <span>{number(data.wishlist_price, 2)}</span>
            </div>
            <div>
              {" "}
              {t("Combined expected total")}{" "}
              <span>{number(data.expected_price_total, 2)}</span>
            </div>
          </div>
          <p>
            {" "}
            {t(
              "Combined total counts each book once. Unknown prices contribute nothing; amounts use your entered currency.",
            )}{" "}
          </p>
        </div>
      </div>
      <h2>{t("Progress through the lists")}</h2>
      <div className="cards">
        {data.lists.map((l: any) => (
          <div className="card" key={l.id}>
            <h2>{l.name}</h2>
            {["owned", "read"].map((k) => (
              <div key={k}>
                <div className="progress-line">
                  <span>{k === "owned" ? t("Owned") : t("Read")}</span>
                  <span>
                    {l.stats[k]} / {l.stats.total} ·{" "}
                    {l.stats[k + "_percentage"]}%
                  </span>
                </div>
                <progress
                  aria-label={t("{status} in {list}", {
                    status: t(k === "owned" ? "Owned" : "Read"),
                    list: l.name,
                  })}
                  value={l.stats[k]}
                  max={l.stats.total || 1}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      {!data.lists.length && (
        <p>
          {t("No curated lists yet. Import a list to track your progress.")}
        </p>
      )}
    </>
  );
}
function Transfers({ refresh, setError }: any) {
  const readOnly = useReadOnly();
  const [text, setText] = useState(""),
    [mode, setMode] = useState("keep_existing"),
    [report, setReport] = useState<any>(null),
    [busy, setBusy] = useState(false);
  async function run(preview: boolean) {
    if (readOnly) return;
    setBusy(true);
    setReport(null);
    try {
      const response = await fetch(
        "/api/backup/import?mode=" + mode + "&preview=" + preview,
        {
          method: "POST",
          headers: { ...profileHeaders(), "Content-Type": "application/yaml" },
          body: text,
        },
      );
      const result = await response.json();
      if (!response.ok) throw new ApiError(response.status, result.detail);
      setReport(result);
      if (!preview) refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="panel">
        <h2>{t("Export your library")}</h2>
        <p>
          {" "}
          {t(
            "Download a complete UTF-8 YAML backup, including books, translations, personal details, series, lists and memberships.",
          )}{" "}
        </p>
        <a
          className="download"
          href={profileUrl("/api/backup/export")}
          download="bookdb-backup.yaml"
        >
          {" "}
          {t("↓ Download YAML backup")}{" "}
        </a>
      </div>
      <div className="panel">
        <h2>{t("Import a backup")}</h2>
        <p>
          {" "}
          {t(
            "Validate and preview before importing. Imports are atomic: malformed records leave the database unchanged. Records are matched by identity; backup IDs are remapped.",
          )}{" "}
        </p>
        <label>
          {" "}
          {t("YAML file")}{" "}
          <input
            type="file"
            accept=".yaml,.yml"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 10000000) {
                  setError(t("Backup exceeds the 10 MB limit."));
                  return;
                }
                setText(await f.text());
                setReport(null);
              }
            }}
          />
        </label>
        <label>
          {" "}
          {t("Backup content")}{" "}
          <textarea
            className="transfer-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setReport(null);
            }}
          />
        </label>
        <label>
          {" "}
          {t("Existing records")}{" "}
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setReport(null);
            }}
          >
            <option value="keep_existing">
              {" "}
              {t("Keep existing details (recommended)")}{" "}
            </option>
            <option value="update_existing">
              {" "}
              {t("Overwrite matching records with backup values")}{" "}
            </option>
          </select>
        </label>
        {mode === "update_existing" && (
          <p>
            {" "}
            {t(
              "This will replace personal metadata on matching books. Export a current backup first.",
            )}{" "}
          </p>
        )}
        <div className="actions">
          <button disabled={readOnly || !text || busy} onClick={() => run(true)}>
            {" "}
            {t("Validate & preview")}{" "}
          </button>
          <button
            disabled={readOnly || !text || busy || !report?.preview}
            className="primary"
            onClick={() => run(false)}
          >
            {busy ? t("Working…") : t("Import backup")}
          </button>
        </div>
        {report && (
          <div role="status">
            <strong>
              {report.preview
                ? t("Preview — no data saved")
                : t("Import complete")}
            </strong>
            <p>
              {Object.entries(report.created)
                .map(([k, v]) =>
                  t(
                    "{label}: {created} new, {matched} matched, {updated} updated",
                    {
                      label: t(
                        (
                          {
                            books: "Books",
                            series: "Series",
                            curated_lists: "Greatest Books",
                            memberships: "Memberships",
                            series_memberships: "Memberships",
                            returned_loans: "Returned books",
                            reading_sessions: "Reading history",
                          } as Record<string, string>
                        )[k] || k,
                      ),
                      created: String(v),
                      matched: report.matched[k],
                      updated: report.updated[k],
                    },
                  ),
                )
                .join(" · ")}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
function LanguageSelector() {
  const language = useLanguage();
  return (
    <label className="language-selector">
      {t("Language")}
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
      >
        <option value="en">English</option>
        <option value="cs">Čeština</option>
        <option value="sk">Slovenčina</option>
      </select>
    </label>
  );
}
function Settings() {
  const [settings, setSettings] = useState<any>();
  useEffect(() => {
    api("/settings").then(setSettings);
  }, []);
  return (
    <div className="panel">
      <LanguageSelector />
      <h2>{t("Local storage")}</h2>
      <p>
        {t("All library data is stored in a SQLite database on this computer.")}
      </p>
      <code>{settings?.database_path}</code>
      <p>
        {t("Schema version:")} {settings?.schema_version}
      </p>
      <p>
        {" "}
        {t(
          "Expected prices use the currency you choose when entering them. Use one currency consistently; BookDB does not convert currencies.",
        )}{" "}
      </p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
