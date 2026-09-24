import {
  type AlignmentGroup,
  type AlignmentSuggestion,
  type GroupLabel,
  type Morphology,
  type MorphSuggestion,
  parseOriginalBlock,
  parseSection,
  parseTranslationBlock,
  type Section,
  type SectionResponse,
  serializeSection,
  suggestLabel,
  type ValidationIssue,
  validateSection,
} from "@sofia/core";
import { temporal } from "zundo";
import { create } from "zustand";

export type Side = "orig" | "trl";

export interface EditorState {
  file: string | null;
  doc: Section | null;
  etag: string;
  dirty: boolean;
  warnings: string[];
  issues: ValidationIssue[];
  origSel: string[];
  trlSel: string[];
  anchor: { orig?: string; trl?: string };
  activeGroup: string | null;
  hoverGroup: string | null;
  writeMode: { orig: boolean; trl: boolean };
  morphSuggestions: MorphSuggestion[];
  alignSuggestions: AlignmentSuggestion[];
  status: string;

  load: (res: SectionResponse) => void;
  applySaved: (res: SectionResponse) => void;
  updateDoc: (fn: (d: Section) => void, opts?: { renormalize?: boolean }) => void;
  select: (side: Side, id: string, mode: "replace" | "toggle" | "range") => void;
  clearSelection: () => void;
  setActiveGroup: (id: string | null) => void;
  setHoverGroup: (id: string | null) => void;
  createGroup: () => void;
  setLabel: (label: GroupLabel) => void;
  setNote: (note: string) => void;
  ungroup: () => void;
  setMorph: (tokenId: string, morph: Morphology, lemma?: string | undefined) => void;
  setVerified: (tokenIds: string[], verified: boolean) => void;
  setTitle: (title: string) => void;
  setStatus: (status: Section["meta"]["status"]) => void;
  setNotes: (notes: string) => void;
  setWriteMode: (side: Side, on: boolean) => void;
  applyText: (side: Side, text: string) => void;
  jumpUnaligned: (dir: 1 | -1) => void;
  setMorphSuggestions: (s: MorphSuggestion[]) => void;
  setAlignSuggestions: (s: AlignmentSuggestion[]) => void;
  acceptMorphSuggestion: (id: string) => void;
  rejectMorphSuggestion: (id: string) => void;
  acceptAlignSuggestion: (index: number) => void;
  rejectAlignSuggestion: (index: number) => void;
  acceptAllSuggestions: () => void;
  setStatusMessage: (s: string) => void;
}

/** Re-run the canonical text round trip so token ids/groups are exactly what the file will hold. */
function normalize(doc: Section): { doc: Section; warnings: string[] } {
  const { section, warnings } = parseSection(serializeSection(doc));
  return { doc: section, warnings };
}

function docOrder(doc: Section): { orig: Map<string, number>; trl: Map<string, number> } {
  return {
    orig: new Map(doc.tokens.map((t, i) => [t.id, i])),
    trl: new Map(doc.translationTokens.map((t, i) => [t.id, i])),
  };
}

export function textForSide(doc: Section, side: Side): string {
  if (side === "orig") {
    const out: string[] = [];
    for (const u of doc.original) {
      if (u.speaker !== undefined) out.push(`@ ${u.speaker}`);
      out.push(`${u.n} ${u.text}`);
    }
    return out.join("\n");
  }
  return doc.translation
    .map((p) => (p.speaker !== undefined ? `@ ${p.speaker}\n${p.text}` : p.text))
    .join("\n\n");
}

