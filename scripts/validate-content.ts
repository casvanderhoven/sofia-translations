/**
 * Parse and validate every section under content/. Exit 1 on any error.
 *   pnpm validate:content
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasMorph } from "@sofia/core";
import { loadContentTree } from "@sofia/core/node";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "content");
let errors = 0;
let warnings = 0;
let sections = 0;
let tokens = 0;
let analysed = 0;
let verified = 0;
let aligned = 0;

const tree = await loadContentTree(root);
for (const author of tree.authors) {
  for (const work of author.works) {
    for (const chapter of work.chapters) {
      for (const s of chapter.sections) {
        sections++;
        tokens += s.section.tokens.length;
        analysed += s.section.tokens.filter((t) => t.lemma || hasMorph(t.morph)).length;
        verified += s.section.tokens.filter(
          (t) => t.verified && (t.lemma || hasMorph(t.morph)),
        ).length;
        const inGroup = new Set(s.section.groups.flatMap((g) => g.original));
        aligned += s.section.tokens.filter((t) => inGroup.has(t.id)).length;
        for (const w of s.warnings) {
          warnings++;
          console.log(`WARN  ${s.file}: ${w}`);
        }
        for (const i of s.issues) {
          if (i.level === "error") errors++;
          else warnings++;
          console.log(`${i.level === "error" ? "ERROR" : "WARN "} ${s.file}: ${i.message}`);
        }
      }
    }
  }
}
const pct = (n: number, d: number) => (d === 0 ? "0" : ((100 * n) / d).toFixed(0));
console.log(
  `${sections} section(s), ${tokens} original token(s): ${pct(analysed, tokens)}% analysed, ${pct(verified, tokens)}% verified, ${pct(aligned, tokens)}% in a group; ${errors} error(s), ${warnings} warning(s)`,
);
if (errors > 0) process.exit(1);
