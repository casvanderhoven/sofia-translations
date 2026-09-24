import { parseSection } from "./parse.ts";
import { serializeSection } from "./serialize.ts";
import type { Section, SectionMeta, Unit } from "./types.ts";

export interface CreateSectionInput {
  meta: Omit<SectionMeta, "sofia" | "nextId" | "status" | "lines"> & {
    status?: SectionMeta["status"];
    lines?: SectionMeta["lines"];
  };
  units: Unit[];
  translation?: string;
}

/** Build a fresh Section from imported units. Tokens get ids; no analysis, no groups. */
export function createSection(input: CreateSectionInput): Section {
  const first = input.units[0]?.n ?? "1";
  const last = input.units[input.units.length - 1]?.n ?? first;
  const meta: SectionMeta = {
    sofia: 1,
    title: input.meta.title,
    lang: input.meta.lang,
    form: input.meta.form,
    lines: input.meta.lines ?? [first, last],
    status: input.meta.status ?? "draft",
    nextId: { t: 1, g: 1 },
  };
  if (input.meta.urn !== undefined) meta.urn = input.meta.urn;
  if (input.meta.source !== undefined) meta.source = input.meta.source;
  const skeleton: Section = {
    meta,
    original: input.units,
    translation: input.translation ? [{ text: input.translation }] : [],
    tokens: [],
    translationTokens: [],
    groups: [],
  };
  // Round-trip through the text format so tokens/ids come from the one code path.
  return parseSection(serializeSection(skeleton)).section;
}
