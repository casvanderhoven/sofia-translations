import type { MorphBatchRequest, MorphBatchResponse } from "@sofia/core";
import { MorphCache } from "@sofia/core/node";
import { Hono } from "hono";
import { CACHE_DIR, MORPH_BASE_URL } from "../env.ts";

export const morphCache = new MorphCache(CACHE_DIR, MORPH_BASE_URL);
export const morph = new Hono();

morph.get("/morph", async (c) => {
  const lang = c.req.query("lang");
  const form = c.req.query("form");
  if ((lang !== "grc" && lang !== "lat") || !form)
    return c.json({ error: "lang=grc|lat and form required" }, 400);
  try {
    return c.json(await morphCache.get(lang, form.normalize("NFC")));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

morph.post("/morph/batch", async (c) => {
  const body = await c.req.json<MorphBatchRequest>().catch(() => null);
  if (!body || (body.lang !== "grc" && body.lang !== "lat") || !Array.isArray(body.forms)) {
    return c.json({ error: "lang and forms[] required" }, 400);
  }
  try {
    const map = await morphCache.getMany(
      body.lang,
      body.forms.map((f) => String(f).normalize("NFC")),
    );
    const res: MorphBatchResponse = Object.fromEntries(map);
    return c.json(res);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});
