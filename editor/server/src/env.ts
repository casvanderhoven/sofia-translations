import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MORPH_BASE_URL } from "@sofia/core";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..", "..");
export const CONTENT_ROOT = process.env.SOFIA_CONTENT_ROOT ?? path.join(REPO_ROOT, "content");
export const CACHE_DIR = path.join(CONTENT_ROOT, ".cache", "morpheus");
export const PORT = Number(process.env.EDITOR_PORT ?? 5174);
export const MODEL = process.env.SOFIA_MODEL ?? "claude-sonnet-5";
export const MORPH_BASE_URL = process.env.MORPH_BASE_URL ?? DEFAULT_MORPH_BASE_URL;
export const ASTRO_URL = process.env.ASTRO_URL ?? "http://localhost:4321";
export const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
export const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
]);
