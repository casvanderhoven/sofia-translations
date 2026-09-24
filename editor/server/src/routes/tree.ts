import { hasMorph, type TreeResponse } from "@sofia/core";
import { loadContentTree } from "@sofia/core/node";
import { Hono } from "hono";
import { CONTENT_ROOT } from "../env.ts";

export const tree = new Hono();

tree.get("/tree", async (c) => {
  const t = await loadContentTree(CONTENT_ROOT);
  const res: TreeResponse = {
    authors: t.authors.map((a) => ({
      slug: a.slug,
      name: a.meta.name,
      works: a.works.map((w) => ({
        slug: w.slug,
        dir: w.dir,
        title: w.meta.title,
        lang: w.meta.lang,
        ...(w.meta.urnBase ? { urnBase: w.meta.urnBase } : {}),
        chapters: w.chapters.map((ch) => ({
          slug: ch.slug,
          dir: ch.dir,
          title: ch.meta.title,
          sections: ch.sections.map((s) => {
            const sec = s.section;
            const inGroup = new Set(sec.groups.flatMap((g) => g.original));
            const analysedTokens = sec.tokens.filter((t) => t.lemma || hasMorph(t.morph));
            return {
              slug: s.slug,
              file: s.file,
              title: sec.meta.title,
              status: sec.meta.status,
              lines: sec.meta.lines,
              tokens: sec.tokens.length,
              analysed: analysedTokens.length,
              verified: analysedTokens.filter((t) => t.verified).length,
              aligned: sec.tokens.filter((t) => inGroup.has(t.id)).length,
              hasTranslation: sec.translation.length > 0,
              warnings: s.warnings.length + s.issues.filter((i) => i.level === "warning").length,
              errors: s.issues.filter((i) => i.level === "error").length,
            };
          }),
        })),
      })),
    })),
  };
  return c.json(res);
});
