import type { GroupLabel, Morphology } from "./types.ts";

export const POS = [
  "noun",
  "verb",
  "adj",
  "adv",
  "pron",
  "art",
  "prep",
  "conj",
  "part",
  "interj",
  "num",
] as const;
export const CASES = ["nom", "gen", "dat", "acc", "abl", "voc", "loc"] as const;
export const NUMBERS = ["sg", "du", "pl"] as const;
export const GENDERS = ["m", "f", "n"] as const;
export const TENSES = ["pres", "impf", "fut", "aor", "pf", "plpf", "futpf"] as const;
export const MOODS = ["ind", "subj", "opt", "imp", "inf", "ptcp", "ger", "gdv", "supine"] as const;
export const VOICES = ["act", "mid", "pass", "mp", "dep"] as const;
export const PERSONS = ["1", "2", "3"] as const;
export const DEGREES = ["comp", "superl"] as const;

export const GROUP_LABELS = [
  "nom",
  "gen",
  "dat",
  "acc",
  "abl",
  "voc",
  "adv",
  "verb",
  "other",
] as const satisfies readonly GroupLabel[];

/** Canonical serialisation order of morphology fields. */
export const MORPH_ORDER = [
  "pos",
  "person",
  "number",
  "tense",
  "mood",
  "voice",
  "gender",
  "case",
  "degree",
] as const satisfies readonly (keyof Morphology)[];

const CATEGORY_OF: ReadonlyMap<string, keyof Morphology> = new Map<string, keyof Morphology>([
  ...POS.map((v) => [v, "pos"] as const),
  ...CASES.map((v) => [v, "case"] as const),
  ...NUMBERS.map((v) => [v, "number"] as const),
  ...GENDERS.map((v) => [v, "gender"] as const),
  ...TENSES.map((v) => [v, "tense"] as const),
  ...MOODS.map((v) => [v, "mood"] as const),
  ...VOICES.map((v) => [v, "voice"] as const),
  ...PERSONS.map((v) => [v, "person"] as const),
  ...DEGREES.map((v) => [v, "degree"] as const),
]);

export const ALL_TAGS: ReadonlySet<string> = new Set(CATEGORY_OF.keys());

export interface ParsedTags {
  morph: Morphology;
  unknown: string[];
  /** Tags that set a category already set by an earlier tag on the same token. */
  conflicts: string[];
}

/** Parse a list of tags (any order) into a Morphology. */
export function parseTags(tags: readonly string[]): ParsedTags {
  const morph: Record<string, string> = {};
  const unknown: string[] = [];
  const conflicts: string[] = [];
  for (const tag of tags) {
    if (tag === "") continue;
    const cat = CATEGORY_OF.get(tag);
    if (!cat) {
      unknown.push(tag);
      continue;
    }
    if (morph[cat] !== undefined && morph[cat] !== tag) {
      conflicts.push(tag);
      continue;
    }
    morph[cat] = tag;
  }
  return { morph: morph as Morphology, unknown, conflicts };
}

/** Serialise a Morphology into canonical tag order. */
export function formatTags(morph: Morphology): string[] {
  const out: string[] = [];
  for (const key of MORPH_ORDER) {
    const v = morph[key];
    if (v !== undefined) out.push(v);
  }
  return out;
}

export function hasMorph(morph: Morphology): boolean {
  return MORPH_ORDER.some((k) => morph[k] !== undefined);
}

const LONG: Record<string, string> = {
  noun: "noun",
  verb: "verb",
  adj: "adjective",
  adv: "adverb",
  pron: "pronoun",
  art: "article",
  prep: "preposition",
  conj: "conjunction",
  part: "particle",
  interj: "interjection",
  num: "numeral",
  nom: "nominative",
  gen: "genitive",
  dat: "dative",
  acc: "accusative",
  abl: "ablative",
  voc: "vocative",
  loc: "locative",
  sg: "singular",
  du: "dual",
  pl: "plural",
  m: "masculine",
  f: "feminine",
  n: "neuter",
  pres: "present",
  impf: "imperfect",
  fut: "future",
  aor: "aorist",
  pf: "perfect",
  plpf: "pluperfect",
  futpf: "future perfect",
  ind: "indicative",
  subj: "subjunctive",
  opt: "optative",
  imp: "imperative",
  inf: "infinitive",
  ptcp: "participle",
  ger: "gerund",
  gdv: "gerundive",
  supine: "supine",
  act: "active",
  mid: "middle",
  pass: "passive",
  mp: "middle/passive",
  dep: "deponent",
  "1": "1st person",
  "2": "2nd person",
  "3": "3rd person",
  comp: "comparative",
  superl: "superlative",
};

function compact(xs: readonly (string | undefined)[]): string[] {
  return xs.filter((x): x is string => x !== undefined);
}

export function expandTag(tag: string): string {
  return LONG[tag] ?? tag;
}

/**
 * Human-readable analysis, e.g. "aorist participle, active, nominative singular masculine".
 * Verbs: tense mood, voice, person number | nominal: case number gender.
 */
export function describeMorph(morph: Morphology): string {
  if (!hasMorph(morph)) return "";
  const parts: string[] = [];
  const nominal = compact([morph.case, morph.number, morph.gender]).map(expandTag);
  if (morph.pos === "verb") {
    const head = compact([morph.tense, morph.mood]).map(expandTag).join(" ");
    if (head) parts.push(head);
    if (morph.voice) parts.push(expandTag(morph.voice));
    if (morph.person || (morph.number && !morph.case)) {
      parts.push(compact([morph.person, morph.number]).map(expandTag).join(" "));
    }
    if (morph.case) parts.push(nominal.join(" "));
  } else {
    if (morph.pos) parts.push(expandTag(morph.pos));
    if (nominal.length) parts.push(nominal.join(" "));
    if (morph.degree) parts.push(expandTag(morph.degree));
    if (morph.tense || morph.mood || morph.voice) {
      parts.push(compact([morph.tense, morph.mood, morph.voice]).map(expandTag).join(" "));
    }
  }
  return parts.filter((p) => p.length > 0).join(", ");
}

/** Default reader label for a group, from the morphology of its head token. */
export function suggestLabel(morph: Morphology): GroupLabel {
  if (morph.pos === "verb" && morph.mood !== "ptcp") return "verb";
  if (morph.case) {
    return morph.case === "loc" ? "other" : morph.case;
  }
  if (morph.pos === "verb") return "verb";
  if (
    morph.pos === "adv" ||
    morph.pos === "prep" ||
    morph.pos === "conj" ||
    morph.pos === "part" ||
    morph.pos === "interj"
  ) {
    return "adv";
  }
  return "other";
}

export function isGroupLabel(s: string): s is GroupLabel {
  return (GROUP_LABELS as readonly string[]).includes(s);
}
