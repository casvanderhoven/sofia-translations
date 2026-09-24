import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatTags } from "../src/morph-tags.ts";
import { lookupVariants, normalizeMorpheus } from "../src/morpheus.ts";

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));

describe("normalizeMorpheus", () => {
  it("maps a Greek noun", () => {
    const a = normalizeMorpheus(load("morpheus-ges.json"));
    expect(a.map((x) => x.lemma)).toContain("γῆ");
    const ge = a.find((x) => x.lemma === "γῆ")!;
    expect(formatTags(ge.morph)).toEqual(["noun", "sg", "f", "gen"]);
  });
  it("maps a Greek participle with tense/voice", () => {
    const a = normalizeMorpheus(load("morpheus-aras.json"));
    const ptcp = a.find((x) => x.morph.mood === "ptcp" && x.morph.case === "nom");
    expect(ptcp).toBeDefined();
    expect(ptcp?.morph.pos).toBe("verb");
    expect(ptcp?.morph.tense).toBe("aor");
  });
  it("maps a Latin verb form", () => {
    const a = normalizeMorpheus(load("morpheus-tenuere.json"));
    expect(a.length).toBeGreaterThan(0);
    const v = a.find((x) => x.morph.pos === "verb");
    expect(v?.lemma.toLowerCase()).toContain("tene");
  });
  it("produces lookup variants for elided forms", () => {
    expect(lookupVariants("ποτ᾽")).toEqual(["ποτ᾽", "ποτ'", "ποτ"]);
  });
});
