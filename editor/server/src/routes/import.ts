import { fetchCtsPassage, type ImportCtsRequest, type ImportCtsResponse } from "@sofia/core";
import { Hono } from "hono";

export const importRoutes = new Hono();

importRoutes.post("/import/cts", async (c) => {
  const body = await c.req.json<ImportCtsRequest>().catch(() => null);
  const urn = body?.urn?.trim();
  if (!urn || !/^urn:cts:[a-zA-Z]+:[\w.-]+:[\w.-]+$/.test(urn)) {
    return c.json(
      { error: "urn must look like urn:cts:greekLit:tlg0006.tlg012.perseus-grc2:1-53" },
      400,
    );
  }
  try {
    const p = await fetchCtsPassage(urn);
    const res: ImportCtsResponse = {
      urn: p.urn,
      lang: p.lang,
      form: p.form,
      units: p.units,
      source: p.source,
    };
    return c.json(res);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});
