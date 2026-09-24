import type {
  ConfigResponse,
  CreateSectionRequest,
  ImportCtsResponse,
  Lang,
  MorphAnalysis,
  Section,
  SectionResponse,
  SuggestAlignmentResponse,
  SuggestMorphologyResponse,
  TreeResponse,
} from "@sofia/core";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export const api = {
  config: () => call<ConfigResponse>("/config"),
  tree: () => call<TreeResponse>("/tree"),
  section: (file: string) => call<SectionResponse>(`/sections/${file}`),
  save: (file: string, doc: Section, etag: string) =>
    call<SectionResponse>(`/sections/${file}`, {
      method: "PUT",
      body: JSON.stringify({ doc, etag }),
    }),
  create: (req: CreateSectionRequest) =>
    call<SectionResponse>("/sections", { method: "POST", body: JSON.stringify(req) }),
  importCts: (urn: string) =>
    call<ImportCtsResponse>("/import/cts", { method: "POST", body: JSON.stringify({ urn }) }),
  morph: (lang: Lang, form: string) =>
    call<MorphAnalysis[]>(`/morph?lang=${lang}&form=${encodeURIComponent(form)}`),
  suggestMorphology: (doc: Section, tokenIds?: string[]) =>
    call<SuggestMorphologyResponse>("/suggest/morphology", {
      method: "POST",
      body: JSON.stringify({ doc, tokenIds }),
    }),
  suggestAlignment: (doc: Section, lockedGroupIds: string[]) =>
    call<SuggestAlignmentResponse>("/suggest/alignment", {
      method: "POST",
      body: JSON.stringify({ doc, lockedGroupIds }),
    }),
};
