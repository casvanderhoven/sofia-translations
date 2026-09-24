import { describeMorph, hasMorph } from "@sofia/core";
import { useMemo, useState } from "react";
import { groupMaps } from "./derive";
import { textForSide, useEditor } from "./store";
import { TokenChip } from "./TokenChip";

export function OriginalPane() {
  const doc = useEditor((s) => s.doc);
  const origSel = useEditor((s) => s.origSel);
  const writeMode = useEditor((s) => s.writeMode.orig);
  const setWriteMode = useEditor((s) => s.setWriteMode);
  const applyText = useEditor((s) => s.applyText);
  const [text, setText] = useState("");
  const maps = useMemo(() => (doc ? groupMaps(doc) : null), [doc]);
  if (!doc || !maps) return null;
  const selected = new Set(origSel);
  const byUnit = new Map<string, typeof doc.tokens>();
  for (const t of doc.tokens) byUnit.set(t.unit, [...(byUnit.get(t.unit) ?? []), t]);

  if (writeMode) {
    return (
      <section className="pane">
        <header className="pane-head">
          <h2>Original</h2>
          <div className="pane-actions">
            <button type="button" onClick={() => applyText("orig", text)}>
              Apply
            </button>
            <button type="button" className="ghost" onClick={() => setWriteMode("orig", false)}>
              Cancel
            </button>
          </div>
        </header>
        <p className="hint">
          One numbered unit per line (<code>5 text…</code>). A line <code>@ Name</code> marks a
          speaker change. Analyses follow their words when the text changes.
        </p>
        <textarea
          className="text-editor original-text"
          lang={doc.meta.lang === "lat" ? "la" : "grc"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </section>
    );
  }

  return (
    <section className="pane">
      <header className="pane-head">
        <h2>
          Original <span className="muted">{doc.meta.lang === "grc" ? "Greek" : "Latin"}</span>
        </h2>
        <div className="pane-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setText(textForSide(doc, "orig"));
              setWriteMode("orig", true);
            }}
          >
            Edit text
          </button>
        </div>
      </header>
      <div className="units" lang={doc.meta.lang === "lat" ? "la" : "grc"}>
        {doc.original.map((u) => (
          <div key={u.n}>
            {u.speaker !== undefined && <div className="speaker">{u.speaker}</div>}
            <div className="unit">
              <span className="ln">{u.n}</span>
              <span className="unit-text">
                {(byUnit.get(u.n) ?? []).map((t, i, arr) => {
                  const prev = arr[i - 1];
                  const gap = u.text.slice(prev ? prev.end : 0, t.start);
                  const tail = i === arr.length - 1 ? u.text.slice(t.end) : "";
                  const analysed = t.lemma !== undefined || hasMorph(t.morph);
                  const gloss = [t.lemma, describeMorph(t.morph)].filter(Boolean).join(" · ");
                  return (
                    <span key={t.id}>
                      {gap && <span className="gap">{gap}</span>}
                      <TokenChip
                        side="orig"
                        id={t.id}
                        form={t.form}
                        group={maps.byOrig.get(t.id)}
                        selected={selected.has(t.id)}
                        unverified={analysed && !t.verified}
                        analysed={analysed}
                        title={`${t.id}${gloss ? ` · ${gloss}` : ""}`}
                      />
                      {tail && <span className="gap">{tail}</span>}
                    </span>
                  );
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
