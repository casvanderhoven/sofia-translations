import {
  CASES,
  DEGREES,
  describeMorph,
  formatTags,
  GENDERS,
  GROUP_LABELS,
  type GroupLabel,
  hasMorph,
  MOODS,
  type Morphology,
  NUMBERS,
  PERSONS,
  POS,
  TENSES,
  VOICES,
} from "@sofia/core";
import { useQuery } from "@tanstack/react-query";
import { type RefObject, useMemo } from "react";
import { api } from "../api";
import { useEditor } from "./store";

const FIELDS: Array<[keyof Morphology, readonly string[]]> = [
  ["pos", POS],
  ["case", CASES],
  ["number", NUMBERS],
  ["gender", GENDERS],
  ["tense", TENSES],
  ["mood", MOODS],
  ["voice", VOICES],
  ["person", PERSONS],
  ["degree", DEGREES],
];

export function Inspector({ noteRef }: { noteRef: RefObject<HTMLTextAreaElement | null> }) {
  const doc = useEditor((s) => s.doc);
  const origSel = useEditor((s) => s.origSel);
  const trlSel = useEditor((s) => s.trlSel);
  const activeGroup = useEditor((s) => s.activeGroup);
  const s = useEditor();
  const group = useMemo(() => doc?.groups.find((g) => g.id === activeGroup), [doc, activeGroup]);
  const token = useMemo(
    () => (origSel.length === 1 ? doc?.tokens.find((t) => t.id === origSel[0]) : undefined),
    [doc, origSel],
  );
  const forms = useMemo(() => {
    if (!doc) return { o: new Map<string, string>(), t: new Map<string, string>() };
    return {
      o: new Map(doc.tokens.map((t) => [t.id, t.form])),
      t: new Map(doc.translationTokens.map((t) => [t.id, t.form])),
    };
  }, [doc]);
  const candidates = useQuery({
    queryKey: ["morph", doc?.meta.lang, token?.form],
    queryFn: () => api.morph(doc!.meta.lang, token!.form),
    enabled: !!doc && !!token,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!doc) return null;

  return (
    <aside className="pane inspector">
      {(origSel.length > 0 || trlSel.length > 0) && !group && (
        <div className="card">
          <h3>Selection</h3>
          <p className="muted small">
            {origSel.length} original · {trlSel.length} translation. Press <kbd>Enter</kbd> to link
            them into a group.
          </p>
        </div>
      )}

      {group && (
        <div className="card">
          <h3>Group {group.id}</h3>
          <div className="members">
            <div lang={doc.meta.lang === "lat" ? "la" : "grc"}>
              {group.original.map((id) => forms.o.get(id) ?? id).join(" ") || (
                <em className="muted">no original words</em>
              )}
            </div>
            <div className="arrow">↔</div>
            <div>
              {group.translation.map((id) => forms.t.get(id) ?? id).join(" ") || (
                <em className="muted">no translation words</em>
              )}
            </div>
          </div>
          <div className="labels" role="radiogroup" aria-label="Label">
            {GROUP_LABELS.map((l, i) => (
              <button
                key={l}
                type="button"
                className={`lbl-btn lbl-${l} ${group.label === l ? "on" : ""}`}
                onClick={() => s.setLabel(l as GroupLabel)}
                title={`${i + 1}`}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Note (N)</span>
            <textarea
              ref={noteRef}
              rows={2}
              value={group.note ?? ""}
              onChange={(e) => s.setNote(e.target.value)}
              placeholder="Why this rendering…"
            />
          </label>
          <button type="button" className="ghost danger" onClick={() => s.ungroup()}>
            Ungroup (⌫)
          </button>
        </div>
      )}

      {token && (
        <div className="card">
          <h3>
            <span lang={doc.meta.lang === "lat" ? "la" : "grc"}>{token.form}</span>{" "}
            <span className="muted small">{token.id}</span>
          </h3>
          <label className="field">
            <span>Lemma</span>
            <input
              lang={doc.meta.lang === "lat" ? "la" : "grc"}
              value={token.lemma ?? ""}
              onChange={(e) => s.setMorph(token.id, token.morph, e.target.value)}
            />
          </label>
          <div className="morph-grid">
            {FIELDS.map(([key, options]) => (
              <label key={key} className="field small">
                <span>{key}</span>
                <select
                  value={token.morph[key] ?? ""}
                  onChange={(e) => {
                    const m = { ...token.morph } as Record<string, string | undefined>;
                    if (e.target.value === "") delete m[key];
                    else m[key] = e.target.value;
                    s.setMorph(token.id, m as Morphology);
                  }}
                >
                  <option value="">—</option>
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="muted small">{describeMorph(token.morph) || "No analysis yet."}</p>
          <label className="check">
            <input
              type="checkbox"
              checked={token.verified}
              onChange={(e) => s.setVerified([token.id], e.target.checked)}
            />{" "}
            Verified (V)
          </label>
          <h4>Morpheus</h4>
          {candidates.isLoading && <p className="muted small">Looking up…</p>}
          {candidates.isError && (
            <p className="error small">{(candidates.error as Error).message}</p>
          )}
          {candidates.data?.length === 0 && <p className="muted small">No analyses found.</p>}
          <ul className="candidates">
            {candidates.data?.map((c) => (
              <li key={`${c.lemma}-${formatTags(c.morph).join(".")}-${c.note ?? ""}`}>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    s.setMorph(token.id, c.morph, c.lemma);
                    s.setVerified([token.id], true);
                  }}
                >
                  <b lang={doc.meta.lang === "lat" ? "la" : "grc"}>{c.lemma}</b>{" "}
                  {formatTags(c.morph).join(" ")}
                  {c.note && <span className="muted"> · {c.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(s.morphSuggestions.length > 0 || s.alignSuggestions.length > 0) && (
        <div className="card suggestions">
          <h3>
            Suggestions{" "}
            <span className="muted small">
              {s.morphSuggestions.length + s.alignSuggestions.length}
            </span>
          </h3>
          <p className="muted small">
            <kbd>A</kbd> accept first · <kbd>X</kbd> reject first · <kbd>⇧A</kbd> accept all
          </p>
          <button type="button" onClick={() => s.acceptAllSuggestions()}>
            Accept all
          </button>
          <ul className="queue">
            {s.morphSuggestions.map((m) => (
              <li key={m.id}>
                <div>
                  <b lang={doc.meta.lang === "lat" ? "la" : "grc"}>{forms.o.get(m.id)}</b> →{" "}
                  {m.lemma ?? "—"} {formatTags(m.morph).join(" ")}
                  <span className="muted small"> {(m.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="row">
                  <button type="button" onClick={() => s.acceptMorphSuggestion(m.id)}>
                    Accept
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => s.rejectMorphSuggestion(m.id)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
            {s.alignSuggestions.map((a, i) => (
              <li key={`${a.original.join(",")}|${a.translation.join(",")}`}>
                <div>
                  <span className={`pill lbl-${a.label}`}>{a.label}</span>{" "}
                  <span lang={doc.meta.lang === "lat" ? "la" : "grc"}>
                    {a.original.map((id) => forms.o.get(id)).join(" ")}
                  </span>{" "}
                  ↔ {a.translation.map((id) => forms.t.get(id)).join(" ")}
                  <span className="muted small"> {(a.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="row">
                  <button type="button" onClick={() => s.acceptAlignSuggestion(i)}>
                    Accept
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => s.rejectAlignSuggestion(i)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>Section</h3>
        <label className="field">
          <span>Title</span>
          <input value={doc.meta.title} onChange={(e) => s.setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Status</span>
          <select
            value={doc.meta.status}
            onChange={(e) => s.setStatus(e.target.value as typeof doc.meta.status)}
          >
            <option value="draft">draft</option>
            <option value="aligned">aligned</option>
            <option value="published">published</option>
          </select>
        </label>
        <label className="field">
          <span>Section notes (markdown)</span>
          <textarea rows={3} value={doc.notes ?? ""} onChange={(e) => s.setNotes(e.target.value)} />
        </label>
        {doc.meta.urn && <p className="muted small mono">{doc.meta.urn}</p>}
      </div>

      <div className="card help">
        <h3>Keys</h3>
        <dl>
          <dt>click / ⌘click / ⇧click</dt>
          <dd>select / add / range</dd>
          <dt>Enter</dt>
          <dd>link selections into a group</dd>
          <dt>1–9</dt>
          <dd>label: nom gen dat acc abl voc adv verb other</dd>
          <dt>⌫</dt>
          <dd>ungroup</dd>
          <dt>] [</dt>
          <dd>next / previous unlinked word</dd>
          <dt>V</dt>
          <dd>toggle verified</dd>
          <dt>E</dt>
          <dd>write translation</dd>
          <dt>⌘S · P</dt>
          <dd>save · preview</dd>
          <dt>⌘Z · ⇧⌘Z</dt>
          <dd>undo · redo</dd>
        </dl>
      </div>
    </aside>
  );
}
