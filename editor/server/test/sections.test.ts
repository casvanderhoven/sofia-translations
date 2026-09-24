import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = mkdtempSync(path.join(tmpdir(), "sofia-content-"));
process.env.SOFIA_CONTENT_ROOT = tmp;
const repoContent = path.resolve(__dirname, "..", "..", "..", "content");
cpSync(repoContent, tmp, { recursive: true });

const FILE = "euripides/electra/chapters/01-prologue/sections/01-lines-1-3.md";

describe("sections API", () => {
  let app: Awaited<ReturnType<typeof import("../src/app.ts").createApp>>;
  beforeAll(async () => {
    app = (await import("../src/app.ts")).createApp();
  });

  it("serves the tree", async () => {
    const res = await app.request("/api/tree");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authors.map((a: { slug: string }) => a.slug)).toEqual(["euripides", "livy"]);
  });

  it("reads, saves with etag, and rejects stale etags", async () => {
    const first = await (await app.request(`/api/sections/${FILE}`)).json();
    expect(first.doc.meta.title).toBe("Lines 1–3");
    const doc = first.doc;
    doc.translation = [{ speaker: "Farmer", text: "O ancient land of Argos, streams of Inachus." }];
    const save = await app.request(`/api/sections/${FILE}`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ doc, etag: first.etag }),
    });
    expect(save.status).toBe(200);
    const saved = await save.json();
    expect(saved.doc.translationTokens.length).toBe(8);
    expect(readFileSync(path.join(tmp, FILE), "utf8")).toContain("t1 O");
    const stale = await app.request(`/api/sections/${FILE}`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ doc, etag: first.etag }),
    });
    expect(stale.status).toBe(409);
  });

  it("blocks path escapes and foreign origins", async () => {
    expect((await app.request("/api/sections/euripides/.hidden.md")).status).toBe(400);
    expect((await app.request("/api/sections/euripides/author.yaml")).status).toBe(400);
    const res = await app.request(`/api/sections/${FILE}`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });
});
