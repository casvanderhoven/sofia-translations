# Sofia — clean-slate rebuild plan

## Context

Sofia (Σοφία) was Cas's 2017–2018 project: a website publishing his own translations of classical Greek and Latin texts next to the original, with a grammar layer (case colouring, hover-linking of word groups between original and translation). Four generations exist in the iCloud archive (two Pollen prototypes, a Bootstrap stub, a Rails 5 app deployed to Heroku). The interaction model was sound; the project stalled because every word's alignment markup had to be hand-written (about 60 lines of Electra were ever finished) and because the infrastructure (Rails + Postgres + Heroku + auth) was oversized for a single author.

The rebuild starts empty in `/Users/casvanderhoven/Sofia/`. Decisions taken with Cas:

- Static public site + a local editor app that writes plain-text files into the git repo. No backend, no DB, no auth. Deployed on Cloudflare Pages at `sofia.casvanderhoven.com`.
- Everything in English (UI and translations). The Dutch Electra translation is discarded.
- Authoring: visual aligner on top of a readable, hand-editable text format.
- Stack: TypeScript, pnpm monorepo. Astro static site; React + Vite editor SPA with a small Hono file API.
- Full morphology per word (lemma, POS, case, number, gender, tense, mood, voice, person, degree) plus alignment groups and optional notes.
- Original texts imported from Perseus/Scaife by CTS URN, manual paste as fallback.
- Assistance: Morpheus for morphology candidates, Claude API for disambiguation and alignment proposals. Everything is a suggestion; translations are Cas's.
- Site scope v1: authors → works → chapters → sections reading view, about page, markdown articles per work. No search or dark mode.
- Seed content and acceptance test: Euripides, Electra 1–53 (Greek) and Livy, Ab urbe condita 1.12 (Latin), fully aligned.
- One-time migration of the old Electra span markup and the Pollen Livy tags as a starting point.
- Visual design left open: Cas will explore it in Claude Design. The site ships with a neutral, tokenised theme; the brief is in §10.

Probes done during planning: the legacy `scaife-cts.perseus.org` CTS endpoint is dead; `https://scaife.perseus.org/library/passage/<urn>/xml/` works and returns clean TEI. Perseids Morpheus is up (`services.perseids.org/bsp/morphologyservice`), Alpheios mirror `morph.alpheios.net` returns the same schema. Node 24 and pnpm 10 are installed; wrangler is not.

## 1. Repo layout and tooling

```
/Users/casvanderhoven/Sofia/
  package.json  pnpm-workspace.yaml  tsconfig.base.json  biome.json  .gitignore  .env.example  .nvmrc
  packages/core/     # @sofia/core — types, tokenizer, parser, serializer, zod, loader, reconcile, cts, morpheus
  site/              # @sofia/site — Astro static site (port 4321)
  editor/app/        # @sofia/editor — Vite + React SPA (port 5173)
  editor/server/     # @sofia/editor-server — Hono on Node, bound to 127.0.0.1:5174
  content/           # all authored data (§2) + committed .cache/
  scripts/           # migrate-legacy.ts, validate-content.ts, import-cts.ts
  .github/workflows/ci.yml
```

- pnpm 10 workspaces, TypeScript 5 with project references, Vitest, Biome (lint + format in one tool).
- Root scripts: `dev` (Astro + Hono + Vite concurrently), `test`, `typecheck`, `lint`, `validate:content`, `migrate:legacy`, `build` (site only).
- Editor file API scoping: server resolves `CONTENT_ROOT` once; every path param is resolved + realpath'd and rejected unless inside `CONTENT_ROOT`, extension `.md`/`.yaml`. Binds to 127.0.0.1 only, requires `Origin: http://localhost:5173` on mutations, atomic writes (tmp + rename). Secrets in root `.env` (gitignored), read only by the server.

## 2. Content format (the key decision)

Rejected: (a) Markdown with inline brackets around every word (unreadable once fully annotated, the 2017 failure mode, and ambiguous for discontinuous many-to-many groups); (c) single YAML/JSON (prose as string arrays, not hand-editable). Runner-up (b) folder of `original.txt` + `translation.txt` + `annotations.json` (clean text, but three files per section and silent desync on hand edits).

