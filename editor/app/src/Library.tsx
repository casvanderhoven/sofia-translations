import type { TreeResponse } from "@sofia/core";
import { useState } from "react";
import { ImportDialog } from "./ImportDialog";

export function Library({ tree, error }: { tree: TreeResponse | undefined; error: Error | null }) {
  const [importing, setImporting] = useState(false);
  return (
    <div className="library">
      <header className="toolbar">
        <h1>Sofia editor</h1>
        <div className="actions">
          <button
            type="button"
            className="primary"
            onClick={() => setImporting(true)}
            disabled={!tree}
          >
            Import passage…
          </button>
        </div>
      </header>
      {error && <div className="msg error">{error.message}. Is the file API running on :5174?</div>}
      {!tree && !error && <p className="muted pad">Loading…</p>}
      {tree?.authors.map((a) => (
        <section key={a.slug} className="lib-author">
          <h2>{a.name}</h2>
          {a.works.map((w) => (
            <div key={w.slug} className="lib-work">
              <h3>
                {w.title}{" "}
                <span className="muted small">{w.lang === "grc" ? "Greek" : "Latin"}</span>
              </h3>
              {w.chapters.map((c) => (
                <div key={c.slug} className="lib-chapter">
                  <h4>
                    {c.title} <span className="muted small mono">{c.dir}</span>
                  </h4>
                  <table>
                    <tbody>
                      {c.sections.map((sec) => (
                        <tr key={sec.file}>
                          <td>
                            <a href={`#/edit/${sec.file}`}>{sec.title}</a>
                          </td>
                          <td className="muted small">
                            {sec.lines[0]}–{sec.lines[1]}
                          </td>
                          <td>
                            <span className={`pill status-${sec.status}`}>{sec.status}</span>
                          </td>
                          <td className="small">
                            <Meter value={sec.aligned} max={sec.tokens} label="linked" />
                          </td>
                          <td className="small">
                            <Meter value={sec.verified} max={sec.tokens} label="verified" />
                          </td>
                          <td className="small">
                            {sec.hasTranslation ? (
                              "translation"
                            ) : (
                              <span className="muted">no translation</span>
                            )}
                          </td>
                          <td className="small">
                            {sec.errors > 0 && <span className="error">{sec.errors} errors</span>}{" "}
                            {sec.warnings > 0 && (
                              <span className="warn">{sec.warnings} warnings</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
      {importing && tree && <ImportDialog tree={tree} onClose={() => setImporting(false)} />}
    </div>
  );
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max === 0 ? 0 : Math.round((100 * value) / max);
  return (
    <span className="meter" title={`${value}/${max} ${label}`}>
      <span className="bar">
        <span style={{ width: `${pct}%` }} />
      </span>{" "}
      {pct}% {label}
    </span>
  );
}
