import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSection } from "../src/parse.ts";
import { serializeSection } from "../src/serialize.ts";

const fixture = readFileSync(new URL("./fixtures/electra-1-3.md", import.meta.url), "utf8");

describe("reconciliation", () => {
  it("keeps translation ids and group links when a word is inserted by hand", () => {
    const edited = fixture.replace("O ancient land of Argos", "O ancient, ancient land of Argos");
    const { section, warnings } = parseSection(edited);
    expect(warnings.some((w) => /1 new translation token/.test(w))).toBe(true);
    const forms = Object.fromEntries(section.translationTokens.map((t) => [t.id, t.form]));
    expect(forms.t2).toBe("ancient");
    expect(forms.t3).toBe("land");
    expect(forms.t30).toBe("ancient");
    expect(section.meta.nextId.t).toBe(31);
    const g2 = section.groups.find((g) => g.id === "g2");
    expect(g2?.translation).toEqual(["t2", "t3"]);
    const g14 = section.groups.find((g) => g.id === "g14");
    expect(g14?.translation).toEqual(["t11", "t12"]);
    // The inserted token is unaligned and the file re-serialises with it listed in order.
    const out = serializeSection(section);
    expect(out).toContain("t2 ancient\nt30 ancient\nt3 land");
  });

  it("drops deleted translation words from groups with a warning", () => {
    const edited = fixture.replace("king Agamemnon\nonce", "Agamemnon\nonce");
    const { section, warnings } = parseSection(edited);
    expect(warnings.join("\n")).toMatch(/t11 "king"/);
    expect(section.groups.find((g) => g.id === "g14")?.translation).toEqual(["t12"]);
  });

  it("carries analyses and remaps groups when the original text changes", () => {
    // Insert a particle at the start of line 2: every token on line 2 shifts by one.
    const edited = fixture.replace("2 ὅθεν ποτ᾽", "2 δὴ ὅθεν ποτ᾽");
    const { section, warnings } = parseSection(edited);
    expect(warnings.join("\n")).toMatch(/renumbered/);
    const t = section.tokens.find((x) => x.form === "ἄρας");
    expect(t?.id).toBe("2.4");
    expect(t?.lemma).toBe("αἴρω");
    expect(section.groups.find((g) => g.id === "g8")?.original).toEqual(["2.4"]);
    expect(section.groups.find((g) => g.id === "g10")?.original).toEqual(["2.5", "2.6"]);
    expect(section.tokens.find((x) => x.id === "2.1")?.lemma).toBeUndefined();
  });

  it("keeps a group that loses only its original side", () => {
    const edited = fixture.replace("1 ὦ γῆς", "1 γῆς");
    const { section, warnings } = parseSection(edited);
    expect(section.groups.find((g) => g.id === "g1")).toMatchObject({
      original: [],
      translation: ["t1"],
    });
    expect(warnings.join("\n")).toMatch(/g1: original token 1.1 no longer exists/);
  });

  it("drops a group that loses all its tokens", () => {
    const edited = fixture.replace("1 ὦ γῆς", "1 γῆς").replace("O ancient land", "Ancient land");
    const { section, warnings } = parseSection(edited);
    expect(section.groups.find((g) => g.id === "g1")).toBeUndefined();
    expect(warnings.join("\n")).toMatch(/g1 lost all its tokens/);
  });
});
