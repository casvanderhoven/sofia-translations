import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  type CreateSectionRequest,
  createSection,
  parseSection,
  type SaveSectionRequest,
  type Section,
  SectionParseError,
  type SectionResponse,
  serializeSection,
  validateSection,
} from "@sofia/core";
import { writeSectionFile } from "@sofia/core/node";
import { Hono } from "hono";
import { CONTENT_ROOT } from "../env.ts";
import { PathError, safeContentPath, toRel } from "../paths.ts";

export const sections = new Hono();

const etagOf = (raw: string) => createHash("sha256").update(raw).digest("hex").slice(0, 16);

async function loadResponse(rel: string): Promise<SectionResponse> {
  const abs = await safeContentPath(rel, { ext: [".md"], mustExist: true });
  const raw = await readFile(abs, "utf8");
  const { section, warnings } = parseSection(raw);
  return {
    file: rel,
    doc: section,
    raw,
    etag: etagOf(raw),
    warnings,
    issues: validateSection(section),
  };
}

sections.get("/sections/:path{.+}", async (c) => {
  try {
    return c.json(await loadResponse(c.req.param("path")));
  } catch (e) {
    if (e instanceof PathError) return c.json({ error: e.message }, 400);
    if (e instanceof SectionParseError) return c.json({ error: e.message }, 422);
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return c.json({ error: "not found" }, 404);
    throw e;
  }
});

sections.put("/sections/:path{.+}", async (c) => {
  const rel = c.req.param("path");
  let body: SaveSectionRequest;
  try {
    body = await c.req.json<SaveSectionRequest>();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  try {
    const abs = await safeContentPath(rel, { ext: [".md"] });
    let current = "";
    try {
      current = await readFile(abs, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (current !== "" && etagOf(current) !== body.etag) {
      return c.json({ error: "conflict: file changed on disk", etag: etagOf(current) }, 409);
    }
    // Canonicalise through the text format: serialise, re-parse (reconcile), validate, serialise again.
    const text1 = serializeSection(body.doc as Section);
    const { section, warnings } = parseSection(text1);
    const issues = validateSection(section);
    if (issues.some((i) => i.level === "error")) {
      return c.json({ error: "validation failed", issues, warnings }, 422);
    }
    await mkdir(path.dirname(abs), { recursive: true });
    const raw = await writeSectionFile(CONTENT_ROOT, toRel(abs), section);
    const res: SectionResponse = {
      file: rel,
      doc: section,
      raw,
      etag: etagOf(raw),
      warnings,
      issues,
    };
    return c.json(res);
  } catch (e) {
    if (e instanceof PathError) return c.json({ error: e.message }, 400);
    if (e instanceof SectionParseError) return c.json({ error: e.message }, 422);
    throw e;
  }
});

sections.post("/sections", async (c) => {
  let body: CreateSectionRequest;
  try {
    body = await c.req.json<CreateSectionRequest>();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  if (!/^[0-9]{2}(-[a-z0-9]+)*\.md$/.test(body.fileName)) {
    return c.json({ error: "fileName must look like 03-slug.md" }, 400);
  }
  try {
    const chapterAbs = await safeContentPath(body.chapterDir);
    try {
      await stat(path.join(chapterAbs, "chapter.yaml"));
    } catch {
      return c.json({ error: `no chapter.yaml in ${body.chapterDir}` }, 400);
    }
    const rel = `${body.chapterDir}/sections/${body.fileName}`;
    const abs = await safeContentPath(rel, { ext: [".md"] });
    try {
      await stat(abs);
      return c.json({ error: "file already exists" }, 409);
    } catch {
      /* good: does not exist */
    }
    const meta: Parameters<typeof createSection>[0]["meta"] = {
      title: body.title,
      lang: body.lang,
      form: body.form,
    };
    if (body.urn) meta.urn = body.urn;
    const section = createSection({ meta, units: body.units });
    await mkdir(path.dirname(abs), { recursive: true });
    await writeSectionFile(CONTENT_ROOT, rel, section);
    return c.json(await loadResponse(rel), 201);
  } catch (e) {
    if (e instanceof PathError) return c.json({ error: e.message }, 400);
    throw e;
  }
});
