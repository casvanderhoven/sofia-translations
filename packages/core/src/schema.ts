import { z } from "zod";
import { GROUP_LABELS, hasMorph } from "./morph-tags.ts";
import type { Section, SectionMeta } from "./types.ts";

const unitNumber = z.union([z.string(), z.number()]).transform((v) => String(v));

export const SourceSchema = z.object({
  edition: z.string(),
  license: z.string(),
  retrieved: z
    .union([z.string(), z.date()])
    .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))
    .optional(),
  url: z.string().optional(),
});

export const FrontmatterSchema = z.object({
  sofia: z.literal(1),
  title: z.string().min(1),
  lang: z.enum(["grc", "lat"]),
  form: z.enum(["verse", "prose"]),
  urn: z.string().optional(),
  lines: z.tuple([unitNumber, unitNumber]),
  source: SourceSchema.optional(),
  status: z.enum(["draft", "aligned", "published"]).default("draft"),
  next_id: z
    .object({ t: z.number().int().min(1), g: z.number().int().min(1) })
    .default({ t: 1, g: 1 }),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

export function frontmatterToMeta(fm: Frontmatter): SectionMeta {
  const meta: SectionMeta = {
    sofia: 1,
    title: fm.title,
    lang: fm.lang,
    form: fm.form,
    lines: fm.lines,
    status: fm.status,
    nextId: { t: fm.next_id.t, g: fm.next_id.g },
  };
  if (fm.urn !== undefined) meta.urn = fm.urn;
  if (fm.source !== undefined) {
    meta.source = { edition: fm.source.edition, license: fm.source.license };
    if (fm.source.retrieved !== undefined) meta.source.retrieved = fm.source.retrieved;
    if (fm.source.url !== undefined) meta.source.url = fm.source.url;
  }
  return meta;
}

export const AuthorSchema = z.object({
  name: z.string().min(1),
  nameOriginal: z.string().optional(),
  dates: z.string().optional(),
  blurb: z.string().optional(),
  order: z.number().optional(),
});

export const WorkSchema = z.object({
  title: z.string().min(1),
  titleOriginal: z.string().optional(),
  lang: z.enum(["grc", "lat"]),
  urnBase: z.string().optional(),
  source: SourceSchema.optional(),
  description: z.string().optional(),
  order: z.number().optional(),
});

export const ChapterSchema = z.object({
  title: z.string().min(1),
  range: z.tuple([unitNumber, unitNumber]).optional(),
  order: z.number().optional(),
});

export const ORIGINAL_ID = /^[0-9]+[a-z]?\.[0-9]+$/;
export const TRL_ID = /^t[0-9]+$/;
export const GROUP_ID = /^g[0-9]+$/;

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

/** Referential-integrity checks on a parsed Section. */
export function validateSection(section: Section): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });

  const tokenIds = new Set(section.tokens.map((t) => t.id));
  const trlIds = new Set(section.translationTokens.map((t) => t.id));
  const seenGroup = new Set<string>();
  const usedOrig = new Map<string, string>();
  const usedTrl = new Map<string, string>();
  let maxT = 0;
  let maxG = 0;

  for (const t of section.translationTokens) {
    const n = Number(t.id.slice(1));
    if (n > maxT) maxT = n;
  }
  for (const g of section.groups) {
    if (!GROUP_ID.test(g.id)) err(`group id "${g.id}" is not of the form gN`);
    if (seenGroup.has(g.id)) err(`duplicate group id ${g.id}`);
    seenGroup.add(g.id);
    const n = Number(g.id.slice(1));
    if (n > maxG) maxG = n;
    if (!(GROUP_LABELS as readonly string[]).includes(g.label)) {
      err(`group ${g.id}: unknown label "${g.label}"`);
    }
    if (g.original.length === 0 && g.translation.length === 0) {
      warn(`group ${g.id} is empty`);
    }
    for (const id of g.original) {
      if (!tokenIds.has(id)) err(`group ${g.id}: unknown original token ${id}`);
      const prev = usedOrig.get(id);
      if (prev) err(`original token ${id} is in both ${prev} and ${g.id}`);
      usedOrig.set(id, g.id);
    }
    for (const id of g.translation) {
      if (!trlIds.has(id)) err(`group ${g.id}: unknown translation token ${id}`);
      const prev = usedTrl.get(id);
      if (prev) err(`translation token ${id} is in both ${prev} and ${g.id}`);
      usedTrl.set(id, g.id);
    }
  }
  if (section.meta.nextId.t <= maxT) {
    err(
      `next_id.t (${section.meta.nextId.t}) must exceed the highest translation token id (t${maxT})`,
    );
  }
  if (section.meta.nextId.g <= maxG) {
    err(`next_id.g (${section.meta.nextId.g}) must exceed the highest group id (g${maxG})`);
  }
  if (section.meta.status === "published") {
    const unverified = section.tokens.filter((t) => !t.verified && (t.lemma || hasMorph(t.morph)));
    if (unverified.length > 0) {
      warn(`published section has ${unverified.length} unverified token(s)`);
    }
  }
  return issues;
}
