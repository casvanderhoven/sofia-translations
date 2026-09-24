import type { ConfigResponse } from "@sofia/core";
import { Hono } from "hono";
import { API_KEY, ASTRO_URL, CONTENT_ROOT, MODEL, MORPH_BASE_URL } from "../env.ts";

export const config = new Hono();

config.get("/config", (c) => {
  const res: ConfigResponse = {
    model: MODEL,
    hasApiKey: API_KEY.length > 0,
    morphBaseUrl: MORPH_BASE_URL,
    astroUrl: ASTRO_URL,
    contentRoot: CONTENT_ROOT,
  };
  return c.json(res);
});
