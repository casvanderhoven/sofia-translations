import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { lookupMorpheus, type MorphAnalysis } from "./morpheus.ts";
import type { Lang } from "./types.ts";

/**
 * Committed, sorted JSONL cache of Morpheus analyses: content/.cache/morpheus/{grc,lat}.jsonl.
 * One line per form: {"form":"γῆς","analyses":[…]}. Rewritten in sorted order on every flush
 * so the file is deterministic and reviewable in git.
 */
export class MorphCache {
  private maps: Record<Lang, Map<string, MorphAnalysis[]>> = { grc: new Map(), lat: new Map() };
  private loaded: Record<Lang, boolean> = { grc: false, lat: false };
  private dirty: Record<Lang, boolean> = { grc: false, lat: false };
  private flushTimer: NodeJS.Timeout | undefined;
  private inflight = new Map<string, Promise<MorphAnalysis[]>>();

  constructor(
    private readonly dir: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private file(lang: Lang): string {
    return path.join(this.dir, `${lang}.jsonl`);
  }

  private async load(lang: Lang): Promise<void> {
    if (this.loaded[lang]) return;
    this.loaded[lang] = true;
    try {
      const text = await readFile(this.file(lang), "utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const row = JSON.parse(line) as { form: string; analyses: MorphAnalysis[] };
        this.maps[lang].set(row.form, row.analyses);
      }
    } catch {
      /* no cache yet */
    }
  }

  async peek(lang: Lang, form: string): Promise<MorphAnalysis[] | undefined> {
    await this.load(lang);
    return this.maps[lang].get(form);
  }

  async get(lang: Lang, form: string): Promise<MorphAnalysis[]> {
    await this.load(lang);
    const hit = this.maps[lang].get(form);
    if (hit) return hit;
    const key = `${lang}:${form}`;
    let p = this.inflight.get(key);
    if (!p) {
      p = this.fetchWithRetry(lang, form).then((analyses) => {
        this.maps[lang].set(form, analyses);
        this.dirty[lang] = true;
        this.scheduleFlush();
        this.inflight.delete(key);
        return analyses;
      });
      this.inflight.set(key, p);
    }
    return p;
  }

  private async fetchWithRetry(lang: Lang, form: string): Promise<MorphAnalysis[]> {
    let delay = 500;
    for (let attempt = 0; ; attempt++) {
      try {
        return await lookupMorpheus(this.baseUrl, lang, form, this.fetchImpl);
      } catch (e) {
        if (attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  /** Look up many forms with bounded concurrency. Returns form -> analyses. */
  async getMany(
    lang: Lang,
    forms: string[],
    concurrency = 2,
    spacingMs = 200,
  ): Promise<Map<string, MorphAnalysis[]>> {
    const unique = [...new Set(forms)];
    const out = new Map<string, MorphAnalysis[]>();
    let i = 0;
    const worker = async () => {
      while (i < unique.length) {
        const form = unique[i++]!;
        const cached = await this.peek(lang, form);
        if (cached) {
          out.set(form, cached);
          continue;
        }
        out.set(form, await this.get(lang, form));
        await new Promise((r) => setTimeout(r, spacingMs));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return out;
  }

  private scheduleFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), 1500);
  }

  async flush(): Promise<void> {
    for (const lang of ["grc", "lat"] as const) {
      if (!this.dirty[lang]) continue;
      this.dirty[lang] = false;
      const rows = [...this.maps[lang].entries()].sort(([a], [b]) => a.localeCompare(b));
      const text = `${rows.map(([form, analyses]) => JSON.stringify({ form, analyses })).join("\n")}\n`;
      await mkdir(this.dir, { recursive: true });
      const target = this.file(lang);
      const tmp = `${target}.tmp`;
      await writeFile(tmp, text, "utf8");
      await rename(tmp, target);
    }
  }
}
