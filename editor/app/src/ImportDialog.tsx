import type { ImportCtsResponse, Lang, TextForm, TreeResponse, Unit } from "@sofia/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "./api";

interface Props {
  tree: TreeResponse;
  onClose: () => void;
}

export function ImportDialog({ tree, onClose }: Props) {
  const qc = useQueryClient();
  const chapters = useMemo(
    () =>
      tree.authors.flatMap((a) =>
        a.works.flatMap((w) =>
          w.chapters.map((c) => ({
            dir: c.dir,
            label: `${a.name} · ${w.title} · ${c.title}`,
            lang: w.lang,
            urnBase: w.urnBase,
            count: c.sections.length,
          })),
        ),
      ),
    [tree],
  );
  const [mode, setMode] = useState<"cts" | "paste">("cts");
  const [chapterDir, setChapterDir] = useState(chapters[0]?.dir ?? "");
  const chapter = chapters.find((c) => c.dir === chapterDir);
  const [urn, setUrn] = useState(chapter?.urnBase ? `${chapter.urnBase}:` : "urn:cts:");
  const [pasted, setPasted] = useState("");
  const [lang, setLang] = useState<Lang>(chapter?.lang ?? "grc");
  const [form, setForm] = useState<TextForm>("verse");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [preview, setPreview] = useState<ImportCtsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCts = useMutation({
    mutationFn: () => api.importCts(urn.trim()),
    onSuccess: (res) => {
      setPreview(res);
      setLang(res.lang);
      setForm(res.form);
      setError(null);
      if (!title)
        setTitle(
          `${res.form === "verse" ? "Lines" : "Sections"} ${res.units[0]?.n}–${res.units[res.units.length - 1]?.n}`,
        );
      if (!slug)
        setSlug(
          `${res.form === "verse" ? "lines" : "sections"}-${res.units[0]?.n}-${res.units[res.units.length - 1]?.n}`,
        );
    },
    onError: (e) => setError((e as Error).message),
  });

  const parsePasted = (): Unit[] =>
    pasted
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = /^([0-9]+[a-z]?)\s+(.*)$/.exec(l);
        return m ? { n: m[1]!, text: m[2]! } : { n: "?", text: l };
      });

  const create = useMutation({
    mutationFn: async () => {
      const units = mode === "cts" ? (preview?.units ?? []) : parsePasted();
      if (units.length === 0) throw new Error("no units to import");
      if (units.some((u) => u.n === "?"))
        throw new Error("every pasted line must start with its number");
      const nn = String((chapter?.count ?? 0) + 1).padStart(2, "0");
      const req = {
        chapterDir,
        fileName: `${nn}${slug ? `-${slug}` : ""}.md`,
        title: title || `${units[0]!.n}–${units[units.length - 1]!.n}`,
        lang,
        form,
        units,
        ...(mode === "cts" && preview ? { urn: preview.urn } : {}),
      };
      return api.create(req);
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["tree"] });
      onClose();
      location.hash = `#/edit/${res.file}`;
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <h2 id="import-title">Import a passage</h2>
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "cts"}
            className={mode === "cts" ? "on" : ""}
            onClick={() => setMode("cts")}
          >
            From Perseus (CTS URN)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "paste"}
            className={mode === "paste" ? "on" : ""}
            onClick={() => setMode("paste")}
          >
            Paste text
          </button>
        </div>
        <label className="field">
          <span>Into chapter</span>
          <select
            value={chapterDir}
            onChange={(e) => {
              setChapterDir(e.target.value);
              const next = chapters.find((c) => c.dir === e.target.value);
              if (/^urn:cts:[^:]*:?[^:]*:?$/.test(urn) || urn === "urn:cts:")
                setUrn(next?.urnBase ? `${next.urnBase}:` : "urn:cts:");
            }}
          >
            {chapters.map((c) => (
              <option key={c.dir} value={c.dir}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {mode === "cts" ? (
          <>
            <label className="field">
              <span>CTS URN</span>
              <input
                className="mono"
                value={urn}
                onChange={(e) => setUrn(e.target.value)}
                placeholder="urn:cts:greekLit:tlg0006.tlg012.perseus-grc2:54-81"
              />
            </label>
            <button type="button" onClick={() => fetchCts.mutate()} disabled={fetchCts.isPending}>
              {fetchCts.isPending ? "Fetching…" : "Fetch"}
            </button>
            {preview && (
              <div className="preview">
                <p className="muted small">
                  {preview.units.length} {preview.form} unit(s),{" "}
                  {preview.lang === "grc" ? "Greek" : "Latin"} · {preview.source.edition}
                </p>
                <ol lang={preview.lang === "lat" ? "la" : "grc"}>
                  {preview.units.map((u) => (
                    <li key={u.n}>
                      <span className="ln">{u.n}</span> {u.text}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="row">
              <label className="field small">
                <span>Language</span>
                <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                  <option value="grc">Greek</option>
                  <option value="lat">Latin</option>
                </select>
              </label>
              <label className="field small">
                <span>Form</span>
                <select value={form} onChange={(e) => setForm(e.target.value as TextForm)}>
                  <option value="verse">verse</option>
                  <option value="prose">prose</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Text, one unit per line, starting with its number</span>
              <textarea
                rows={8}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={
                  "54 ὦ νὺξ μέλαινα, χρυσέων ἄστρων τροφέ,\n55 ἐν ᾗ τόδ᾽ ἄγγος τῷδ᾽ ἐφεδρεῦον κάρᾳ"
                }
              />
            </label>
          </>
        )}
        <div className="row">
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Lines 54–81"
            />
          </label>
          <label className="field">
            <span>File slug</span>
            <input
              className="mono"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}
              placeholder="lines-54-81"
            />
          </label>
        </div>
        {error && <div className="msg error">{error}</div>}
        <div className="row end">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => create.mutate()}
            disabled={create.isPending || (mode === "cts" && !preview)}
          >
            Create section
          </button>
        </div>
      </div>
    </div>
  );
}
