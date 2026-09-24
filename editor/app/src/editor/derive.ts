import type { AlignmentGroup, Section } from "@sofia/core";

export interface GroupMaps {
  byOrig: Map<string, AlignmentGroup>;
  byTrl: Map<string, AlignmentGroup>;
}

export function groupMaps(doc: Section): GroupMaps {
  const byOrig = new Map<string, AlignmentGroup>();
  const byTrl = new Map<string, AlignmentGroup>();
  for (const g of doc.groups) {
    for (const id of g.original) byOrig.set(id, g);
    for (const id of g.translation) byTrl.set(id, g);
  }
  return { byOrig, byTrl };
}

/** author/work/chapter slugs from a content-relative section path. */
export function routeFromFile(
  file: string,
): { author: string; work: string; chapter: string } | null {
  const m = /^([^/]+)\/([^/]+)\/chapters\/([^/]+)\/sections\/[^/]+\.md$/.exec(file);
  return m ? { author: m[1]!, work: m[2]!, chapter: m[3]! } : null;
}
