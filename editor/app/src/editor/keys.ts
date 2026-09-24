import type { GroupLabel } from "@sofia/core";
import { redo, undo, useEditor } from "./store";

const DIGIT_LABELS: GroupLabel[] = [
  "nom",
  "gen",
  "dat",
  "acc",
  "abl",
  "voc",
  "adv",
  "verb",
  "other",
];

export interface KeyHandlers {
  save: () => void;
  preview: () => void;
  focusNote: () => void;
}

export function handleKey(e: KeyboardEvent, h: KeyHandlers): void {
  const target = e.target as HTMLElement | null;
  const typing =
    !!target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable);
  const s = useEditor.getState();
  const mod = e.metaKey || e.ctrlKey;

  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    h.save();
    return;
  }
  if (mod && e.key.toLowerCase() === "z") {
    if (typing) return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (typing) {
    if (e.key === "Escape") (target as HTMLElement).blur();
    return;
  }
  switch (e.key) {
    case "Enter":
      e.preventDefault();
      s.createGroup();
      return;
    case "Escape":
      s.clearSelection();
      return;
    case "Backspace":
    case "Delete":
      e.preventDefault();
      s.ungroup();
      return;
    case "]":
      s.jumpUnaligned(1);
      return;
    case "[":
      s.jumpUnaligned(-1);
      return;
    default:
      break;
  }
  const k = e.key.toLowerCase();
  if (/^[1-9]$/.test(e.key)) {
    s.setLabel(DIGIT_LABELS[Number(e.key) - 1]!);
    return;
  }
  if (k === "n") {
    e.preventDefault();
    h.focusNote();
    return;
  }
  if (k === "v") {
    const ids = s.origSel;
    if (ids.length && s.doc) {
      const allVerified = ids.every((id) => s.doc?.tokens.find((t) => t.id === id)?.verified);
      s.setVerified(ids, !allVerified);
    }
    return;
  }
  if (k === "e") {
    s.setWriteMode("trl", !s.writeMode.trl);
    return;
  }
  if (k === "p") {
    h.preview();
    return;
  }
  if (k === "a" && e.shiftKey) {
    s.acceptAllSuggestions();
    return;
  }
  if (k === "a") {
    const m = s.morphSuggestions[0];
    if (m) s.acceptMorphSuggestion(m.id);
    else if (s.alignSuggestions.length) s.acceptAlignSuggestion(0);
    return;
  }
  if (k === "x") {
    const m = s.morphSuggestions[0];
    if (m) s.rejectMorphSuggestion(m.id);
    else if (s.alignSuggestions.length) s.rejectAlignSuggestion(0);
  }
}
