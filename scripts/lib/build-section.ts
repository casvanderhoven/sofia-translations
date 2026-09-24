import {
  type AlignmentGroup,
  createSection,
  type Lang,
  type Section,
  type SourceInfo,
  type TextForm,
  type Token,
} from "@sofia/core";
import { type LegacyUnit, legacyLabelInfo } from "./legacy.ts";

export interface BuildInput {
  title: string;
  lang: Lang;
  form: TextForm;
  urn?: string;
  source?: SourceInfo;
  units: LegacyUnit[];
}

/**
 * Turn legacy units (text + character-range spans) into a Section:
 * tokens come from the core tokenizer; each token inherits the span covering its start offset;
 * spans sharing a key within the section become one (possibly discontinuous) group.
 * All analyses are marked unverified. Translation side is left empty.
 */
export function buildSectionFromLegacy(input: BuildInput): Section {
  const meta: Parameters<typeof createSection>[0]["meta"] = {
    title: input.title,
    lang: input.lang,
    form: input.form,
  };
  if (input.urn !== undefined) meta.urn = input.urn;
  if (input.source !== undefined) meta.source = input.source;
  const section = createSection({
    meta,
    units: input.units.map((u) => {
      const unit: { n: string; text: string; speaker?: string } = { n: u.n, text: u.text };
      if (u.speaker !== undefined) unit.speaker = u.speaker;
      return unit;
    }),
  });
  const byUnit = new Map(input.units.map((u) => [u.n, u]));
  const groupsByKey = new Map<string, { label: string; tokens: Token[] }>();
  for (const tok of section.tokens) {
    const unit = byUnit.get(tok.unit);
    if (!unit) continue;
    const span = unit.spans.find((s) => tok.start >= s.start && tok.start < s.end);
    if (!span) continue;
    const info = legacyLabelInfo(span.label);
    tok.morph = { ...info.morph };
    tok.verified = false;
    const entry = groupsByKey.get(span.key) ?? { label: span.label, tokens: [] };
    entry.tokens.push(tok);
    groupsByKey.set(span.key, entry);
  }
  const groups: AlignmentGroup[] = [];
  let g = 1;
  for (const entry of groupsByKey.values()) {
    groups.push({
      id: `g${g++}`,
      label: legacyLabelInfo(entry.label).label,
      original: entry.tokens.map((t) => t.id),
      translation: [],
    });
  }
  section.groups = groups;
  section.meta.nextId.g = g;
  return section;
}
