import YAML, { isCollection } from "yaml";
import { formatTags, hasMorph } from "./morph-tags.ts";
import type { AlignmentGroup, Section } from "./types.ts";

function pad(s: string, width: number): string {
  const len = Array.from(s).length;
  return len >= width ? s : s + " ".repeat(width - len);
}

function numify(n: string): string | number {
  return /^[0-9]+$/.test(n) ? Number(n) : n;
}

function escapeNote(s: string): string {
  return s.replace(/[\\"]/g, (c) => `\\${c}`).replace(/\n/g, " ");
}

export function serializeFrontmatter(section: Section): string {
  const { meta } = section;
  const fm: Record<string, unknown> = {
    sofia: 1,
    title: meta.title,
    lang: meta.lang,
    form: meta.form,
  };
  if (meta.urn !== undefined) fm.urn = meta.urn;
  fm.lines = meta.lines.map(numify);
  if (meta.source !== undefined) {
    const src: Record<string, string> = {
      edition: meta.source.edition,
      license: meta.source.license,
    };
    if (meta.source.retrieved !== undefined) src.retrieved = meta.source.retrieved;
    if (meta.source.url !== undefined) src.url = meta.source.url;
    fm.source = src;
  }
  fm.status = meta.status;
  fm.next_id = { t: meta.nextId.t, g: meta.nextId.g };
  const doc = new YAML.Document(fm);
  for (const key of ["lines", "source", "next_id"]) {
    const node = doc.get(key, true);
    if (isCollection(node)) node.flow = true;
  }
  return doc.toString({ lineWidth: 0 });
}

/** Sort groups by first original token position, then first translation token, then id. */
export function sortGroups(section: Section): AlignmentGroup[] {
  const origPos = new Map(section.tokens.map((t, k) => [t.id, k]));
  const trlPos = new Map(section.translationTokens.map((t, k) => [t.id, k]));
  const key = (g: AlignmentGroup): [number, number, number] => [
    Math.min(
      ...g.original.map((id) => origPos.get(id) ?? Number.POSITIVE_INFINITY),
      Number.POSITIVE_INFINITY,
    ),
    Math.min(
      ...g.translation.map((id) => trlPos.get(id) ?? Number.POSITIVE_INFINITY),
      Number.POSITIVE_INFINITY,
    ),
    Number(g.id.slice(1)),
  ];
  return [...section.groups].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    return 0;
  });
}

export function serializeSection(section: Section): string {
  const out: string[] = [];
  out.push("---");
  out.push(serializeFrontmatter(section).trimEnd());
  out.push("---", "");

  out.push("## Original", "");
  for (const u of section.original) {
    if (u.speaker !== undefined) out.push(`@ ${u.speaker}`);
    out.push(u.text === "" ? u.n : `${u.n} ${u.text}`);
  }
  out.push("");

  out.push("## Translation", "");
  section.translation.forEach((p, k) => {
    if (k > 0) out.push("");
    if (p.speaker !== undefined) out.push(`@ ${p.speaker}`);
    out.push(...p.text.split("\n"));
  });
  out.push("");

  out.push("## Tokens", "");
  for (const t of section.tokens) {
    const analysed = t.lemma !== undefined || hasMorph(t.morph);
    const mark = analysed && !t.verified ? "~" : "";
    const row = `${pad(mark + t.id, 7)} ${pad(t.form, 18)} ${pad(t.lemma ?? "-", 18)} ${formatTags(t.morph).join(" ")}`;
    out.push(row.trimEnd());
  }
  out.push("");

  out.push("## Translation tokens", "");
  for (const t of section.translationTokens) out.push(`${t.id} ${t.form}`);
  out.push("");

  out.push("## Groups", "");
  const origForm = new Map(section.tokens.map((t) => [t.id, t.form]));
  const trlForm = new Map(section.translationTokens.map((t) => [t.id, t.form]));
  for (const g of sortGroups(section)) {
    const parts = [pad(g.id, 4), pad(g.label, 5)];
    if (g.original.length) parts.push(g.original.join(" "));
    parts.push("|");
    if (g.translation.length) parts.push(g.translation.join(" "));
    if (g.note !== undefined && g.note !== "") parts.push(`"${escapeNote(g.note)}"`);
    const of = g.original.map((id) => origForm.get(id) ?? "?").join(" ");
    const tf = g.translation.map((id) => trlForm.get(id) ?? "?").join(" ");
    if (of !== "" || tf !== "") parts.push(`# ${[of, "→", tf].filter((x) => x !== "").join(" ")}`);
    out.push(parts.join(" "));
  }
  out.push("");

  if (section.notes !== undefined && section.notes.trim() !== "") {
    out.push("## Notes", "", section.notes.trim(), "");
  }
  return out.join("\n");
}
