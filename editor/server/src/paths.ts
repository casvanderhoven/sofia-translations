import { realpath } from "node:fs/promises";
import path from "node:path";
import { CONTENT_ROOT } from "./env.ts";

export class PathError extends Error {}

/**
 * Resolve a content-relative path safely. Rejects absolute paths, `..`, backslashes and
 * anything that escapes CONTENT_ROOT (including via symlinks in existing parents).
 */
export async function safeContentPath(
  rel: string,
  opts: { ext?: string[]; mustExist?: boolean } = {},
): Promise<string> {
  if (
    !rel ||
    rel.startsWith("/") ||
    rel.includes("\\") ||
    rel.split("/").some((p) => p === ".." || p === "" || p.startsWith("."))
  ) {
    throw new PathError(`invalid path: ${rel}`);
  }
  const abs = path.resolve(CONTENT_ROOT, rel);
  if (!abs.startsWith(`${CONTENT_ROOT}${path.sep}`))
    throw new PathError(`outside content root: ${rel}`);
  if (opts.ext && !opts.ext.some((e) => abs.endsWith(e)))
    throw new PathError(`unexpected file type: ${rel}`);
  // Guard against symlinked parents pointing outside the root.
  let probe = path.dirname(abs);
  while (probe.length >= CONTENT_ROOT.length) {
    try {
      const real = await realpath(probe);
      const realRoot = await realpath(CONTENT_ROOT);
      if (!(real === realRoot || real.startsWith(`${realRoot}${path.sep}`))) {
        throw new PathError(`symlink escapes content root: ${rel}`);
      }
      break;
    } catch (e) {
      if (e instanceof PathError) throw e;
      probe = path.dirname(probe); // parent does not exist yet; check its parent
    }
  }
  return abs;
}

export function toRel(abs: string): string {
  return path.relative(CONTENT_ROOT, abs).split(path.sep).join("/");
}
