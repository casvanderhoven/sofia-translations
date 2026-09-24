import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

// Resolved here (not in bundled source) so the path survives Vite's server bundling.
const contentRoot =
  process.env.SOFIA_CONTENT_ROOT ?? fileURLToPath(new URL("../content", import.meta.url));

export default defineConfig({
  site: "https://sofia.casvanderhoven.com",
  output: "static",
  trailingSlash: "always",
  server: { port: 4321 },
  vite: {
    define: { __SOFIA_CONTENT_ROOT__: JSON.stringify(contentRoot) },
    server: { fs: { allow: [".."] } },
  },
});
