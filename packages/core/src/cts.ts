import { XMLParser } from "fast-xml-parser";
import type { Lang, SourceInfo, TextForm, Unit } from "./types.ts";

export interface CtsPassage {
  urn: string;
  lang: Lang;
  form: TextForm;
  units: Unit[];
  source: SourceInfo;
}

export const SCAIFE_PASSAGE_URL = (urn: string) =>
  `https://scaife.perseus.org/library/passage/${urn}/xml/`;
export const SCAIFE_READER_URL = (urn: string) => `https://scaife.perseus.org/reader/${urn}/`;

type Node = Record<string, unknown> & { ":@"?: Record<string, string> };

const DROP = new Set([
  "note",
  "pb",
  "milestone",
  "del",
  "sic",
  "speaker",
  "label",
  "head",
  "bibl",
  "ref",
]);

function tagOf(node: Node): string | undefined {
  return Object.keys(node).find((k) => k !== ":@" && k !== "#text");
}

function children(node: Node): Node[] {
  const tag = tagOf(node);
  const v = tag ? node[tag] : undefined;
  return Array.isArray(v) ? (v as Node[]) : [];
}

function attrs(node: Node): Record<string, string> {
  return node[":@"] ?? {};
}

/** Collect the visible text of a node, applying TEI editorial conventions. */
export function textOf(node: Node): string {
  if ("#text" in node) return String(node["#text"]);
  const tag = tagOf(node);
  if (!tag || DROP.has(tag)) return "";
  if (tag === "choice") {
    const corr = children(node).find(
      (c) => tagOf(c) === "corr" || tagOf(c) === "reg" || tagOf(c) === "expan",
    );
    return corr ? textOf(corr) : children(node).map(textOf).join("");
  }
  if (tag === "lb" || tag === "l") return `${children(node).map(textOf).join("")} `;
  return children(node).map(textOf).join("");
}

function clean(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

function* walk(node: Node): Generator<Node> {
  yield node;
  for (const c of children(node)) yield* walk(c);
}

function findAttr(nodes: Node[], name: string): string | undefined {
  for (const n of nodes)
    for (const d of walk(n)) {
      const v = attrs(d)[name];
      if (v) return v;
    }
  return undefined;
}

export function parseTeiPassage(xml: string, urn: string): CtsPassage {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: false,
    removeNSPrefix: true,
    processEntities: true,
  });
  const roots = parser.parse(xml) as Node[];
  const langAttr = findAttr(roots, "xml:lang") ?? findAttr(roots, "lang") ?? "";
  const lang: Lang = /^la/.test(langAttr) || /latinLit/.test(urn) ? "lat" : "grc";

  const units: Unit[] = [];
  const seen = new Set<string>();
  // Verse: <l n="…">; speaker names from <speaker> inside the enclosing <sp>.
  const visitVerse = (node: Node, speaker: string | undefined) => {
    const tag = tagOf(node);
    if (!tag) return;
    if (tag === "sp") {
      const sp = children(node).find((c) => tagOf(c) === "speaker");
      const name = sp ? clean(children(sp).map(textOf).join("")) : undefined;
      let first = true;
      for (const c of children(node)) {
        if (tagOf(c) === "l") {
          const n = attrs(c).n;
          if (n && !seen.has(n)) {
            seen.add(n);
            const unit: Unit = { n, text: clean(textOf(c)) };
            if (first && name) unit.speaker = name;
            first = false;
            units.push(unit);
          }
        } else visitVerse(c, name);
      }
      return;
    }
    if (tag === "l") {
      const n = attrs(node).n;
      if (n && !seen.has(n)) {
        seen.add(n);
        units.push({ n, text: clean(textOf(node)) });
      }
      return;
    }
    for (const c of children(node)) visitVerse(c, speaker);
  };
  for (const r of roots) visitVerse(r, undefined);
  let form: TextForm = "verse";

  if (units.length === 0) {
    form = "prose";
    for (const r of roots) {
      for (const d of walk(r)) {
        const a = attrs(d);
        if (tagOf(d) === "div" && a.subtype === "section" && a.n && !seen.has(a.n)) {
          seen.add(a.n);
          units.push({ n: a.n, text: clean(children(d).map(textOf).join(" ")) });
        }
      }
    }
  }
  if (units.length === 0)
    throw new Error(`no <l n> or <div subtype="section" n> units found for ${urn}`);

  const edition = urn.split(":").slice(0, 4).join(":");
  const editionId = edition.split(".").pop() ?? edition;
  return {
    urn,
    lang,
    form,
    units,
    source: {
      edition: `Perseus Digital Library, ${editionId}`,
      license: "CC-BY-SA-4.0",
      retrieved: new Date().toISOString().slice(0, 10),
      url: SCAIFE_READER_URL(urn),
    },
  };
}

export async function fetchCtsPassage(
  urn: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CtsPassage> {
  const res = await fetchImpl(SCAIFE_PASSAGE_URL(urn), {
    headers: { Accept: "application/xml,text/xml" },
  });
  if (!res.ok) throw new Error(`Scaife returned ${res.status} for ${urn}`);
  return parseTeiPassage(await res.text(), urn);
}