**Chosen: one Markdown file per section.** Prose blocks contain no markup at all; annotations live in line-oriented tables referencing tokens by id. Humans edit prose freely; the parser re-anchors ids by diffing token forms. Diffs are one line per token or group.

Path: `content/<author>/<work>/chapters/<nn>-<slug>/sections/<nn>-<slug>.md`, with `author.yaml`, `work.yaml`, `chapter.yaml` alongside.

Worked example (`content/euripides/electra/chapters/01-prologue/sections/01-invocation.md`):

````markdown
---
sofia: 1
title: Invocation of Argos
lang: grc
form: verse
urn: urn:cts:greekLit:tlg0006.tlg012.perseus-grc2:1-3
lines: [1, 3]
source: { edition: "Murray 1913 via Perseus (perseus-grc2)", license: CC-BY-SA-4.0, retrieved: 2026-09-24 }
status: aligned          # draft | aligned | published
next_id: { t: 26, g: 15 }
---

## Original

@ Αὐτουργός
1 ὦ γῆς παλαιὸν ἄργος, Ἰνάχου ῥοαί,
2 ὅθεν ποτ᾽ ἄρας ναυσὶ χιλίαις Ἄρη
3 ἐς γῆν ἔπλευσε Τρῳάδ᾽ Ἀγαμέμνων ἄναξ.

## Translation

@ Farmer
O ancient land of Argos, streams of Inachus, from which king Agamemnon
once raised war with a thousand ships and sailed to the Trojan land.

## Tokens

1.1  ὦ          ὦ           interj
1.2  γῆς        γῆ          n gen sg f
1.3  παλαιὸν    παλαιός     adj voc sg n
1.4  ἄργος      Ἄργος       n voc sg n
2.3  ἄρας       αἴρω        v aor ptcp act nom sg m
3.3  ἔπλευσε    πλέω        v aor ind act 3 sg
~3.4 Τρῳάδ᾽     Τρῳάς       adj acc sg f
…

## Translation tokens

t1 O
t2 ancient
t3 land
…

## Groups

g1   adv   1.1       | t1                 # ὦ → O
g2   voc   1.3 1.4   | t2 t3              # παλαιὸν ἄργος → ancient land
g3   gen   1.2       | t4 t5              # γῆς → of Argos
g8   verb  2.3       | t14   "aor. ptcp, rendered as finite"   # ἄρας → raised
g12  acc   3.2 3.4   | t23 t24 t25        # γῆν Τρῳάδ᾽ → the Trojan land

## Notes

Ἄργος is neuter here (the land), hence the neuter adjective.
````

Rules:

- Frontmatter YAML, fixed key order on serialise. Author/work/chapter are implied by path.
- `## Original`: `@ Name` = speaker change; `<unit> text` starts a unit (verse line number or prose subsection, string); unnumbered lines continue the unit; blank lines ignored.
- `## Translation`: `@ Name` speaker lines; blank line = paragraph; single newline = soft break. No line numbers.
- `## Tokens` (original): `[~]id form lemma tags…`. `~` = unverified (machine or legacy). Lemma `-` if unknown. Tags: closed vocabulary validated by zod, any order in, canonical order out (`pos person number tense mood voice gender case degree`). Vocab: pos `n v adj adv pron art prep conj part interj num`; case `nom gen dat acc abl voc loc`; number `sg du pl`; gender `m f n`; tense `pres impf fut aor pf plpf futpf`; mood `ind subj opt imp inf ptcp ger gdv supine`; voice `act mid pass mp dep`; person `1 2 3`; degree `comp superl`.
- `## Translation tokens`: `tN form`, one per line.
- `## Groups`: `gN label origIds | trlIds ["note"] # auto-comment`. Label ∈ `nom gen dat acc abl voc adv verb other`. Either side may be empty. Text after `#` is regenerated on save. Sorted by first original token position.
- **Token identity.** Original tokens: positional `unit.index` (word tokens only; the original rarely changes). Translation tokens: opaque monotonic `tN` from `next_id` (never reused), because the translation is edited constantly. **Reconcile on load:** re-tokenise both blocks, Myers-diff the form sequence against the stored tables; equal runs keep ids, inserts get new ids, deletes drop out of groups with a warning. Makes hand edits and editor edits equally safe.
- **Tokenisation** (`packages/core/src/tokenize.ts`, NFC first): split on whitespace; peel leading/trailing punctuation into `pre`/`post` (punctuation never gets an id); elision marks `᾽ ʼ ’ '` stay on the word; crasis (`κἀκεῖ`) and Latin enclitics (`Capitolinumque`) are one token with lemma `καί+ἐκεῖ` / `Capitolinus+que`; hyphenated English is one token; Perseus `:` as ano teleia is `post`. Macrons stripped for lookup, kept in form.

