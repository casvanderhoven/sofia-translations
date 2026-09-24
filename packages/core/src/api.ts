/** Shared request/response shapes for the local editor API. */
import type { MorphAnalysis } from "./morpheus.ts";
import type { ValidationIssue } from "./schema.ts";
import type {
  AlignmentGroup,
  Lang,
  Morphology,
  Section,
  SectionMeta,
  SourceInfo,
  TextForm,
  Unit,
} from "./types.ts";

export interface TreeSection {
  slug: string;
  file: string;
  title: string;
  status: SectionMeta["status"];
  lines: [string, string];
  tokens: number;
  analysed: number;
  verified: number;
  aligned: number;
  hasTranslation: boolean;
  warnings: number;
  errors: number;
}
export interface TreeChapter {
  slug: string;
  dir: string;
  title: string;
  sections: TreeSection[];
}
export interface TreeWork {
  slug: string;
  dir: string;
  title: string;
  lang: Lang;
  urnBase?: string;
  chapters: TreeChapter[];
}
export interface TreeAuthor {
  slug: string;
  name: string;
  works: TreeWork[];
}
export interface TreeResponse {
  authors: TreeAuthor[];
}

export interface SectionResponse {
  file: string;
  doc: Section;
  raw: string;
  etag: string;
  warnings: string[];
  issues: ValidationIssue[];
}

export interface SaveSectionRequest {
  doc: Section;
  etag: string;
}

export interface CreateSectionRequest {
  chapterDir: string;
  fileName: string;
  title: string;
  lang: Lang;
  form: TextForm;
  urn?: string;
  units: Unit[];
}

export interface ImportCtsRequest {
  urn: string;
}
export interface ImportCtsResponse {
  urn: string;
  lang: Lang;
  form: TextForm;
  units: Unit[];
  source: SourceInfo;
}

export interface MorphBatchRequest {
  lang: Lang;
  forms: string[];
}
export type MorphBatchResponse = Record<string, MorphAnalysis[]>;

export interface SuggestMorphologyRequest {
  doc: Section;
  /** Only suggest for these token ids; default all unverified/unanalysed. */
  tokenIds?: string[];
}
export interface MorphSuggestion {
  id: string;
  lemma?: string;
  morph: Morphology;
  confidence: number;
  candidates: MorphAnalysis[];
}
export interface SuggestMorphologyResponse {
  suggestions: MorphSuggestion[];
  model: string;
}

export interface SuggestAlignmentRequest {
  doc: Section;
  lockedGroupIds?: string[];
}
export interface AlignmentSuggestion extends Omit<AlignmentGroup, "id"> {
  confidence: number;
}
export interface SuggestAlignmentResponse {
  groups: AlignmentSuggestion[];
  model: string;
}

export interface ConfigResponse {
  model: string;
  hasApiKey: boolean;
  morphBaseUrl: string;
  astroUrl: string;
  contentRoot: string;
}
