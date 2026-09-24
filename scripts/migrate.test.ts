import { readFileSync } from "node:fs";
import { parseSection, serializeSection, validateSection } from "@sofia/core";
import { describe, expect, it } from "vitest";
import { buildSectionFromLegacy } from "./lib/build-section.ts";
import { parseElektra, parseLivyPollen, stripSpans } from "./lib/legacy.ts";

const elektra = readFileSync(new URL("./fixtures/Elektra.html", import.meta.url), "utf8");
const livy = readFileSync(
  new URL("./fixtures/ab-urbe-condita-1-12.html.pm", import.meta.url),
  "utf8",
);

describe("legacy Elektra migration", () => {
  it("splits into 13 stanza sections covering lines 1–53", () => {
    const { sections, speaker } = parseElektra(elektra, 53);
    expect(speaker).toBe("Αὐτουργός");
    const ranges = sections.map((s) => [s.units[0]!.n, s.units[s.units.length - 1]!.n].join("-"));
    expect(ranges).toEqual([
      "1-3",
      "4-7",
      "8-10",
      "11-13",
      "14-18",
      "19-21",
      "22-24",
      "25-28",
      "29-30",
      "31-39",
      "40-44",
      "45-49",
      "50-53",
    ]);
    expect(sections[0]!.units[0]!.speaker).toBe("Αὐτουργός");
  });
  it("tolerates the malformed span on line 41", () => {
    const { text, spans } = stripSpans(
      '<span class="acc 33">εὕδοντ᾽</span> ἂν <span class=acc 33">τὸν</span>',
    );
    expect(text).toBe("εὕδοντ᾽ ἂν τὸν");
    expect(spans.map((s) => s.key)).toEqual(["acc 33", "acc 33"]);
  });
  it("builds a valid section with discontinuous groups and unverified case tags", () => {
    const { sections } = parseElektra(elektra, 53);
    const section = buildSectionFromLegacy({
      title: "Lines 4–7",
      lang: "grc",
      form: "verse",
      units: sections[1]!.units,
    });
    expect(validateSection(section).filter((i) => i.level === "error")).toEqual([]);
    // "acc 3" covers τὸν (line 4) and Πρίαμον (line 5).
    const g = section.groups.find((x) => x.original.includes("4.3"));
    expect(g?.original).toEqual(["4.3", "5.1"]);
    expect(g?.label).toBe("acc");
    const priamon = section.tokens.find((t) => t.id === "5.1");
    expect(priamon).toMatchObject({ form: "Πρίαμον", verified: false, morph: { case: "acc" } });
    const text = serializeSection(section);
    expect(text).toContain("~5.1");
    expect(serializeSection(parseSection(text).section)).toBe(text);
  });
  it("leaves untagged particles as plain tokens", () => {
    const { sections } = parseElektra(elektra, 53);
    const section = buildSectionFromLegacy({
      title: "x",
      lang: "grc",
      form: "verse",
      units: sections[9]!.units,
    });
    const men = section.tokens.find((t) => t.unit === "32" && t.form === "μὲν");
    expect(men?.morph).toEqual({});
    expect(section.groups.some((g) => g.original.includes(men!.id))).toBe(false);
  });
});

describe("legacy Livy migration", () => {
  it("reads two prose units with tags", () => {
    const units = parseLivyPollen(livy);
    expect(units.map((u) => u.n)).toEqual(["1", "2"]);
    expect(
      units[0]!.text.startsWith("Tenuere tamen arcem Sabini, atque inde postero die, cum Romanus"),
    ).toBe(true);
    expect(units[0]!.spans.map((s) => s.label)).toEqual([
      "verb",
      "adv",
      "acc",
      "nom",
      "adv",
      "abl",
    ]);
    const section = buildSectionFromLegacy({
      title: "1.12.1",
      lang: "lat",
      form: "prose",
      units: [units[0]!],
    });
    expect(section.groups.find((g) => g.label === "abl")?.original).toEqual(["1.7", "1.8"]);
    expect(validateSection(section).filter((i) => i.level === "error")).toEqual([]);
  });
});