## 3. `packages/core`

`src/types.ts`: `Author`, `Work {lang: 'grc'|'lat', urnBase, source}`, `Chapter {range, sections}`, `Section {meta, original: Unit[], translation: Paragraph[], tokens: Token[], translationTokens: TrlToken[], groups: AlignmentGroup[], notes?}`, `Unit {n, speaker?, text}`, `Token {id, form, pre?, post?, lemma?, morph: Morphology, verified}`, `Morphology`, `TrlToken {id, form}`, `AlignmentGroup {id, label, original[], translation[], note?}`.

Modules: `tokenize.ts`, `parse.ts` (+ `reconcile()`), `serialize.ts` (canonical; property test `serialize(parse(x)) === x`), `schema.ts` (zod: frontmatter, tags, ids, referential integrity — every id exists, no token in two groups), `morph-tags.ts` (vocab, canonical order, human-readable expansion for glosses), `loader.ts` (`loadContentTree(root)` used by Astro and the server), `diff.ts`, `cts.ts` (TEI → units), `morpheus.ts` (response normaliser).

## 4. Site (Astro)

- Routes: `index`, `authors/[author]`, `authors/[author]/[work]` (chapters with line ranges, articles, source attribution), `authors/[author]/[work]/[chapter]` (reading view), `authors/[author]/[work]/articles/[slug]`, `about`. `getStaticPaths` from `loadContentTree('../content')`; articles and about via content collection with the glob loader pointed at `../content`.
- `src/components/Section.astro`: `<section id="s{nn}">`, header, two columns. Original renders units as `<div class="unit" id="l5"><span class="ln">5</span><span class="tok" data-id="2.3" data-g="g8" data-label="verb" data-gloss="αἴρω · aor. ptcp. act. nom. sg. m.">ἄρας</span>…</div>` with `lang="grc"`/`"la"`; translation renders paragraphs with `<span class="tok" data-g="g8">`. Speaker names in both columns. `Legend` component with the 8 labels. Chapter page: sticky section nav (line-range chips), prev/next chapter.
- Interactivity: one vanilla `src/scripts/reader.ts` (~150 lines, delegated events): structure toggle adds `.structure` on `<main>` (localStorage); `mouseover` on `[data-g]` highlights all `[data-g=gN]` in the section; click pins (Escape clears); one shared tooltip from `data-gloss` + group note. Works without JS.
- Deep links `#s03`, `#l17` with `:target` styling.
- Theming: `src/styles/tokens.css` holds every visual value as a custom property (`--bg --fg --muted --accent --font-grc --font-lat --font-en --font-ui --label-nom … --label-verb --measure --space-1..8 --radius`). Neutral defaults: self-hosted Gentium Plus for Greek/Latin, system serif for English. The Claude Design output replaces `tokens.css` and fonts only.
- `astro build` → fully static `site/dist`.

## 5. Editor app

Stack: React (richer ecosystem for complex selection/keyboard UIs), Vite, zustand + zundo (undo/redo), TanStack Query. Hono with `@hono/node-server`.

Screens:

