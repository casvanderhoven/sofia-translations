import { describe, expect, it } from "vitest";
import { createSection } from "../src/create.ts";
import { validateSection } from "../src/schema.ts";
import { serializeSection } from "../src/serialize.ts";

describe("createSection", () => {
  it("builds a tokenised skeleton from imported units", () => {
    const section = createSection({
      meta: {
        title: "Ab urbe condita 1.12",
        lang: "lat",
        form: "prose",
        urn: "urn:cts:latinLit:phi0914.phi001.perseus-lat2:1.12.1-1.12.2",
      },
      units: [
        { n: "1", text: "Tenuere tamen arcem Sabini, atque inde postero die." },
        { n: "2", text: "Principes utrimque pugnam ciebant." },
      ],
    });
    expect(section.meta.lines).toEqual(["1", "2"]);
    expect(section.tokens.map((t) => t.id)).toEqual([
      "1.1",
      "1.2",
      "1.3",
      "1.4",
      "1.5",
      "1.6",
      "1.7",
      "1.8",
      "2.1",
      "2.2",
      "2.3",
      "2.4",
    ]);
    expect(validateSection(section).filter((i) => i.level === "error")).toEqual([]);
    expect(serializeSection(section)).toContain("## Groups\n\n");
  });
});
