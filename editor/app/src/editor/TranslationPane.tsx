import { useMemo, useRef } from "react";
import { groupMaps } from "./derive";
import { textForSide, useEditor } from "./store";
import { TokenChip } from "./TokenChip";

export function TranslationPane() {
  const doc = useEditor((s) => s.doc);
  const trlSel = useEditor((s) => s.trlSel);
  const writeMode = useEditor((s) => s.writeMode.trl);
  const setWriteMode = useEditor((s) => s.setWriteMode);
  const applyText = useEditor((s) => s.applyText);
  const ref = useRef<HTMLTextAreaElement>(null);
  const maps = useMemo(() => (doc ? groupMaps(doc) : null), [doc]);
  if (!doc || !maps) return null;
  const selected = new Set(trlSel);
  const byPara = new Map<number, typeof doc.translationTokens>();
  for (const t of doc.translationTokens)
    byPara.set(t.paragraph, [...(byPara.get(t.paragraph) ?? []), t]);

  if (writeMode) {
    return (
      <section className="pane">
        <header className="pane-head">
          <h2>
            Translation <span className="muted">writing</span>
          </h2>
          <div className="pane-actions">
            <button type="button" onClick={() => applyText("trl", ref.current?.value ?? "")}>
              Done (E)
            </button>
            <button type="button" className="ghost" onClick={() => setWriteMode("trl", false)}>
              Cancel
            </button>
          </div>
        </header>
        <p className="hint">
          Blank line = new paragraph. <code>@ Name</code> on its own line = speaker. Existing links
          survive edits; only words you remove lose theirs.
        </p>
        <textarea
          ref={ref}
          className="text-editor"
          lang="en"
          defaultValue={textForSide(doc, "trl")}
        />
      </section>
    );
  }

  return (
    <section className="pane">
      <header className="pane-head">
        <h2>
          Translation <span className="muted">English</span>
        </h2>
        <div className="pane-actions">
          <button type="button" className="ghost" onClick={() => setWriteMode("trl", true)}>
            Write (E)
          </button>
        </div>
      </header>
      {doc.translation.length === 0 && (
        <p className="placeholder">
          No translation yet. Press <kbd>E</kbd> to write one.
        </p>
      )}
      <div className="paragraphs" lang="en">
        {doc.translation.map((p, k) => (
          <div key={byPara.get(k)?.[0]?.id ?? `${p.speaker ?? ""}${p.text}`}>
            {p.speaker !== undefined && <div className="speaker">{p.speaker}</div>}
            <p className="para">
              {(byPara.get(k) ?? []).map((t, i, arr) => {
                const prev = arr[i - 1];
                const gap = p.text.slice(prev ? prev.end : 0, t.start);
                const tail = i === arr.length - 1 ? p.text.slice(t.end) : "";
                return (
                  <span key={t.id}>
                    {gap && <span className="gap">{gap}</span>}
                    <TokenChip
                      side="trl"
                      id={t.id}
                      form={t.form}
                      group={maps.byTrl.get(t.id)}
                      selected={selected.has(t.id)}
                      title={t.id}
                    />
                    {tail && <span className="gap">{tail}</span>}
                  </span>
                );
              })}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