1. **Library** (`/`): tree from `GET /api/tree` with status chips (draft/aligned/published, % verified, % aligned). New section, Import from CTS.
2. **Section editor** (`/edit/<path>`), three panes:
   - Original: units with line numbers; tokens as chips coloured by group label; unaligned tokens dotted underline; `~` tokens amber dot.
   - Translation: *write* mode (textarea) and *align* mode (tokens), toggled with `E`; leaving write mode runs `reconcile()` and reports remapped/orphaned tokens.
   - Inspector: selected token (form, Morpheus candidates as radios, editable morphology fields, lemma, Verified) or selected group (label 1–8, note, members), plus the suggestion queue.
   - Status bar: validation errors, counts, dirty flag, last saved.
3. **Import from CTS** modal: URN → preview units (verse/prose auto-detected) → choose chapter, number, slug, title → creates file. Manual paste tab: one unit per line prefixed with its number.

Keyboard: click/drag or Shift-click select; Cmd-click for discontinuous; `Tab` switch pane; `Enter` create group from both selections, label auto-suggested from head morphology (case → label, verb → verb, adv/prep/conj/part → adv); `1–8` set label; `N` note; `Backspace` ungroup; `]`/`[` next/prev unaligned token; `V` verified; `A`/`X` accept/reject suggestion, `Shift+A` accept all; `Cmd+Z`/`Shift+Cmd+Z`; `Cmd+S` save; `P` preview at `http://localhost:4321/authors/<a>/<w>/<chapter>#s<nn>`.

API (`editor/server/src/routes/*.ts`):

| Endpoint | Purpose |
|---|---|
| `GET /api/tree` | Content tree with status |
| `GET /api/sections/*path` | `{ doc, raw, warnings, etag }` (parsed + reconciled) |
| `PUT /api/sections/*path` | `{ doc, etag }` → zod validate, canonical serialise, atomic write; 409 on etag mismatch |
| `POST /api/sections` | Create from `{ chapterPath, number, slug, meta, units }` |
| `POST /api/import/cts` | `{ urn }` → `{ form, units[], source }` |
| `GET /api/morph?lang=&form=`, `POST /api/morph/batch` | Cached Morpheus analyses, normalised |
| `POST /api/suggest/morphology` | `{ doc }` → per-token choice/confidence |
| `POST /api/suggest/alignment` | `{ doc, lockedGroupIds }` → proposed groups |
| `GET /api/config` | Model, key present, Astro URL |

`.env`: `ANTHROPIC_API_KEY`, `SOFIA_MODEL=claude-sonnet-5` (toggle to `claude-opus-5-5` in the inspector), `MORPH_BASE_URL` (Perseids default, Alpheios fallback), `ASTRO_URL`. `.env.example` committed.

CTS import (`packages/core/src/cts.ts`): fetch `https://scaife.perseus.org/library/passage/<urn>/xml/`, parse with `fast-xml-parser`, walk `TEI/text/body`; verse: `l[@n]` in order respecting `sp`; prose: `div[@subtype=section][@n]` → `p`; drop `note pb milestone del`, keep `add supplied`; collapse whitespace; NFC; record `source`. Speaker names are not in passage slices, so the editor prompts for them (`@` lines). Fallback: raw TEI from `raw.githubusercontent.com/PerseusDL/canonical-{greek,latin}Lit`.

## 6. Assistance pipeline

- **Morpheus:** `GET {MORPH_BASE_URL}/analysis/word?lang=grc|lat&engine=morpheusgrc|morpheuslat&word=<NFC>` with `Accept: application/json`; normalise `Body[].rest.entry` (`dict.hdwd` → lemma, `dict.pofs`, each `infl`) into `MorphAnalysis[]` via a mapping table. Retry with ASCII apostrophe, then without elision. Concurrency 2, 200 ms spacing, backoff on 5xx/429. Cache in `content/.cache/morpheus/{grc,lat}.jsonl` keyed by form, sorted on write, **committed** (CI and editor work offline).
- **Disambiguation (Claude):** one call per section, `client.messages.parse` + `zodOutputFormat(MorphChoiceSchema)`, adaptive thinking, medium effort. Input: section text with unit numbers, then per token `id form` and numbered candidates; tokens without candidates get a full analysis request. Output `{ tokens: [{ id, choice, override?: { lemma, tags }, confidence }] }`. Server validates ids and tags; results written as `~` unverified; confidence shown only in the UI.
- **Alignment (Claude):** input original tokens `id form lemma tags`, translation tokens `id form`, locked groups, label vocabulary and rules (token in at most one group; discontinuous allowed; particles may be skipped; label from head morphology). Output `{ groups: [{ label, original[], translation[], confidence, note? }] }`. Server drops groups with unknown ids or overlapping locked tokens. Proposals render dashed until accepted. Static system prompt with `cache_control`.
- Nothing is written to disk until the user saves.

