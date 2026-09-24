/**
 * Parsers for the 2017 legacy markup:
 *  - Elektra.html: Greek lines with <span class="LABEL N">…</span> groups, blank-line stanzas,
 *    <span class="line">N</span> markers every fifth verse, bare speaker names.
 *  - ab-urbe-condita-1-12.html.pm: Pollen ◊og{◊lineog{N} ◊textog{… ◊acc{word} …}} blocks.
 * Output is a language-neutral intermediate: units with per-character group labels.
 */
import type { Case, GroupLabel, Morphology } from "@sofia/core";

export interface LegacySpan {
  label: string;
  key: string; // merge key within a section, e.g. "acc 3"
  start: number;
  end: number;
}

export interface LegacyUnit {
  n: string;
  speaker?: string;
  text: string;
  spans: LegacySpan[];
}

export interface LegacySection {
  units: LegacyUnit[];
}

const LEGACY_LABELS = new Set(["nom", "gen", "dat", "acc", "abl", "voc", "adv", "verb"]);

/** Map a legacy label to reader label + morphology it implies. */
export function legacyLabelInfo(label: string): { label: GroupLabel; morph: Morphology } {
  switch (label) {
    case "nom":
    case "gen":
    case "dat":
    case "acc":
    case "abl":
    case "voc":
      return { label, morph: { case: label as Case } };
    case "verb":
      return { label: "verb", morph: { pos: "verb" } };
    case "adv":
      return { label: "adv", morph: {} };
    default:
      return { label: "other", morph: {} };
  }
}

function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Walk a line of legacy HTML and produce plain text plus span ranges.
 * Tolerates `class=acc 33"` (missing opening quote) and stray whitespace inside spans.
 */
export function stripSpans(html: string): { text: string; spans: LegacySpan[] } {
  const spanRe = /<span\s+class="?\s*([a-z]+)(?:\s+([0-9]+))?\s*"?>([\s\S]*?)<\/span>/g;
  let text = "";
  const spans: LegacySpan[] = [];
  let last = 0;
  for (const m of html.matchAll(spanRe)) {
    text += html.slice(last, m.index);
    const [, label, idx, inner] = m;
    if (label === "line") {
      last = m.index + m[0].length;
      continue;
    }
    const start = text.length;
    text += inner ?? "";
    if (label && LEGACY_LABELS.has(label)) {
      spans.push({ label, key: `${label} ${idx ?? ""}`.trim(), start, end: text.length });
    }
    last = m.index + m[0].length;
  }
  text += html.slice(last);
  return collapseWhitespace(text, spans);
}

/** Collapse runs of whitespace and trim, keeping span offsets consistent. */
function collapseWhitespace(
  text: string,
  spans: LegacySpan[],
): { text: string; spans: LegacySpan[] } {
  const map: number[] = new Array(text.length + 1);
  let out = "";
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      pendingSpace = out.length > 0;
      map[i] = out.length;
      continue;
    }
    if (pendingSpace) {
      out += " ";
      pendingSpace = false;
    }
    map[i] = out.length;
    out += ch;
  }
  map[text.length] = out.length;
  const mapped = spans
    .map((s) => ({ ...s, start: map[s.start]!, end: map[s.end]! }))
    .map((s) => {
      // Trim span edges to non-space characters.
      let { start, end } = s;
      while (start < end && out[start] === " ") start++;
      while (end > start && out[end - 1] === " ") end--;
      return { ...s, start, end };
    })
    .filter((s) => s.end > s.start);
  return { text: out.normalize("NFC"), spans: mapped };
}

export interface ElektraParse {
  speaker: string;
  sections: LegacySection[];
}

/**
 * Parse Elektra.html up to and including verse `maxLine`.
 * Sections are stanzas (blank-line separated). Group keys are scoped to a section.
 */
export function parseElektra(html: string, maxLine = 53): ElektraParse {
  const lines = html.replace(/\r\n?/g, "\n").split("\n");
  const sections: LegacySection[] = [];
  let current: LegacyUnit[] = [];
  let verse = 0;
  let speaker = "";
  let pendingSpeaker: string | undefined;
  const flush = () => {
    if (current.length) sections.push({ units: current });
    current = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flush();
      continue;
    }
    if (
      !line.includes("<span") &&
      /^[\p{L}\p{M}\s]+$/u.test(line) &&
      !/[.,:;·]/.test(line) &&
      line.split(" ").length <= 2
    ) {
      // A bare speaker name (Αὐτουργός, Ἠλέκτρα).
      flush();
      pendingSpeaker = line;
      if (!speaker) speaker = line;
      continue;
    }
    const marker = /<span class="line">([0-9]+)<\/span>/.exec(line);
    if (marker) {
      const n = Number(marker[1]);
      if (verse !== 0 && n !== verse + 1) {
        throw new Error(`verse counter drift: expected ${verse + 1}, marker says ${n}`);
      }
      verse = n;
    } else {
      verse += 1;
    }
    if (verse > maxLine) break;
    const { text, spans } = stripSpans(line);
    const unit: LegacyUnit = { n: String(verse), text, spans };
    if (pendingSpeaker !== undefined) {
      unit.speaker = pendingSpeaker;
      pendingSpeaker = undefined;
    }
    current.push(unit);
  }
  flush();
  return { speaker, sections };
}

/** Minimal Pollen reader: returns the body of every top-level ◊name{…} for the given name. */
export function pollenBlocks(src: string, name: string): string[] {
  const out: string[] = [];
  const needle = `◊${name}`;
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at < 0) break;
    let i = at + needle.length;
    if (src[i] === "[") {
      i = src.indexOf("]", i) + 1;
    }
    if (src[i] !== "{") {
      from = i;
      continue;
    }
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(i + 1, j));
    from = j + 1;
  }
  return out;
}

/** Flatten ◊tag{…} markup inside a text body into plain text + spans (one span per tag). */
export function stripPollenTags(body: string): { text: string; spans: LegacySpan[] } {
  let text = "";
  const spans: LegacySpan[] = [];
  let i = 0;
  let counter = 0;
  while (i < body.length) {
    if (body[i] === "◊") {
      const m = /^◊([a-z]+)(\[[^\]]*\])?\{/.exec(body.slice(i));
      if (m) {
        const name = m[1]!;
        let depth = 0;
        let j = i + m[0].length - 1;
        for (; j < body.length; j++) {
          if (body[j] === "{") depth++;
          else if (body[j] === "}") {
            depth--;
            if (depth === 0) break;
          }
        }
        const inner = body.slice(i + m[0].length, j);
        const start = text.length;
        const nested = stripPollenTags(inner);
        text += nested.text;
        for (const s of nested.spans)
          spans.push({ ...s, start: s.start + start, end: s.end + start });
        if (LEGACY_LABELS.has(name)) {
          counter++;
          spans.push({ label: name, key: `${name} ${counter}`, start, end: text.length });
        }
        i = j + 1;
        continue;
      }
    }
    text += body[i];
    i++;
  }
  return collapseWhitespace(text, spans);
}

/** Parse the Livy 1.12 Pollen file into one unit per ◊og block. */
export function parseLivyPollen(src: string): LegacyUnit[] {
  const units: LegacyUnit[] = [];
  for (const og of pollenBlocks(src, "og")) {
    const n = pollenBlocks(og, "lineog")[0]?.trim();
    const textog = pollenBlocks(og, "textog")[0];
    if (!n || textog === undefined) continue;
    const { text, spans } = stripPollenTags(textog);
    units.push({ n, text: normalizeSpace(text), spans });
  }
  return units;
}
