import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { CONTENT_ROOT, PORT } from "./env.ts";
import { morphCache } from "./routes/morph.ts";

const app = createApp();
serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, (info) => {
  console.log(`sofia editor api on http://127.0.0.1:${info.port}/api  (content: ${CONTENT_ROOT})`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await morphCache.flush();
    process.exit(0);
  });
}