## 7. Migration script (`scripts/migrate-legacy.ts`)

Offline, deterministic, idempotent; regenerates `content/euripides/**` and `content/livy/**` seeds.

- **Electra** from `…/4 Archive/Classical Translations/Elektra.html`: lines without `<span` and only Greek letters = speaker; blank line = section boundary (13 stanza sections: 1–3, 4–7, 8–10, 11–13, 14–18, 19–21, 22–24, 25–28, 29–30, 31–39, 40–44, 45–49, 50–53); each non-empty line increments the verse counter, `<span class="line">N</span>` re-syncs and asserts. Tolerant span regex (handles `class=acc 33"`). Group key = `(label, index)`; same key merges into one discontinuous group. Label → morphology: `nom/gen/dat/acc/voc` set `case`; `verb` sets `pos: v`; `adv` sets nothing. All tokens `~`. Stop after line 53. Translations empty. `Elektra_translated.html` not read (not Cas's translation).
- **Livy 1.12** from `…/4 Archive/Sofia/files/ab-urbe-condita-book-1-chapter-12.html.pm`: small recursive `◊name[attrs]{body}` parser; `◊lineog{N}` sets unit; each tagged span → its own group with `~` case morphology; translations discarded. Produces sections 01 and 02; subsections 3–10 imported via `scripts/import-cts.ts` (same core code as the editor endpoint).
- Also writes `author.yaml`, `work.yaml` (Perseus attribution), `chapter.yaml`. Snapshot test against copies of the legacy files in `scripts/fixtures/`.

## 8. Deployment and CI

- Cloudflare Pages via git integration: root `/`, build `pnpm install --frozen-lockfile && pnpm --filter @sofia/site build`, output `site/dist`, `NODE_VERSION=24`. Custom domain `sofia.casvanderhoven.com` (CNAME to `<project>.pages.dev` if the zone is not on Cloudflare). Wrangler as manual escape hatch only.
- CI (`.github/workflows/ci.yml`): install → lint → typecheck → test → `validate:content` (every section parses, zod, referential integrity; fails on orphaned ids; warns on `~` tokens in `published` sections) → site build. Committed cache means no network in CI.

## 9. Milestones

| | Deliverable | Acceptance |
|---|---|---|
| **M0 Scaffold** | Workspace, Biome, tsconfig refs, empty packages, CI, Pages project | `pnpm dev` starts three servers; CI green; preview URL serves a page |
| **M1 Core format** | tokenize, parse, serialize, zod, reconcile, loader, validate-content, migrate-legacy | Round-trip tests pass; `pnpm migrate:legacy && pnpm validate:content` yields 15 valid sections; inserting a word in a translation by hand keeps all other group links |
| **M2 Reading site** | Routes, Section component, reader script, legend, tokens.css, deep links | Electra 1–53 and Livy 1.12.1–2 render two-column; toggle colours; hover links across columns; `#l5` scrolls; static build; Lighthouse a11y ≥ 95 |
| **M3 Editor MVP** | Library, section editor, manual grouping, morphology inspector, undo, save, preview | Aligning one Electra section by keyboard < 10 min; `git diff` after save touches only intended lines; 409 on concurrent edit |
| **M4 Import + assistance** | CTS import, Morpheus cache, suggest morphology, suggest alignment, accept/reject | Import `…perseus-lat2:1.12.3-1.12.10` creates sections; morphology fills ≥ 90% of tokens; alignment proposal accepted with ≤ 30% edits; **seed acceptance:** Electra 1–53 and Livy 1.12 fully aligned, all tokens verified, translations written by Cas |
| **M5 Publish** | About, articles, author/work pages with attribution, design tokens from Claude Design, custom domain | `sofia.casvanderhoven.com` live; CI validates content on every push; one article per work |

## 10. Claude Design brief (paste-ready)

Plan mode blocks launching it now. After approval I can start it via the Artifact design quickstart, or Cas pastes this:

```
I am designing "Sofia" (Σοφία), a personal website that publishes my own English
translations of classical Greek and Latin texts side by side with the original.
Everything is in English. No accounts, no comments, no dark mode in v1. Please
propose a design system and the key screens described below.

PRODUCT
- Content hierarchy: Author → Work → Chapter → Section. A chapter page is the
  main reading experience: a sequence of sections, each a two-column block
  (original left, English right) with the section title above both columns.
- Original text is verse (Euripides, numbered lines) or prose (Livy, numbered
  subsections). Numbers sit in the margin of the original column. Speaker names
  appear above speeches in both columns.
- Grammar layer: a "Show structure" toggle colours every word by one of eight
  labels: nominative, genitive, dative, accusative, ablative, vocative,
  adverbial, verb. A small legend explains the colours. The eight colours must
  stay distinguishable for colour-blind readers (pair colour with an
  underline/marker style) and meet AA contrast on the page background.
- Hovering a word (or word group) highlights the linked words in the other
  column; clicking pins the highlight; a small tooltip shows the dictionary
  form and grammatical analysis (e.g. "αἴρω · aorist participle, active,
  nominative singular masculine") plus an optional translator's note.
- Other pages: home (authors/works), author page, work page (chapters with line
  ranges, essays, attribution "Text: Perseus Digital Library, CC BY-SA 4.0"),
  essay page (long-form markdown), about page (my translation philosophy:
  translate the soul of the text, slightly liberal, not word-for-word; the
  grammar layer makes the structure visible so the prose can be free).

TYPOGRAPHY NEEDS
- Three scripts on one page: polytonic Greek (breathings, accents, iota
  subscript), Latin, and English. Propose a Greek face, a Latin/English face,
  and a UI face that harmonise; prefer open-licence fonts I can self-host.
  Reading measure and line height for parallel columns matter most.
- Columns must stack gracefully on narrow screens (original above translation
  per section), keeping hover/pin behaviour usable via tap.

DELIVERABLES
1. Design system: palette (including the eight label colours + hover/pinned
   states), type scale, spacing, component styles (section block, line number,
   speaker label, legend, toggle, tooltip, nav).
2. Key screens: home, work page, chapter reading view in four states (default,
   structure on, hover-linked, pinned with tooltip), essay page, about page,
   mobile reading view.
3. Export tokens as CSS custom properties with these names:
   --bg --fg --muted --accent --font-grc --font-lat --font-en --font-ui
   --label-nom --label-gen --label-dat --label-acc --label-abl --label-voc
   --label-adv --label-verb --measure --space-1..--space-8 --radius.
Tone: scholarly but warm, quiet, unhurried; not a database UI, not a startup
landing page.
```

## 11. Risks and open questions

- **Morpheus availability:** best-effort academic service. Mitigations in order: Alpheios mirror via `MORPH_BASE_URL`; committed cache; Claude-only analysis flagged low-confidence. No Python sidecar unless both HTTP services die.
- **Scaife stability:** CTS API host already gone; keep GitHub TEI fallback and paste fallback. Import is one-time per section.
- **Speakers not in passage slices:** editor supports `@` speaker lines; migration supplies them for Electra.
- **Licensing:** Perseus texts CC BY-SA 4.0, attributed on every work page. Open: licence for Cas's own translations.
- **Greek rendering:** NFC + a real polytonic font (Gentium Plus, Cardo, GFS Didot, EB Garamond); test `ᾤ ῥ ΐ` and the elision mark early; `lang="grc"`.
- **LLM output hygiene:** structured outputs + server-side id validation; Claude never writes files.
- **Open:** section granularity for prose works (sentence vs paragraph); whether translations ever get their own verse lineation; whether `loc`/dual get legend colours.

## Verification

- `pnpm test` (core round-trip and reconcile tests, migration snapshot), `pnpm typecheck`, `pnpm lint`, `pnpm validate:content` all green.
- `pnpm dev`, open `http://localhost:4321/authors/euripides/electra/01-prologue`: two columns, toggle, hover, `#l5`.
- Open `http://localhost:5173`, align one Electra section by keyboard, save, confirm `git diff` is minimal, reload and confirm state persists.
- Import Livy `1.12.3-1.12.10` via URN, run morphology + alignment suggestions, accept, save, validate.
- Push; CI green; Cloudflare preview renders; custom domain resolves.

## Critical files

- `packages/core/src/parse.ts`, `serialize.ts`, `tokenize.ts` — the format contract
- `site/src/components/Section.astro`, `site/src/scripts/reader.ts`, `site/src/styles/tokens.css`
- `editor/server/src/routes/suggest.ts` — Morpheus + Claude endpoints
- `scripts/migrate-legacy.ts` — seed content

---

## Implementation notes (24 Sep 2026)

Deviations from the plan above, decided during the build:

- **Part-of-speech tags are spelled out** as `noun verb adj adv pron art prep conj part interj num` instead of `n v …`, because `n` collided with neuter gender in the any-order tag list.
- **Tokens carry offsets, not `pre`/`post` strings.** Each token stores `start`/`end` into its unit or paragraph text; punctuation and spacing are whatever lies between tokens. The renderer slices the text, so nothing is ever reconstructed.
- **The `## Tokens` table lists every original token**, analysed or not (lemma `-`, no tags), so ids are always visible when hand-editing. `~` marks an analysis that is not yet verified; a bare row with no lemma and no tags is simply unanalysed.
- **Astro resolves the content root in `astro.config.mjs`** and passes it in as a build-time define, because Vite bundles the server code and `import.meta.url` no longer points at the source tree.
- **Astro 7 backgrounds its dev server when it detects an agent.** In a normal terminal `pnpm dev` runs all three servers in the foreground as planned.
- **Biome ignores `.astro` files** (`astro check` covers them); it only saw frontmatter and reported template-only imports as unused.
- **Scaife's elision mark is U+02BC (ʼ), the 2017 files use U+1FBD (᾽).** The tokenizer treats both as part of the word; content is not normalised between them yet.
- **Morpheus cache and content live together**: `content/.cache/morpheus/{grc,lat}.jsonl`, committed, sorted on every write.
- **Claude suggestions require `ANTHROPIC_API_KEY` in `.env`**; without it the two Suggest buttons are disabled and the rest of the editor works offline (Morpheus lookups still go to the network).

Status at the end of the first session: M0–M3 complete, M4 built but untested against the live Claude API (no key in `.env`), M5 not started (no deployment yet, no articles written). Design canvas with three starting directions: https://claude.ai/artifact/9ApmSjKT9LtFHQdft7EsJH

**Design decision (24 Sep 2026):** Cas chose direction C, "Blend" (modern shell in IBM Plex Sans, Fraunces display, Source Serif 4 for Greek/Latin/English, warm white ground, tinted highlights with coloured underlines). Next step: iterate on the canvas, then export its tokens into `site/src/styles/tokens.css`.

**Applied (24 Sep 2026):** Blend tokens are in `site/src/styles/tokens.css` and the fonts are loaded in `Base.astro`. Licence decided: translations, annotations and essays CC BY-SA 4.0 (`content/LICENSE.md`), code MIT (`LICENSE`). Repository: https://github.com/casvanderhoven/sofia-translations (the 2017 Rails app keeps `casvanderhoven/sofia`).

**Deployment (24 Sep 2026):** Cloudflare Pages project `sofia-translations` (direct upload; wrangler's new Workers delegation refuses monorepo roots, so the project was created with `--force`). Production URL https://sofia-translations.pages.dev, custom domain `sofia.casvanderhoven.com` attached; DNS CNAME `sofia` → `sofia-translations.pages.dev` (proxied) added 24 Sep 2026, site live at https://sofia.casvanderhoven.com. `pnpm deploy` builds and uploads with the local wrangler login. `.github/workflows/deploy.yml` deploys on push to main once `CLOUDFLARE_API_TOKEN` (Pages: Edit) is set as a repo secret; `CLOUDFLARE_ACCOUNT_ID` is already set.
