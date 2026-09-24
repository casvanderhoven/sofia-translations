/**
 * Deterministic word tokenisation for polytonic Greek, Latin and English.
 * Punctuation never becomes a token; it lives in the gaps between token offsets.
 * Callers must NFC-normalise the text first (parseSection does this for the whole file).
 */

export interface RawToken {
  form: string;
  start: number;
  end: number;
}

export interface TokenizeOptions {
  /**
   * Keep a trailing apostrophe-like mark as part of the word (Greek elision: ποτ᾽, Τρῳάδ᾽).
   * Off for Latin and English, where a trailing apostrophe is a closing quote.
   */
  elision?: boolean;
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;
/** Apostrophe-like marks: ASCII, right single quote, modifier apostrophe, Greek koronis, psili. */
const APOSTROPHES = new Set(["'", "’", "ʼ", "᾽", "᾿"]);
const CONNECTORS = new Set(["-", ...APOSTROPHES]);

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

export function tokenizeText(text: string, opts: TokenizeOptions = {}): RawToken[] {
  const chars = Array.from(text);
  // Map code-point index -> UTF-16 offset so offsets are usable with String.prototype.slice.
  const offsets: number[] = new Array(chars.length + 1);
  let acc = 0;
  for (let k = 0; k < chars.length; k++) {
    offsets[k] = acc;
    acc += chars[k]!.length;
  }
  offsets[chars.length] = acc;

  const out: RawToken[] = [];
  let i = 0;
  while (i < chars.length) {
    if (!isWordChar(chars[i])) {
      i++;
      continue;
    }
    let j = i;
    for (;;) {
      while (isWordChar(chars[j])) j++;
      const c = chars[j];
      if (c !== undefined && CONNECTORS.has(c) && isWordChar(chars[j + 1])) {
        j++;
        continue;
      }
      break;
    }
    const c = chars[j];
    if (opts.elision && c !== undefined && APOSTROPHES.has(c)) j++;
    out.push({ form: chars.slice(i, j).join(""), start: offsets[i]!, end: offsets[j]! });
    i = j;
  }
  return out;
}

export function tokenizeOptionsFor(lang: "grc" | "lat" | "en"): TokenizeOptions {
  return { elision: lang === "grc" };
}
