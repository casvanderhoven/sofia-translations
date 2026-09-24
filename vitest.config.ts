import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "scripts/**/*.test.ts",
      "editor/server/test/**/*.test.ts",
    ],
  },
});
