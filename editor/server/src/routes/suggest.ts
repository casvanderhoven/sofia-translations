import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  ALL_TAGS,
  type AlignmentSuggestion,
  formatTags,
  GROUP_LABELS,
  hasMorph,
  type MorphAnalysis,
  type MorphSuggestion,
  parseTags,
  type Section,
  type SuggestAlignmentRequest,
  type SuggestAlignmentResponse,
  type SuggestMorphologyRequest,
  type SuggestMorphologyResponse,
} from "@sofia/core";
import { Hono } from "hono";
import { z } from "zod";
import { API_KEY, MODEL } from "../env.ts";
import { morphCache } from "./morph.ts";

export const suggest = new Hono();

const client = () => new Anthropic({ apiKey: API_KEY });

const TAG_VOCAB = [...ALL_TAGS].join(" ");

const MORPH_SYSTEM = `You are a classical philologist annotating Ancient Greek and Latin texts.
For each token you receive its id, surface form and numbered candidate analyses from the Morpheus parser
(lemma + tags). Choose the candidate that fits the sentence, or, when no candidate is right or none is offered,
give your own analysis. Use ONLY these tags: ${TAG_VOCAB}.
Tag meaning: pos = noun verb adj adv pron art prep conj part interj num; case = nom gen dat acc abl voc loc;
number = sg du pl; gender = m f n; tense = pres impf fut aor pf plpf futpf; mood = ind subj opt imp inf ptcp ger gdv supine;
voice = act mid pass mp dep; person = 1 2 3; degree = comp superl. Participles are pos verb + mood ptcp with case/number/gender.
Crasis and elision are already resolved in the candidates. Lemmas in the standard dictionary form, without homonym numbers.
Give a confidence between 0 and 1. Return every token id you were given exactly once.`;

