import { describe, expect, it } from "vitest";
import { tokenizeText } from "../src/tokenize.ts";

const forms = (s: string, elision = false) =>
  tokenizeText(s.normalize("NFC"), { elision }).map((t) => t.form);

describe("tokenizeText", () => {
  it("keeps Greek elision marks on the word and drops punctuation", () => {
    expect(forms("ὅθεν ποτ᾽ ἄρας ναυσὶ χιλίαις Ἄρη", true)).toEqual([
      "ὅθεν",
      "ποτ᾽",
      "ἄρας",
      "ναυσὶ",
      "χιλίαις",
      "Ἄρη",
    ]);
    expect(forms("ὦ γῆς παλαιὸν ἄργος, Ἰνάχου ῥοαί,", true)).toEqual([
      "ὦ",
      "γῆς",
      "παλαιὸν",
      "ἄργος",
      "Ἰνάχου",
      "ῥοαί",
    ]);
    expect(forms("κἀκεῖ μὲν εὐτύχησεν: ἐν δὲ δώμασι", true)).toEqual([
      "κἀκεῖ",
      "μὲν",
      "εὐτύχησεν",
      "ἐν",
      "δὲ",
      "δώμασι",
    ]);
  });
  it("handles the right single quote as an elision mark too", () => {
    expect(forms("τόδ’ Ἄργος", true)).toEqual(["τόδ’", "Ἄργος"]);
  });
  it("treats a trailing apostrophe as a quote when elision is off", () => {
    expect(forms("'the citadel' fell")).toEqual(["the", "citadel", "fell"]);
    expect(forms("don't stop")).toEqual(["don't", "stop"]);
    expect(forms("a war-fleet, sailed—home")).toEqual(["a", "war-fleet", "sailed", "home"]);
  });
  it("keeps Latin enclitics attached", () => {
    expect(forms("inter Palatinum Capitolinumque collem campi est complesset,")).toEqual([
      "inter",
      "Palatinum",
      "Capitolinumque",
      "collem",
      "campi",
      "est",
      "complesset",
    ]);
  });
  it("returns UTF-16 offsets usable with slice", () => {
    const s = "ὦ γῆς, ἄργος.";
    for (const t of tokenizeText(s, { elision: true }))
      expect(s.slice(t.start, t.end)).toBe(t.form);
  });
  it("is empty for punctuation-only text", () => {
    expect(forms("— … ·")).toEqual([]);
  });
});
