import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTeiPassage } from "../src/cts.ts";

const electra = readFileSync(new URL("./fixtures/scaife-electra-1-7.xml", import.meta.url), "utf8");
const livy = readFileSync(new URL("./fixtures/scaife-livy-1-12-1-3.xml", import.meta.url), "utf8");

describe("parseTeiPassage", () => {
  it("reads verse lines from Scaife TEI", () => {
    const p = parseTeiPassage(electra, "urn:cts:greekLit:tlg0006.tlg012.perseus-grc2:1-7");
    expect(p.lang).toBe("grc");
    expect(p.form).toBe("verse");
    expect(p.units.map((u) => u.n)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(p.units[0]?.text).toBe("ὦ γῆς παλαιὸν ἄργος, Ἰνάχου ῥοαί,");
    expect(p.units[1]?.text).toBe("ὅθεν ποτʼ ἄρας ναυσὶ χιλίαις Ἄρη");
    expect(p.source.license).toBe("CC-BY-SA-4.0");
  });
  it("reads prose sections, prefers <corr>, collapses whitespace", () => {
    const p = parseTeiPassage(livy, "urn:cts:latinLit:phi0914.phi001.perseus-lat2:1.12.1-1.12.3");
    expect(p.lang).toBe("lat");
    expect(p.form).toBe("prose");
    expect(p.units.map((u) => u.n)).toEqual(["1", "2", "3"]);
    expect(p.units[0]?.text).toContain("non prius descenderunt in aequum");
    expect(p.units[0]?.text).not.toContain("decenderunt");
    expect(p.units[1]?.text.endsWith("audacia sustinebat.")).toBe(true);
    expect(p.units[2]?.text).toBe(
      "ut Hostius cecidit, confestim Romana inclinatur acies fusaque est ad veterem portam Palatii.",
    );
  });
});
