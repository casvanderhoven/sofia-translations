import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { parseSection } from "./parse.ts";
import {
  AuthorSchema,
  ChapterSchema,
  type ValidationIssue,
  validateSection,
  WorkSchema,
} from "./schema.ts";
import { serializeSection } from "./serialize.ts";
import type { Author, Chapter, Section, Work } from "./types.ts";

export interface SectionNode {
  slug: string;
  /** Path relative to the content root, POSIX separators. */
  file: string;
  section: Section;
  warnings: string[];
  issues: ValidationIssue[];
}
export interface ArticleNode {
  slug: string;
  file: string;
  title: string;
  date?: string;
  summary?: string;
  body: string;
}
export interface ChapterNode {
  slug: string;
  dir: string;
  meta: Chapter;
  sections: SectionNode[];
}
export interface WorkNode {
  slug: string;
  dir: string;
  meta: Work;
  chapters: ChapterNode[];
  articles: ArticleNode[];
}
export interface AuthorNode {
  slug: string;
  dir: string;
  meta: Author;
  works: WorkNode[];
}
export interface ContentTree {
  root: string;
  authors: AuthorNode[];
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(ext) && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function readYaml<T>(file: string, schema: { parse: (v: unknown) => T }): Promise<T> {
  const text = await readFile(file, "utf8");
  return schema.parse(YAML.parse(text));
}

function byOrder<T extends { slug: string; meta: { order?: number | undefined } }>(
  a: T,
  b: T,
): number {
  const ao = a.meta.order ?? Number.POSITIVE_INFINITY;
  const bo = b.meta.order ?? Number.POSITIVE_INFINITY;
  return ao !== bo ? ao - bo : a.slug.localeCompare(b.slug);
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export async function loadSectionFile(root: string, relFile: string): Promise<SectionNode> {
  const raw = await readFile(path.join(root, relFile), "utf8");
  const { section, warnings } = parseSection(raw);
  return {
    slug: path.basename(relFile, ".md"),
    file: toPosix(relFile),
    section,
    warnings,
    issues: validateSection(section),
  };
}

function parseArticle(relFile: string, raw: string): ArticleNode {
  let title = path.basename(relFile, ".md");
  let body = raw;
  let date: string | undefined;
  let summary: string | undefined;
  if (raw.startsWith("---\n")) {
    const end = raw.indexOf("\n---\n", 4);
    if (end > 0) {
      const fm = YAML.parse(raw.slice(4, end + 1)) as Record<string, unknown> | null;
      body = raw.slice(end + 5);
      if (fm && typeof fm.title === "string") title = fm.title;
      if (fm && fm.date !== undefined)
        date = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date);
      if (fm && typeof fm.summary === "string") summary = fm.summary;
    }
  }
  const node: ArticleNode = {
    slug: path.basename(relFile, ".md"),
    file: toPosix(relFile),
    title,
    body: body.trim(),
  };
  if (date !== undefined) node.date = date;
  if (summary !== undefined) node.summary = summary;
  return node;
}

export async function loadContentTree(root: string): Promise<ContentTree> {
  const authors: AuthorNode[] = [];
  for (const authorSlug of await listDirs(root)) {
    const authorDir = path.join(root, authorSlug);
    const authorYaml = path.join(authorDir, "author.yaml");
    try {
      await stat(authorYaml);
    } catch {
      continue;
    }
    const authorMeta = await readYaml(authorYaml, AuthorSchema);
    const works: WorkNode[] = [];
    for (const workSlug of await listDirs(authorDir)) {
      const workDir = path.join(authorDir, workSlug);
      const workYaml = path.join(workDir, "work.yaml");
      try {
        await stat(workYaml);
      } catch {
        continue;
      }
      const workMeta = await readYaml(workYaml, WorkSchema);
      const chapters: ChapterNode[] = [];
      const chaptersDir = path.join(workDir, "chapters");
      for (const chapterSlug of await listDirs(chaptersDir)) {
        const chapterDir = path.join(chaptersDir, chapterSlug);
        const chapterYaml = path.join(chapterDir, "chapter.yaml");
        let chapterMeta: Chapter;
        try {
          chapterMeta = await readYaml(chapterYaml, ChapterSchema);
        } catch {
          chapterMeta = { title: chapterSlug.replace(/^[0-9]+-/, "").replace(/-/g, " ") };
        }
        const sectionsDir = path.join(chapterDir, "sections");
        const sections: SectionNode[] = [];
        for (const f of await listFiles(sectionsDir, ".md")) {
          const rel = path.relative(root, path.join(sectionsDir, f));
          try {
            sections.push(await loadSectionFile(root, rel));
          } catch (e) {
            throw new Error(`${toPosix(rel)}: ${(e as Error).message}`, { cause: e });
          }
        }
        chapters.push({
          slug: chapterSlug,
          dir: toPosix(path.relative(root, chapterDir)),
          meta: chapterMeta,
          sections,
        });
      }
      chapters.sort(byOrder);
      const articles: ArticleNode[] = [];
      const articlesDir = path.join(workDir, "articles");
      for (const f of await listFiles(articlesDir, ".md")) {
        const rel = path.relative(root, path.join(articlesDir, f));
        articles.push(parseArticle(rel, await readFile(path.join(root, rel), "utf8")));
      }
      works.push({
        slug: workSlug,
        dir: toPosix(path.relative(root, workDir)),
        meta: workMeta,
        chapters,
        articles,
      });
    }
    works.sort(byOrder);
    authors.push({ slug: authorSlug, dir: authorSlug, meta: authorMeta, works });
  }
  authors.sort(byOrder);
  return { root, authors };
}

/** Canonical serialise + atomic write (tmp file + rename). Returns the text written. */
export async function writeSectionFile(
  root: string,
  relFile: string,
  section: Section,
): Promise<string> {
  const text = serializeSection(section);
  const target = path.join(root, relFile);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, target);
  return text;
}