const MorphChoiceSchema = z.object({
  tokens: z.array(
    z.object({
      id: z.string(),
      choice: z
        .number()
        .int()
        .nullable()
        .describe("1-based index of the chosen candidate, or null for an override"),
      override: z.object({ lemma: z.string(), tags: z.array(z.string()) }).nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

const ALIGN_SYSTEM = `You align a classical Greek or Latin original with its English translation, word group by word group.
You receive the original tokens (id, form, lemma, morphology) and the translation tokens (id, form), plus groups that
already exist and are locked. Propose groups for the remaining tokens: each group links one or more original tokens
to the English words that render them. Rules:
- an original token appears in at most one group; a translation token appears in at most one group; never reuse locked tokens;
- groups may be discontinuous (e.g. a noun and its separated adjective);
- articles, particles and connectives may stay ungrouped when the English has no counterpart;
- a translation word may stand alone in a group (original side empty) only when it is a translator's addition, and then label it "other";
- label from the head word of the original group: ${GROUP_LABELS.join(" ")} (case of the head noun/adjective/participle;
  "verb" for finite verbs and infinitives; "adv" for adverbs, prepositions, conjunctions, particles; "other" otherwise);
- an optional short note only when the rendering is free or idiomatic.
Use only the ids given. Give a confidence between 0 and 1 per group.`;

const AlignSchema = z.object({
  groups: z.array(
    z.object({
      label: z.enum(GROUP_LABELS),
      original: z.array(z.string()),
      translation: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      note: z.string().nullable(),
    }),
  ),
});

function unitText(doc: Section): string {
  return doc.original
    .map((u) => `${u.speaker ? `[${u.speaker}] ` : ""}${u.n} ${u.text}`)
    .join("\n");
}

suggest.post("/suggest/morphology", async (c) => {
  if (!API_KEY) return c.json({ error: "ANTHROPIC_API_KEY is not set in .env" }, 503);
  const body = await c.req.json<SuggestMorphologyRequest>().catch(() => null);
  if (!body?.doc) return c.json({ error: "doc required" }, 400);
  const doc = body.doc;
  const wanted = new Set(
    body.tokenIds ??
      doc.tokens.filter((t) => !(t.verified && (t.lemma || hasMorph(t.morph)))).map((t) => t.id),
  );
  const targets = doc.tokens.filter((t) => wanted.has(t.id));
  if (targets.length === 0)
    return c.json({ suggestions: [], model: MODEL } satisfies SuggestMorphologyResponse);

  const candidates = await morphCache.getMany(
    doc.meta.lang,
    targets.map((t) => t.form),
  );
  const lines = targets.map((t) => {
    const cands = candidates.get(t.form) ?? [];
    const list = cands.length
      ? cands.map((a, i) => `${i + 1}) ${a.lemma} ${formatTags(a.morph).join(" ")}`).join(" | ")
      : "(no candidates)";
    return `${t.id} ${t.form}: ${list}`;
  });
  const user = `Text (${doc.meta.lang === "grc" ? "Greek" : "Latin"}, ${doc.meta.form}):\n${unitText(doc)}\n\nTokens:\n${lines.join("\n")}`;

  const message = await client().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: MORPH_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(MorphChoiceSchema), effort: "medium" },
  });
  const parsed = message.parsed_output;
  if (!parsed) return c.json({ error: "model returned no structured output" }, 502);

  const byId = new Map(targets.map((t) => [t.id, t]));
  const suggestions: MorphSuggestion[] = [];
  for (const row of parsed.tokens) {
    const tok = byId.get(row.id);
    if (!tok) continue;
    const cands: MorphAnalysis[] = candidates.get(tok.form) ?? [];
    let lemma: string | undefined;
    let morph = {};
    if (row.choice !== null && cands[row.choice - 1]) {
      const a = cands[row.choice - 1]!;
      lemma = a.lemma;
      morph = a.morph;
    } else if (row.override) {
      const { morph: m, unknown } = parseTags(row.override.tags);
      if (unknown.length) continue;
      lemma = row.override.lemma || undefined;
      morph = m;
    } else continue;
    const s: MorphSuggestion = { id: row.id, morph, confidence: row.confidence, candidates: cands };
    if (lemma) s.lemma = lemma;
    suggestions.push(s);
  }
  return c.json({ suggestions, model: MODEL } satisfies SuggestMorphologyResponse);
});

suggest.post("/suggest/alignment", async (c) => {
  if (!API_KEY) return c.json({ error: "ANTHROPIC_API_KEY is not set in .env" }, 503);
  const body = await c.req.json<SuggestAlignmentRequest>().catch(() => null);
  if (!body?.doc) return c.json({ error: "doc required" }, 400);
  const doc = body.doc;
  if (doc.translationTokens.length === 0)
    return c.json({ error: "write a translation first" }, 400);
  const locked = new Set(body.lockedGroupIds ?? []);
  const lockedGroups = doc.groups.filter((g) => locked.has(g.id));
  const lockedOrig = new Set(lockedGroups.flatMap((g) => g.original));
  const lockedTrl = new Set(lockedGroups.flatMap((g) => g.translation));
  const origIds = new Set(doc.tokens.map((t) => t.id));
  const trlIds = new Set(doc.translationTokens.map((t) => t.id));

  const origLines = doc.tokens
    .filter((t) => !lockedOrig.has(t.id))
    .map(
      (t) =>
        `${t.id} ${t.form}${t.lemma ? ` (${t.lemma}` : ""}${hasMorph(t.morph) ? `${t.lemma ? " " : " ("}${formatTags(t.morph).join(" ")})` : t.lemma ? ")" : ""}`,
    );
  const trlLines = doc.translationTokens
    .filter((t) => !lockedTrl.has(t.id))
    .map((t) => `${t.id} ${t.form}`);
  const lockedLines = lockedGroups.map(
    (g) => `${g.label}: ${g.original.join(" ")} | ${g.translation.join(" ")}`,
  );
  const user = [
    `Original (${doc.meta.lang === "grc" ? "Greek" : "Latin"}):\n${unitText(doc)}`,
    `Translation:\n${doc.translation.map((p) => p.text).join("\n\n")}`,
    `Original tokens still to align:\n${origLines.join("\n")}`,
    `Translation tokens still to align:\n${trlLines.join("\n")}`,
    lockedLines.length ? `Locked groups (do not touch these ids):\n${lockedLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const message = await client().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: ALIGN_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(AlignSchema), effort: "medium" },
  });
  const parsed = message.parsed_output;
  if (!parsed) return c.json({ error: "model returned no structured output" }, 502);

  const usedO = new Set<string>();
  const usedT = new Set<string>();
  const groups: AlignmentSuggestion[] = [];
  for (const g of parsed.groups) {
    const original = g.original.filter(
      (id) => origIds.has(id) && !lockedOrig.has(id) && !usedO.has(id),
    );
    const translation = g.translation.filter(
      (id) => trlIds.has(id) && !lockedTrl.has(id) && !usedT.has(id),
    );
    if (original.length === 0 && translation.length === 0) continue;
    for (const id of original) usedO.add(id);
    for (const id of translation) usedT.add(id);
    const s: AlignmentSuggestion = {
      label: g.label,
      original,
      translation,
      confidence: g.confidence,
    };
    if (g.note) s.note = g.note;
    groups.push(s);
  }
  return c.json({ groups, model: MODEL } satisfies SuggestAlignmentResponse);
});