export const useEditor = create<EditorState>()(
  temporal(
    (set, get) => ({
      file: null,
      doc: null,
      etag: "",
      dirty: false,
      warnings: [],
      issues: [],
      origSel: [],
      trlSel: [],
      anchor: {},
      activeGroup: null,
      hoverGroup: null,
      writeMode: { orig: false, trl: false },
      morphSuggestions: [],
      alignSuggestions: [],
      status: "",

      load: (res) =>
        set({
          file: res.file,
          doc: res.doc,
          etag: res.etag,
          dirty: false,
          warnings: res.warnings,
          issues: res.issues,
          origSel: [],
          trlSel: [],
          anchor: {},
          activeGroup: null,
          hoverGroup: null,
          writeMode: { orig: false, trl: false },
          morphSuggestions: [],
          alignSuggestions: [],
          status: "",
        }),

      applySaved: (res) =>
        set({
          doc: res.doc,
          etag: res.etag,
          dirty: false,
          warnings: res.warnings,
          issues: res.issues,
          status: "Saved",
        }),

      updateDoc: (fn, opts) => {
        const doc = get().doc;
        if (!doc) return;
        const d = structuredClone(doc);
        fn(d);
        if (opts?.renormalize) {
          const n = normalize(d);
          set({ doc: n.doc, warnings: n.warnings, issues: validateSection(n.doc), dirty: true });
        } else {
          set({ doc: d, issues: validateSection(d), dirty: true });
        }
      },

      select: (side, id, mode) => {
        const { doc } = get();
        if (!doc) return;
        const key = side === "orig" ? "origSel" : "trlSel";
        const current = get()[key];
        const order = docOrder(doc)[side];
        let next: string[];
        if (mode === "toggle") {
          next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
        } else if (mode === "range" && get().anchor[side]) {
          const a = order.get(get().anchor[side]!) ?? 0;
          const b = order.get(id) ?? 0;
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const ids = [...order.entries()].filter(([, i]) => i >= lo && i <= hi).map(([k]) => k);
          next = [...new Set([...current, ...ids])];
        } else {
          next = [id];
        }
        next.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
        const group = doc.groups.find((g) =>
          (side === "orig" ? g.original : g.translation).includes(id),
        );
        set({
          [key]: next,
          anchor: { ...get().anchor, [side]: mode === "range" ? get().anchor[side] : id },
          activeGroup: mode === "replace" ? (group?.id ?? null) : get().activeGroup,
        } as Partial<EditorState>);
      },

      clearSelection: () => set({ origSel: [], trlSel: [], activeGroup: null }),
      setActiveGroup: (id) => set({ activeGroup: id }),
      setHoverGroup: (id) => set({ hoverGroup: id }),

      createGroup: () => {
        const { doc, origSel, trlSel } = get();
        if (!doc || (origSel.length === 0 && trlSel.length === 0)) return;
        let newId = "";
        get().updateDoc((d) => {
          for (const g of d.groups) {
            g.original = g.original.filter((id) => !origSel.includes(id));
            g.translation = g.translation.filter((id) => !trlSel.includes(id));
          }
          d.groups = d.groups.filter((g) => g.original.length > 0 || g.translation.length > 0);
          const order = docOrder(d);
          const head =
            d.tokens.find((t) => origSel.includes(t.id) && t.morph.case !== undefined) ??
            d.tokens.find((t) => origSel.includes(t.id) && t.morph.pos === "verb") ??
            d.tokens.find((t) => origSel.includes(t.id));
          newId = `g${d.meta.nextId.g++}`;
          d.groups.push({
            id: newId,
            label: head ? suggestLabel(head.morph) : "other",
            original: [...origSel].sort(
              (a, b) => (order.orig.get(a) ?? 0) - (order.orig.get(b) ?? 0),
            ),
            translation: [...trlSel].sort(
              (a, b) => (order.trl.get(a) ?? 0) - (order.trl.get(b) ?? 0),
            ),
          });
        });
        set({ origSel: [], trlSel: [], activeGroup: newId });
      },

      setLabel: (label) => {
        const { activeGroup } = get();
        if (!activeGroup) return;
        get().updateDoc((d) => {
          const g = d.groups.find((x) => x.id === activeGroup);
          if (g) g.label = label;
        });
      },

      setNote: (note) => {
        const { activeGroup } = get();
        if (!activeGroup) return;
        get().updateDoc((d) => {
          const g = d.groups.find((x) => x.id === activeGroup);
          if (!g) return;
          if (note.trim() === "") delete g.note;
          else g.note = note;
        });
      },

      ungroup: () => {
        const { activeGroup } = get();
        if (!activeGroup) return;
        get().updateDoc((d) => {
          d.groups = d.groups.filter((g) => g.id !== activeGroup);
        });
        set({ activeGroup: null });
      },

      setMorph: (tokenId, morph, lemma) => {
        get().updateDoc((d) => {
          const t = d.tokens.find((x) => x.id === tokenId);
          if (!t) return;
          t.morph = morph;
          if (lemma !== undefined) {
            if (lemma.trim() === "") delete t.lemma;
            else t.lemma = lemma.trim();
          }
        });
      },

      setVerified: (tokenIds, verified) => {
        get().updateDoc((d) => {
          for (const t of d.tokens) if (tokenIds.includes(t.id)) t.verified = verified;
        });
      },

      setTitle: (title) =>
        get().updateDoc((d) => {
          d.meta.title = title;
        }),
      setStatus: (status) =>
        get().updateDoc((d) => {
          d.meta.status = status;
        }),
      setNotes: (notes) =>
        get().updateDoc((d) => {
          if (notes.trim() === "") delete d.notes;
          else d.notes = notes;
        }),

      setWriteMode: (side, on) => set({ writeMode: { ...get().writeMode, [side]: on } }),

      applyText: (side, text) => {
        const lines = text.split("\n").map((t, i) => ({ no: i + 1, text: t }));
        get().updateDoc(
          (d) => {
            if (side === "orig") {
              d.original = parseOriginalBlock(lines).units;
            } else {
              d.translation = parseTranslationBlock(lines);
            }
          },
          { renormalize: true },
        );
        set({ writeMode: { ...get().writeMode, [side]: false } });
      },

      jumpUnaligned: (dir) => {
        const { doc, origSel } = get();
        if (!doc) return;
        const grouped = new Set(doc.groups.flatMap((g) => g.original));
        const ids = doc.tokens.map((t) => t.id);
        const cur = origSel.length ? ids.indexOf(origSel[origSel.length - 1]!) : -1;
        for (let step = 1; step <= ids.length; step++) {
          const i = (cur + dir * step + ids.length * 2) % ids.length;
          const id = ids[i]!;
          if (!grouped.has(id)) {
            set({ origSel: [id], anchor: { ...get().anchor, orig: id }, activeGroup: null });
            return;
          }
        }
      },

      setMorphSuggestions: (s) => set({ morphSuggestions: s }),
      setAlignSuggestions: (s) => set({ alignSuggestions: s }),

      acceptMorphSuggestion: (id) => {
        const s = get().morphSuggestions.find((x) => x.id === id);
        if (!s) return;
        get().updateDoc((d) => {
          const t = d.tokens.find((x) => x.id === id);
          if (!t) return;
          t.morph = s.morph;
          if (s.lemma) t.lemma = s.lemma;
          t.verified = false;
        });
        set({ morphSuggestions: get().morphSuggestions.filter((x) => x.id !== id) });
      },
      rejectMorphSuggestion: (id) =>
        set({ morphSuggestions: get().morphSuggestions.filter((x) => x.id !== id) }),

      acceptAlignSuggestion: (index) => {
        const s = get().alignSuggestions[index];
        if (!s) return;
        get().updateDoc((d) => {
          for (const g of d.groups) {
            g.original = g.original.filter((id) => !s.original.includes(id));
            g.translation = g.translation.filter((id) => !s.translation.includes(id));
          }
          d.groups = d.groups.filter((g) => g.original.length > 0 || g.translation.length > 0);
          const g: AlignmentGroup = {
            id: `g${d.meta.nextId.g++}`,
            label: s.label,
            original: s.original,
            translation: s.translation,
          };
          if (s.note) g.note = s.note;
          d.groups.push(g);
        });
        set({ alignSuggestions: get().alignSuggestions.filter((_, i) => i !== index) });
      },
      rejectAlignSuggestion: (index) =>
        set({ alignSuggestions: get().alignSuggestions.filter((_, i) => i !== index) }),

      acceptAllSuggestions: () => {
        for (const s of [...get().morphSuggestions]) get().acceptMorphSuggestion(s.id);
        while (get().alignSuggestions.length > 0) get().acceptAlignSuggestion(0);
      },

      setStatusMessage: (status) => set({ status }),
    }),
    { partialize: (s) => ({ doc: s.doc }), limit: 200 },
  ),
);

export const undo = () => useEditor.temporal.getState().undo();
export const redo = () => useEditor.temporal.getState().redo();
