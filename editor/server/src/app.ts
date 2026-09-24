import { Hono } from "hono";
import { ALLOWED_ORIGINS } from "./env.ts";
import { config } from "./routes/config.ts";
import { importRoutes } from "./routes/import.ts";
import { morph } from "./routes/morph.ts";
import { sections } from "./routes/sections.ts";
import { suggest } from "./routes/suggest.ts";
import { tree } from "./routes/tree.ts";

export function createApp(): Hono {
  const app = new Hono();

  // CSRF guard: browsers always send Origin on cross-site state-changing requests.
  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (origin && !ALLOWED_ORIGINS.has(origin)) return c.json({ error: "forbidden origin" }, 403);
    }
    await next();
  });

  app.route("/api", config);
  app.route("/api", tree);
  app.route("/api", sections);
  app.route("/api", importRoutes);
  app.route("/api", morph);
  app.route("/api", suggest);

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
  });
  return app;
}
