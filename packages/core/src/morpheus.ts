import { parseTags } from "./morph-tags.ts";
import type { Lang, Morphology } from "./types.ts";

export interface MorphAnalysis {
  lemma: string;
  morph: Morphology;
  /** Morpheus dialect/notes, informational only. */
  note?: string;
}

const POFS: Record<string, string[]> = {
  noun: ["noun"],
  verb: ["verb"],
  "verb participle": ["verb", "ptcp"],
  adjective: ["adj"],
  adverb: ["adv"],
  adverbial: ["adv"],
  pronoun: ["pron"],
  article: ["art"],
  preposition: ["prep"],
  conjunction: ["conj"],
  particle: ["part"],
  exclamation: ["interj"],
  interjection: ["interj"],
  numeral: ["num"],
  irregular: [],
};
const CASE: Record<string, string> = {
  nominative: "nom",
  genitive: "gen",
  dative: "dat",
  accusative: "acc",
  ablative: "abl",
  vocative: "voc",
  locative: "loc",
};
const NUM: Record<string, string> = { singular: "sg", dual: "du", plural: "pl" };
const GEND: Record<string, string> = { masculine: "m", feminine: "f", neuter: "n" };
const TENSE: Record<string, string> = {
  present: "pres",
  imperfect: "impf",
  future: "fut",
  aorist: "aor",
  perfect: "pf",
  pluperfect: "plpf",
  "future perfect": "futpf",
};
const MOOD: Record<string, string> = {
  indicative: "ind",
  subjunctive: "subj",
  optative: "opt",
  imperative: "imp",
  infinitive: "inf",
  participle: "ptcp",
  gerund: "ger",
  gerundive: "gdv",
  supine: "supine",
};
const VOICE: Record<string, string> = {
  active: "act",
  middle: "mid",
  passive: "pass",
  mediopassive: "mp",
  "middle passive": "mp",
  "medio-passive": "mp",
  deponent: "dep",
};
const PERS: Record<string, string> = { "1st": "1", "2nd": "2", "3rd": "3" };
const COMP: Record<string, string> = { comparative: "comp", superlative: "superl" };

type J = Record<string, unknown>;
const val = (x: unknown): string | undefined => {
  if (x && typeof x === "object" && "$" in (x as J)) return String((x as J).$);
  return typeof x === "string" ? x : undefined;
};
const arr = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** Normalise a Morpheus (BSP / Alpheios) JSON response into our tag set. Unknown values are ignored. */
export function normalizeMorpheus(json: unknown): MorphAnalysis[] {
  const out: MorphAnalysis[] = [];
  const bodies = arr((((json as J)?.RDF as J)?.Annotation as J)?.Body as J | J[]);
  for (const body of bodies) {
    const entry = ((body.rest as J)?.entry ?? {}) as J;
    const dict = (entry.dict ?? {}) as J;
    const lemma = val(dict.hdwd) ?? "";
    const dictPofs = val(dict.pofs) ?? "";
    for (const infl of arr(entry.infl as J | J[])) {
      const tags: string[] = [];
      const pofs = val(infl.pofs) ?? dictPofs;
      tags.push(...(POFS[pofs] ?? []));
      const push = (map: Record<string, string>, v: string | undefined) => {
        if (v && map[v]) tags.push(map[v]!);
      };
      push(CASE, val(infl.case));
      push(NUM, val(infl.num));
      push(GEND, val(infl.gend) ?? val(dict.gend));
      push(TENSE, val(infl.tense));
      push(MOOD, val(infl.mood));
      push(VOICE, val(infl.voice));
      push(PERS, val(infl.pers));
      push(COMP, val(infl.comp) ?? val(dict.comp));
      const { morph } = parseTags(tags);
      const note = val(infl.dial);
      const analysis: MorphAnalysis = { lemma: lemma.replace(/\d+$/, ""), morph };
      if (note) analysis.note = note;
      out.push(analysis);
    }
  }
  // De-duplicate identical analyses (Morpheus repeats across dialects).
  const seen = new Set<string>();
  return out.filter((a) => {
    const key = `${a.lemma}|${JSON.stringify(a.morph)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const DEFAULT_MORPH_BASE_URL = "https://services.perseids.org/bsp/morphologyservice";

export function morpheusUrl(baseUrl: string, lang: Lang, form: string): string {
  const engine = lang === "grc" ? "morpheusgrc" : "morpheuslat";
  return `${baseUrl.replace(/\/$/, "")}/analysis/word?lang=${lang}&engine=${engine}&word=${encodeURIComponent(form)}`;
}

/** Forms to try, in order: as-is, with ASCII apostrophe, without the elision mark, lower-cased. */
export function lookupVariants(form: string): string[] {
  const v = new Set<string>([form]);
  v.add(form.replace(/[’ʼ᾽᾿]/g, "'"));
  v.add(form.replace(/[’ʼ᾽᾿']$/, ""));
  v.add(form.toLowerCase());
  return [...v];
}

export async function lookupMorpheus(
  baseUrl: string,
  lang: Lang,
  form: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MorphAnalysis[]> {
  for (const variant of lookupVariants(form)) {
    const res = await fetchImpl(morpheusUrl(baseUrl, lang, variant), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Morpheus returned ${res.status} for ${variant}`);
    const analyses = normalizeMorpheus(await res.json());
    if (analyses.length > 0) return analyses;
  }
  return [];
}
