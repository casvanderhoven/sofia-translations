import { existsSync } from "node:fs";
import {
  type AuthorNode,
  type ChapterNode,
  type ContentTree,
  loadContentTree,
  type WorkNode,
} from "@sofia/core/node";

const root = __SOFIA_CONTENT_ROOT__;
let cached: Promise<ContentTree> | undefined;

export function getTree(): Promise<ContentTree> {
  if (!existsSync(root)) throw new Error(`content root not found: ${root}`);
  // In dev, re-read on every request so edits made in the editor show up on reload.
  if (import.meta.env.DEV) cached = undefined;
  cached ??= loadContentTree(root).then((tree) => {
    if (tree.authors.length === 0) console.warn(`[sofia] no authors found under ${root}`);
    return tree;
  });
  return cached;
}

export const authorUrl = (a: AuthorNode) => `/authors/${a.slug}/`;
export const workUrl = (a: AuthorNode, w: WorkNode) => `/authors/${a.slug}/${w.slug}/`;
export const chapterUrl = (a: AuthorNode, w: WorkNode, c: ChapterNode) =>
  `/authors/${a.slug}/${w.slug}/${c.slug}/`;
export const articleUrl = (a: AuthorNode, w: WorkNode, slug: string) =>
  `/authors/${a.slug}/${w.slug}/articles/${slug}/`;

export interface ChapterRoute {
  author: AuthorNode;
  work: WorkNode;
  chapter: ChapterNode;
  prev: ChapterNode | undefined;
  next: ChapterNode | undefined;
}

export async function chapterRoutes(): Promise<ChapterRoute[]> {
  const tree = await getTree();
  const out: ChapterRoute[] = [];
  for (const author of tree.authors) {
    for (const work of author.works) {
      work.chapters.forEach((chapter, k) => {
        out.push({ author, work, chapter, prev: work.chapters[k - 1], next: work.chapters[k + 1] });
      });
    }
  }
  return out;
}

export function langAttr(lang: "grc" | "lat"): string {
  return lang === "lat" ? "la" : "grc";
}

export function rangeLabel(range: [string, string] | undefined, form: "verse" | "prose"): string {
  if (!range) return "";
  const [a, b] = range;
  const noun = form === "verse" ? "Lines" : "Sections";
  return a === b ? `${form === "verse" ? "Line" : "Section"} ${a}` : `${noun} ${a}–${b}`;
}
