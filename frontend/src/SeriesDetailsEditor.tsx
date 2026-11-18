import { useReadOnly } from "./library-access";
import { t, errorText } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export function SeriesDetailsEditor({
  series,
  onClose,
  onSaved,
  onMembership,
}: any) {
  const readOnly = useReadOnly();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState(series),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setError("");
    try {
      onSaved(
        await api(
          "/series/" + series.id,
          "PATCH",
          Object.fromEntries(
            [
              "name",
              "original_author",
              "czech_name",
              "slovak_name",
              "notes",
            ].map((k) => [k, form[k] || null]),
          ),
        ),
      );
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
          <h2>{t("Edit series")}</h2>
          <button
            type="button"
            aria-label={t("Close series details")}
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
        <div className="form-grid">
          {Object.entries({
            name: "Series name",
            original_author: "Original author",
            czech_name: "Czech name",
            slovak_name: "Slovak name",
          }).map(([key, label]) => (
            <label key={key}>
              {t(label)}
              <input
                required={key === "name"}
                maxLength={500}
                value={form[key] ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <label>
          {" "}
          {t("Notes")}{" "}
          <textarea
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <p>
          {" "}
          {t(
            "These details are shared wherever this series appears. Original author prefills new books; existing book authors stay unchanged.",
          )}{" "}
        </p>
        </fieldset>
        <div className="dialog-actions">
          {onMembership && (
            <button
              type="button"
              disabled={readOnly || busy}
              onClick={() => {
                if (
                  JSON.stringify(form) !== JSON.stringify(series) &&
                  !confirm(t("Discard unsaved series changes?"))
                )
                  return;
                onMembership();
              }}
            >
              {" "}
              {t("Edit list entry")}{" "}
            </button>
          )}
          <div className="spacer" />
          <button type="button" onClick={onClose}>
            {" "}
            {t("Cancel")}{" "}
          </button>
          <button className="primary" disabled={readOnly || busy}>
            {busy ? t("Saving…") : t("Save series")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
