import type { TreeResponse } from "@sofia/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import { routeFromFile } from "./derive";
import { Inspector } from "./Inspector";
import { handleKey } from "./keys";
import { OriginalPane } from "./OriginalPane";
import { redo, undo, useEditor } from "./store";
import { TranslationPane } from "./TranslationPane";

export function Editor({ file, tree }: { file: string; tree: TreeResponse | undefined }) {
  const qc = useQueryClient();
  const s = useEditor();
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: api.config,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const loaded = useQuery({
    queryKey: ["section", file],
    queryFn: () => api.section(file),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (loaded.data && s.file !== file) s.load(loaded.data);
  }, [loaded.data, file, s.file, s.load]);

  const save = useMutation({
    mutationFn: async () => {
      const st = useEditor.getState();
      if (!st.doc) throw new Error("nothing loaded");
      return api.save(file, st.doc, st.etag);
    },
    onSuccess: (res) => {
      s.applySaved(res);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["tree"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409)
        setError(
          "Conflict: the file changed on disk. Reload to pick up the other change (your edits will be lost).",
        );
      else if (e instanceof ApiError && e.status === 422)
        setError(
          `Cannot save: ${e.message} ${JSON.stringify((e.body as { issues?: unknown }).issues ?? "")}`,
        );
      else setError((e as Error).message);
    },
  });

  const suggestMorph = useMutation({
    mutationFn: async () => {
      const st = useEditor.getState();
      if (!st.doc) throw new Error("nothing loaded");
      return api.suggestMorphology(st.doc);
    },
    onSuccess: (res) => {
      s.setMorphSuggestions(res.suggestions);
      s.setStatusMessage(`${res.suggestions.length} morphology suggestions from ${res.model}`);
    },
    onError: (e) => setError((e as Error).message),
  });

  const suggestAlign = useMutation({
    mutationFn: async () => {
      const st = useEditor.getState();
      if (!st.doc) throw new Error("nothing loaded");
      const locked = st.doc.groups.filter((g) => g.translation.length > 0).map((g) => g.id);
      return api.suggestAlignment(st.doc, locked);
    },
    onSuccess: (res) => {
      s.setAlignSuggestions(res.groups);
      s.setStatusMessage(`${res.groups.length} alignment suggestions from ${res.model}`);
    },
    onError: (e) => setError((e as Error).message),
  });

  const previewUrl = (() => {
    const r = routeFromFile(file);
    if (!r || !tree) return null;
    const chapter = tree.authors
      .find((a) => a.slug === r.author)
      ?.works.find((w) => w.slug === r.work)
      ?.chapters.find((c) => c.slug === r.chapter);
    const idx = chapter?.sections.findIndex((x) => x.file === file) ?? -1;
    const base = config.data?.astroUrl ?? "http://localhost:4321";
    return `${base}/authors/${r.author}/${r.work}/${r.chapter}/${idx >= 0 ? `#s${String(idx + 1).padStart(2, "0")}` : ""}`;
  })();

  useEffect(() => {
    const handlers = {
      save: () => save.mutate(),
      preview: () => {
        if (previewUrl) window.open(previewUrl, "sofia-preview");
      },
      focusNote: () => noteRef.current?.focus(),
    };
    const onKey = (e: KeyboardEvent) => handleKey(e, handlers);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, previewUrl]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (loaded.isLoading || !s.doc || s.file !== file)
    return <p className="muted pad">Loading {file}…</p>;
  if (loaded.isError) return <p className="error pad">{(loaded.error as Error).message}</p>;

  const doc = s.doc;
  const grouped = new Set(doc.groups.flatMap((g) => g.original));
  const aligned = doc.tokens.filter((t) => grouped.has(t.id)).length;
  const analysed = doc.tokens.filter((t) => t.lemma || Object.keys(t.morph).length > 0);
  const verified = analysed.filter((t) => t.verified).length;
  const errors = s.issues.filter((i) => i.level === "error");

  return (
    <div className="editor">
      <header className="toolbar">
        <a href="#/" className="back">
          ← Library
        </a>
        <div className="crumb">
          <span className="mono muted small">{file}</span>
        </div>
        <div className="stats small muted">
          <span title="original words linked to a group">
            {aligned}/{doc.tokens.length} linked
          </span>
          <span title="analyses confirmed">
            {verified}/{analysed.length} verified
          </span>
          <span className={`status-${doc.meta.status}`}>{doc.meta.status}</span>
          {s.dirty && <span className="dirty">unsaved</span>}
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={() => undo()} title="⌘Z">
            Undo
          </button>
          <button type="button" className="ghost" onClick={() => redo()} title="⇧⌘Z">
            Redo
          </button>
          <button
            type="button"
            className="ghost"
            disabled={suggestMorph.isPending || !config.data?.hasApiKey}
            title={config.data?.hasApiKey ? "Morpheus + Claude" : "Set ANTHROPIC_API_KEY in .env"}
            onClick={() => suggestMorph.mutate()}
          >
            {suggestMorph.isPending ? "Analysing…" : "Suggest morphology"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={
              suggestAlign.isPending || !config.data?.hasApiKey || doc.translation.length === 0
            }
            title={config.data?.hasApiKey ? "Claude" : "Set ANTHROPIC_API_KEY in .env"}
            onClick={() => suggestAlign.mutate()}
          >
            {suggestAlign.isPending ? "Aligning…" : "Suggest alignment"}
          </button>
          {previewUrl && (
            <a
              className="btn ghost"
              href={previewUrl}
              target="sofia-preview"
              rel="noreferrer"
              title="P"
            >
              Preview
            </a>
          )}
          <button
            type="button"
            className="primary"
            disabled={save.isPending || !s.dirty}
            onClick={() => save.mutate()}
            title="⌘S"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </header>
      {(error || errors.length > 0 || s.warnings.length > 0 || s.status) && (
        <div className="messages">
          {error && <div className="msg error">{error}</div>}
          {errors.map((i) => (
            <div key={i.message} className="msg error">
              {i.message}
            </div>
          ))}
          {s.warnings.map((w) => (
            <div key={w} className="msg warn">
              {w}
            </div>
          ))}
          {s.status && !error && <div className="msg ok">{s.status}</div>}
        </div>
      )}
      <div className="panes">
        <OriginalPane />
        <TranslationPane />
        <Inspector noteRef={noteRef} />
      </div>
    </div>
  );
}
