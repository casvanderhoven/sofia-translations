import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSection, SectionParseError } from "../src/parse.ts";
import { validateSection } from "../src/schema.ts";
import { serializeSection } from "../src/serialize.ts";

const fixture = readFileSync(new URL("./fixtures/electra-1-3.md", import.meta.url), "utf8");

describe("parseSection", () => {
  it("parses the Electra fixture", () => {
    const { section, warnings } = parseSection(fixture);
    expect(warnings).toEqual([]);
    expect(section.meta.title).toBe("Invocation of Argos");
    expect(section.meta.lines).toEqual(["1", "3"]);
    expect(section.meta.source?.retrieved).toBe("2026-09-24");
    expect(section.original).toHaveLength(3);
    expect(section.original[0]?.speaker).toBe("Αὐτουργός");
    expect(section.tokens).toHaveLength(18);
    expect(section.tokens[1]).toMatchObject({
      id: "1.2",
      form: "γῆς",
      lemma: "γῆ",
      verified: true,
      morph: { pos: "noun", case: "gen", number: "sg", gender: "f" },
    });
    expect(section.tokens.find((t) => t.id === "3.4")?.verified).toBe(false);
    expect(section.translationTokens).toHaveLength(25);
    expect(section.translation[0]).toMatchObject({ speaker: "Farmer" });
    expect(section.groups).toHaveLength(14);
    expect(section.groups.find((g) => g.id === "g8")?.note).toBe("aor. ptcp, rendered as finite");
    expect(section.notes).toContain("neuter");
    expect(validateSection(section).filter((i) => i.level === "error")).toEqual([]);
  });

  it("serialises canonically and idempotently", () => {
    const once = serializeSection(parseSection(fixture).section);
    const twice = serializeSection(parseSection(once).section);
    expect(twice).toBe(once);
    expect(once).toBe(fixture);
  });

  it("rejects unknown tags and blocks", () => {
    expect(() => parseSection(fixture.replace("noun sg f gen", "noun sg f genitive"))).toThrow(
      SectionParseError,
    );
    expect(() => parseSection(fixture.replace("## Notes", "## Remarks"))).toThrow(/unknown block/);
    expect(() => parseSection(fixture.replace("g1   adv", "g1   dative"))).toThrow(
      /unknown group label/,
    );
  });

  it("joins prose continuation lines into one unit", () => {
    const raw = fixture.replace(
      "2 ὅθεν ποτ᾽ ἄρας ναυσὶ χιλίαις Ἄρη",
      "2 ὅθεν ποτ᾽ ἄρας\nναυσὶ χιλίαις Ἄρη",
    );
    const { section } = parseSection(raw);
    expect(section.original[1]?.text).toBe("ὅθεν ποτ᾽ ἄρας ναυσὶ χιλίαις Ἄρη");
    expect(section.tokens).toHaveLength(18);
  });
});
