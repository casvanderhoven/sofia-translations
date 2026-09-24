import YAML from "yaml";
import { lcsAlign } from "./diff.ts";
import { hasMorph, isGroupLabel, parseTags } from "./morph-tags.ts";
import { FrontmatterSchema, frontmatterToMeta, GROUP_ID, ORIGINAL_ID, TRL_ID } from "./schema.ts";
import { tokenizeOptionsFor, tokenizeText } from "./tokenize.ts";
import type {
  AlignmentGroup,
  Lang,
  Morphology,
  Paragraph,
  Section,
  SectionMeta,
  Token,
  TrlToken,
  Unit,
} from "./types.ts";

export class SectionParseError extends Error {
  readonly line: number | undefined;
  constructor(message: string, line?: number) {
    super(line !== undefined ? `line ${line}: ${message}` : message);
    this.name = "SectionParseError";
    this.line = line;
  }
}

export interface ParseResult {
  section: Section;
  /** Non-fatal reconciliation notes (dropped/renumbered tokens). */
  warnings: string[];
}

const HEADINGS = [
  "Original",
  "Translation",
  "Tokens",
  "Translation tokens",
  "Groups",
  "Notes",
] as const;
type Heading = (typeof HEADINGS)[number];

const UNIT_LINE = /^([0-9]+[a-z]?)(?:\s+(.*))?$/;
const SPEAKER_LINE = /^@\s*(.+?)\s*$/;
const TOKEN_ROW = /^(~?)(\S+)\s+(\S+)(?:\s+(\S+)(?:\s+(.*))?)?$/;
const TRL_ROW = /^(t[0-9]+)\s+(\S+)\s*$/;
const GROUP_ROW = /^(g[0-9]+)\s+(\S+)\s+([^|"#]*)\|([^"#]*)(?:"((?:[^"\\]|\\.)*)"\s*)?(?:#.*)?$/;

interface Line {
  no: number;
  text: string;
}

interface TokenRow {
  no: number;
  id: string;
  form: string;
  lemma: string | undefined;
  morph: Morphology;
  verified: boolean;
}

interface TrlRow {
  no: number;
  id: string;
  form: string;
}

export function splitFrontmatter(raw: string): {
  yaml: string;
  body: string;
  bodyStartLine: number;
} {
  if (!raw.startsWith("---\n"))
    throw new SectionParseError("file must start with a --- frontmatter block", 1);
  const end = raw.indexOf("\n---\n", 4);
  if (end < 0) throw new SectionParseError("unterminated frontmatter block", 1);
  const yaml = raw.slice(4, end + 1);
  const body = raw.slice(end + 5);
  const bodyStartLine = yaml.split("\n").length + 2;
  return { yaml, body, bodyStartLine };
}

function splitBlocks(body: string, startLine: number): Map<Heading, Line[]> {
  const blocks = new Map<Heading, Line[]>();
  let current: Line[] | undefined;
  const lines = body.split("\n");
  for (let k = 0; k < lines.length; k++) {
    const text = lines[k]!;
    const no = startLine + k;
    const h = /^##\s+(.+?)\s*$/.exec(text);
    if (h) {
      const name = h[1] as Heading;
      if (!HEADINGS.includes(name)) throw new SectionParseError(`unknown block "## ${h[1]}"`, no);
      if (blocks.has(name)) throw new SectionParseError(`duplicate block "## ${name}"`, no);
      current = [];
      blocks.set(name, current);
      continue;
    }
    if (!current) {
      if (text.trim() !== "") throw new SectionParseError("text before the first ## block", no);
      continue;
    }
    current.push({ no, text });
  }
  return blocks;
}

export function parseOriginalBlock(lines: Line[]): { units: Unit[]; warnings: string[] } {
  const units: Unit[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let speaker: string | undefined;
  for (const { no, text } of lines) {
    const t = text.trim();
    if (t === "") continue;
    const sp = SPEAKER_LINE.exec(t);
    if (sp) {
      speaker = sp[1];
      continue;
    }
    const u = UNIT_LINE.exec(t);
    if (u) {
      const n = u[1]!;
      if (seen.has(n)) throw new SectionParseError(`duplicate unit number ${n}`, no);
      seen.add(n);
      const unit: Unit = { n, text: (u[2] ?? "").trim() };
      if (speaker !== undefined) unit.speaker = speaker;
      units.push(unit);
      speaker = undefined;
      continue;
    }
    const last = units[units.length - 1];
    if (!last) throw new SectionParseError("original text must start with a numbered unit", no);
    last.text = last.text === "" ? t : `${last.text} ${t}`;
  }
  if (speaker !== undefined)
    warnings.push(`speaker "${speaker}" at end of Original has no unit; dropped`);
  return { units, warnings };
}

export function parseTranslationBlock(lines: Line[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | undefined;
  let pendingSpeaker: string | undefined;
  for (const { text } of lines) {
    const t = text.trim();
    if (t === "") {
      current = undefined;
      continue;
    }
    const sp = SPEAKER_LINE.exec(t);
    if (sp) {
      current = undefined;
      pendingSpeaker = sp[1];
      continue;
    }
    if (!current) {
      current = { text: t };
      if (pendingSpeaker !== undefined) current.speaker = pendingSpeaker;
      pendingSpeaker = undefined;
      paragraphs.push(current);
    } else {
      current.text = `${current.text}\n${t}`;
    }
  }
  return paragraphs;
}

function parseTokenRows(lines: Line[]): TokenRow[] {
  const rows: TokenRow[] = [];
  const ids = new Set<string>();
  for (const { no, text } of lines) {
    const t = text.trim();
    if (t === "") continue;
    const m = TOKEN_ROW.exec(t);
    if (!m) throw new SectionParseError(`cannot parse token row "${t}"`, no);
    const [, tilde, id, form, lemmaRaw, tagsRaw] = m;
    if (!ORIGINAL_ID.test(id!)) throw new SectionParseError(`bad original token id "${id}"`, no);
    if (ids.has(id!)) throw new SectionParseError(`duplicate token id ${id}`, no);
    ids.add(id!);
    const { morph, unknown, conflicts } = parseTags((tagsRaw ?? "").split(/\s+/).filter(Boolean));
    if (unknown.length)
      throw new SectionParseError(`unknown tag(s) ${unknown.join(", ")} on ${id}`, no);
    if (conflicts.length)
      throw new SectionParseError(`conflicting tag(s) ${conflicts.join(", ")} on ${id}`, no);
    rows.push({
      no,
      id: id!,
      form: form!,
      lemma: lemmaRaw === undefined || lemmaRaw === "-" ? undefined : lemmaRaw,
      morph,
      // A row without any analysis is "unanalysed", never "verified".
      verified: tilde !== "~" && ((lemmaRaw !== undefined && lemmaRaw !== "-") || hasMorph(morph)),
    });
  }
  return rows;
}

function parseTrlRows(lines: Line[]): TrlRow[] {
  const rows: TrlRow[] = [];
  const ids = new Set<string>();
  for (const { no, text } of lines) {
    const t = text.trim();
    if (t === "") continue;
    const m = TRL_ROW.exec(t);
    if (!m) throw new SectionParseError(`cannot parse translation token row "${t}"`, no);
    if (ids.has(m[1]!)) throw new SectionParseError(`duplicate translation token id ${m[1]}`, no);
    ids.add(m[1]!);
    rows.push({ no, id: m[1]!, form: m[2]! });
  }
  return rows;
}

function unescapeNote(s: string): string {
  return s.replace(/\\(["\\])/g, "$1");
}

interface GroupRow {
  no: number;
  group: AlignmentGroup;
}

function parseGroupRows(lines: Line[]): GroupRow[] {
  const rows: GroupRow[] = [];
  const ids = new Set<string>();
  for (const { no, text } of lines) {
    const t = text.trim();
    if (t === "") continue;
    const m = GROUP_ROW.exec(t);
    if (!m) throw new SectionParseError(`cannot parse group row "${t}"`, no);
    const [, id, label, origRaw, trlRaw, noteRaw] = m;
    if (!GROUP_ID.test(id!)) throw new SectionParseError(`bad group id "${id}"`, no);
    if (ids.has(id!)) throw new SectionParseError(`duplicate group id ${id}`, no);
    ids.add(id!);
    if (!isGroupLabel(label!))
      throw new SectionParseError(`unknown group label "${label}" on ${id}`, no);
    const original = origRaw!.split(/\s+/).filter(Boolean);
    const translation = trlRaw!.split(/\s+/).filter(Boolean);
    for (const o of original)
      if (!ORIGINAL_ID.test(o)) throw new SectionParseError(`bad original id "${o}" in ${id}`, no);
    for (const x of translation)
      if (!TRL_ID.test(x)) throw new SectionParseError(`bad translation id "${x}" in ${id}`, no);
    const group: AlignmentGroup = { id: id!, label, original, translation };
    if (noteRaw !== undefined && noteRaw !== "") group.note = unescapeNote(noteRaw);
    rows.push({ no, group });
  }
  return rows;
}

/** Tokenise units into positional original tokens (no analysis attached). */
export function tokenizeUnits(units: readonly Unit[], lang: Lang): Token[] {
  const opts = tokenizeOptionsFor(lang);
  const out: Token[] = [];
  for (const unit of units) {
    const raw = tokenizeText(unit.text, opts);
    raw.forEach((r, k) => {
      out.push({
        id: `${unit.n}.${k + 1}`,
        unit: unit.n,
        index: k + 1,
        form: r.form,
        start: r.start,
        end: r.end,
        morph: {},
        verified: false,
      });
    });
  }
  return out;
}

/** Tokenise translation paragraphs. Ids are assigned by reconciliation. */
export function tokenizeParagraphs(paragraphs: readonly Paragraph[]): Omit<TrlToken, "id">[] {
  const opts = tokenizeOptionsFor("en");
  const out: Omit<TrlToken, "id">[] = [];
  paragraphs.forEach((p, pi) => {
    for (const r of tokenizeText(p.text, opts)) {
      out.push({ paragraph: pi, form: r.form, start: r.start, end: r.end });
    }
  });
  return out;
}

interface OrigReconcile {
  tokens: Token[];
  /** stored row id -> current token id (only for rows that survived) */
  idMap: Map<string, string>;
  storedIds: Set<string>;
  warnings: string[];
}

function reconcileOriginal(fresh: Token[], rows: TokenRow[]): OrigReconcile {
  const idMap = new Map<string, string>();
  const storedIds = new Set(rows.map((r) => r.id));
  const warnings: string[] = [];
  if (rows.length === 0) return { tokens: fresh, idMap, storedIds, warnings };
  const pairs = lcsAlign(
    rows.map((r) => r.form),
    fresh.map((t) => t.form),
  );
  const matchedRows = new Set<number>();
  let renumbered = 0;
  for (const [ri, fi] of pairs) {
    const row = rows[ri]!;
    const tok = fresh[fi]!;
    matchedRows.add(ri);
    if (row.lemma !== undefined) tok.lemma = row.lemma;
    tok.morph = row.morph;
    tok.verified = row.verified;
    idMap.set(row.id, tok.id);
    if (row.id !== tok.id) renumbered++;
  }
  rows.forEach((row, ri) => {
    if (!matchedRows.has(ri))
      warnings.push(
        `original token ${row.id} "${row.form}" is no longer in the text; its analysis was dropped`,
      );
  });
  if (renumbered > 0)
    warnings.push(`${renumbered} original token(s) renumbered after a change to the original text`);
  return { tokens: fresh, idMap, storedIds, warnings };
}

interface TrlReconcile {
  tokens: TrlToken[];
  keptIds: Set<string>;
  warnings: string[];
}

function reconcileTranslation(
  fresh: Omit<TrlToken, "id">[],
  rows: TrlRow[],
  nextId: { t: number; g: number },
): TrlReconcile {
  const warnings: string[] = [];
  const ids: (string | undefined)[] = new Array(fresh.length).fill(undefined);
  const keptIds = new Set<string>();
  if (rows.length > 0) {
    const pairs = lcsAlign(
      rows.map((r) => r.form),
      fresh.map((t) => t.form),
    );
    const matchedRows = new Set<number>();
    for (const [ri, fi] of pairs) {
      ids[fi] = rows[ri]!.id;
      keptIds.add(rows[ri]!.id);
      matchedRows.add(ri);
    }
    const dropped = rows.filter((_, ri) => !matchedRows.has(ri));
    if (dropped.length > 0) {
      warnings.push(
        `${dropped.length} translation token(s) no longer in the text: ${dropped.map((r) => `${r.id} "${r.form}"`).join(", ")}`,
      );
    }
    let max = 0;
    for (const r of rows) max = Math.max(max, Number(r.id.slice(1)));
    if (nextId.t <= max) nextId.t = max + 1;
  }
  let added = 0;
  const tokens: TrlToken[] = fresh.map((t, k) => {
    let id = ids[k];
    if (id === undefined) {
      id = `t${nextId.t++}`;
      added++;
    }
    return { id, ...t };
  });
  if (rows.length > 0 && added > 0) warnings.push(`${added} new translation token(s) received ids`);
  return { tokens, keptIds, warnings };
}

export function parseSection(rawInput: string): ParseResult {
  const raw = rawInput.normalize("NFC").replace(/\r\n?/g, "\n");
  const { yaml, body, bodyStartLine } = splitFrontmatter(raw);
  let fmData: unknown;
  try {
    fmData = YAML.parse(yaml);
  } catch (e) {
    throw new SectionParseError(`invalid frontmatter YAML: ${(e as Error).message}`, 1);
  }
  const fm = FrontmatterSchema.safeParse(fmData);
  if (!fm.success) {
    const first = fm.error.issues[0];
    throw new SectionParseError(
      `frontmatter: ${first ? `${first.path.join(".")} ${first.message}` : "invalid"}`,
      1,
    );
  }
  const meta: SectionMeta = frontmatterToMeta(fm.data);
  const blocks = splitBlocks(body, bodyStartLine);
  const warnings: string[] = [];

  const orig = parseOriginalBlock(blocks.get("Original") ?? []);
  warnings.push(...orig.warnings);
  const translation = parseTranslationBlock(blocks.get("Translation") ?? []);
  const tokenRows = parseTokenRows(blocks.get("Tokens") ?? []);
  const trlRows = parseTrlRows(blocks.get("Translation tokens") ?? []);
  const groupRows = parseGroupRows(blocks.get("Groups") ?? []);
  const notesLines = blocks.get("Notes") ?? [];
  const notes = notesLines
    .map((l) => l.text)
    .join("\n")
    .trim();

  const origRec = reconcileOriginal(tokenizeUnits(orig.units, meta.lang), tokenRows);
  warnings.push(...origRec.warnings);
  const trlRec = reconcileTranslation(tokenizeParagraphs(translation), trlRows, meta.nextId);
  warnings.push(...trlRec.warnings);

  const freshIds = new Set(origRec.tokens.map((t) => t.id));
  const groups: AlignmentGroup[] = [];
  let maxG = 0;
  for (const { group } of groupRows) {
    maxG = Math.max(maxG, Number(group.id.slice(1)));
    const original: string[] = [];
    for (const id of group.original) {
      const mapped =
        origRec.idMap.get(id) ??
        (origRec.storedIds.has(id) ? undefined : freshIds.has(id) ? id : undefined);
      if (mapped === undefined) {
        warnings.push(
          `group ${group.id}: original token ${id} no longer exists; removed from group`,
        );
      } else {
        original.push(mapped);
      }
    }
    const translationIds: string[] = [];
    for (const id of group.translation) {
      if (trlRec.keptIds.has(id)) translationIds.push(id);
      else
        warnings.push(
          `group ${group.id}: translation token ${id} no longer exists; removed from group`,
        );
    }
    if (
      original.length === 0 &&
      translationIds.length === 0 &&
      (group.original.length > 0 || group.translation.length > 0)
    ) {
      warnings.push(`group ${group.id} lost all its tokens; dropped`);
      continue;
    }
    const g: AlignmentGroup = {
      id: group.id,
      label: group.label,
      original,
      translation: translationIds,
    };
    if (group.note !== undefined) g.note = group.note;
    groups.push(g);
  }
  if (meta.nextId.g <= maxG) meta.nextId.g = maxG + 1;

  const section: Section = {
    meta,
    original: orig.units,
    translation,
    tokens: origRec.tokens,
    translationTokens: trlRec.tokens,
    groups,
  };
  if (notes !== "") section.notes = notes;
  return { section, warnings };
}
