import {
  type AlignmentGroup,
  describeMorph,
  hasMorph,
  type Section,
  type Token,
  type TrlToken,
} from "@sofia/core";

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export interface GroupIndex {
  byOriginal: Map<string, AlignmentGroup>;
  byTranslation: Map<string, AlignmentGroup>;
}

export function indexGroups(section: Section): GroupIndex {
  const byOriginal = new Map<string, AlignmentGroup>();
  const byTranslation = new Map<string, AlignmentGroup>();
  for (const g of section.groups) {
    for (const id of g.original) byOriginal.set(id, g);
    for (const id of g.translation) byTranslation.set(id, g);
  }
  return { byOriginal, byTranslation };
}

export function glossFor(token: Token): string {
  const desc = describeMorph(token.morph);
  const parts: string[] = [];
  if (token.lemma) parts.push(token.lemma);
  if (desc) parts.push(desc);
  if (parts.length === 0) return "";
  const s = parts.join(" · ");
  return token.verified ? s : `${s} (unverified)`;
}

function attrs(pairs: Array<[string, string | undefined]>): string {
  return pairs
    .filter((p): p is [string, string] => p[1] !== undefined && p[1] !== "")
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
    .join("");
}

/** Render one original unit's text with token spans. Gaps (punctuation, spaces) are left as-is. */
export function renderOriginalUnit(
  text: string,
  tokens: readonly Token[],
  groups: GroupIndex,
): string {
  let html = "";
  let pos = 0;
  for (const t of tokens) {
    html += escapeHtml(text.slice(pos, t.start));
    const g = groups.byOriginal.get(t.id);
    const analysed = t.lemma !== undefined || hasMorph(t.morph);
    html += `<span class="tok"${attrs([
      ["data-id", t.id],
      ["data-g", g?.id],
      ["data-label", g?.label],
      ["data-gloss", analysed ? glossFor(t) : undefined],
      ["data-note", g?.note],
    ])}>${escapeHtml(t.form)}</span>`;
    pos = t.end;
  }
  html += escapeHtml(text.slice(pos));
  return html;
}

/** Render one translation paragraph with token spans; soft breaks become <br>. */
export function renderTranslationParagraph(
  text: string,
  tokens: readonly TrlToken[],
  groups: GroupIndex,
): string {
  let html = "";
  let pos = 0;
  const gap = (s: string) => escapeHtml(s).replace(/\n/g, "<br>\n");
  for (const t of tokens) {
    html += gap(text.slice(pos, t.start));
    const g = groups.byTranslation.get(t.id);
    html += `<span class="tok"${attrs([
      ["data-id", t.id],
      ["data-g", g?.id],
      ["data-label", g?.label],
      ["data-note", g?.note],
    ])}>${escapeHtml(t.form)}</span>`;
    pos = t.end;
  }
  html += gap(text.slice(pos));
  return html;
}
