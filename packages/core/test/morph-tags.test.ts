import { describe, expect, it } from "vitest";
import { describeMorph, formatTags, parseTags, suggestLabel } from "../src/morph-tags.ts";

describe("morph tags", () => {
  it("parses in any order and formats canonically", () => {
    const { morph, unknown, conflicts } = parseTags(["gen", "noun", "f", "sg"]);
    expect(unknown).toEqual([]);
    expect(conflicts).toEqual([]);
    expect(formatTags(morph)).toEqual(["noun", "sg", "f", "gen"]);
  });
  it("reports unknown and conflicting tags", () => {
    expect(parseTags(["noun", "xyz"]).unknown).toEqual(["xyz"]);
    expect(parseTags(["nom", "acc"]).conflicts).toEqual(["acc"]);
  });
  it("describes morphology in English", () => {
    expect(describeMorph(parseTags(["verb", "aor", "ptcp", "act", "nom", "sg", "m"]).morph)).toBe(
      "aorist participle, active, nominative singular masculine",
    );
    expect(describeMorph(parseTags(["verb", "aor", "ind", "act", "3", "sg"]).morph)).toBe(
      "aorist indicative, active, 3rd person singular",
    );
    expect(describeMorph(parseTags(["noun", "gen", "sg", "f"]).morph)).toBe(
      "noun, genitive singular feminine",
    );
    expect(describeMorph({})).toBe("");
  });
  it("suggests reader labels", () => {
    expect(suggestLabel(parseTags(["verb", "aor", "ind"]).morph)).toBe("verb");
    expect(suggestLabel(parseTags(["verb", "ptcp", "nom"]).morph)).toBe("nom");
    expect(suggestLabel(parseTags(["noun", "loc"]).morph)).toBe("other");
    expect(suggestLabel(parseTags(["prep"]).morph)).toBe("adv");
    expect(suggestLabel({})).toBe("other");
  });
});
