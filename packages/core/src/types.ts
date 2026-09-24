/** Language of an original text. */
export type Lang = "grc" | "lat";
/** Layout form of the original: numbered verse lines or numbered prose subsections. */
export type TextForm = "verse" | "prose";
export type SectionStatus = "draft" | "aligned" | "published";

export type Pos =
  | "noun"
  | "verb"
  | "adj"
  | "adv"
  | "pron"
  | "art"
  | "prep"
  | "conj"
  | "part"
  | "interj"
  | "num";
export type Case = "nom" | "gen" | "dat" | "acc" | "abl" | "voc" | "loc";
export type Number_ = "sg" | "du" | "pl";
export type Gender = "m" | "f" | "n";
export type Tense = "pres" | "impf" | "fut" | "aor" | "pf" | "plpf" | "futpf";
export type Mood = "ind" | "subj" | "opt" | "imp" | "inf" | "ptcp" | "ger" | "gdv" | "supine";
export type Voice = "act" | "mid" | "pass" | "mp" | "dep";
export type Person = "1" | "2" | "3";
export type Degree = "comp" | "superl";

export interface Morphology {
  pos?: Pos;
  person?: Person;
  number?: Number_;
  tense?: Tense;
  mood?: Mood;
  voice?: Voice;
  gender?: Gender;
  case?: Case;
  degree?: Degree;
}

/** Reader-facing colour label of an alignment group. */
export type GroupLabel = "nom" | "gen" | "dat" | "acc" | "abl" | "voc" | "adv" | "verb" | "other";

export interface SourceInfo {
  edition: string;
  license: string;
  retrieved?: string | undefined;
  url?: string | undefined;
}

export interface SectionMeta {
  sofia: 1;
  title: string;
  lang: Lang;
  form: TextForm;
  urn?: string;
  /** First and last unit number covered by this section (verse line or prose subsection). */
  lines: [string, string];
  source?: SourceInfo;
  status: SectionStatus;
  /** Monotonic id counters for translation tokens (t) and groups (g). Never reused. */
  nextId: { t: number; g: number };
}

/** One numbered unit of the original: a verse line or a prose subsection. */
export interface Unit {
  n: string;
  /** Set when a speaker change precedes this unit. */
  speaker?: string;
  text: string;
}

/** One paragraph of the translation. `text` may contain "\n" soft breaks. */
export interface Paragraph {
  speaker?: string;
  text: string;
}

/** A word of the original. Id is positional: `${unit}.${index}` (1-based within the unit). */
export interface Token {
  id: string;
  unit: string;
  index: number;
  form: string;
  /** Offsets into the unit text. Gaps between tokens are punctuation/whitespace. */
  start: number;
  end: number;
  lemma?: string;
  morph: Morphology;
  /** false = machine- or legacy-supplied analysis not yet confirmed by the translator. */
  verified: boolean;
}

/** A word of the translation. Id is opaque and monotonic: `t${n}`. */
export interface TrlToken {
  id: string;
  paragraph: number;
  form: string;
  start: number;
  end: number;
}

export interface AlignmentGroup {
  id: string;
  label: GroupLabel;
  original: string[];
  translation: string[];
  note?: string;
}

export interface Section {
  meta: SectionMeta;
  original: Unit[];
  translation: Paragraph[];
  tokens: Token[];
  translationTokens: TrlToken[];
  groups: AlignmentGroup[];
  notes?: string;
}

export interface Author {
  name: string;
  nameOriginal?: string | undefined;
  dates?: string | undefined;
  blurb?: string | undefined;
  order?: number | undefined;
}

export interface Work {
  title: string;
  titleOriginal?: string | undefined;
  lang: Lang;
  urnBase?: string | undefined;
  source?: SourceInfo | undefined;
  description?: string | undefined;
  order?: number | undefined;
}

export interface Chapter {
  title: string;
  range?: [string, string] | undefined;
  order?: number | undefined;
}
