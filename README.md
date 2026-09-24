# Sofia (Σοφία)

English translations of classical Greek and Latin texts, side by side with the original, with a per-word grammar layer.

- `site/` — Astro static site (public reading experience)
- `editor/` — local editor app (React) + file API (Hono) for writing and aligning translations
- `packages/core/` — content format: tokenizer, parser, serializer, validation
- `content/` — all texts, translations and annotations (plain Markdown, versioned here)
- `scripts/` — migration, validation, CTS import
- `docs/SPEC.md` — the full specification

```bash
pnpm install
cp .env.example .env      # add ANTHROPIC_API_KEY to enable the Suggest buttons
pnpm dev                  # site :4321, editor :5173, file API :5174
pnpm test
pnpm validate:content     # parses and checks every section under content/
pnpm migrate:legacy       # regenerates the 2017 seed sections (idempotent)
```

Editing flow: open http://localhost:5173, pick a section, press `E` to write the translation, click a word on each side, press `Enter` to link them, `1`–`9` to relabel, `⌘S` to save. The file under `content/` is the source of truth and stays hand-editable; see `docs/SPEC.md` §2 for the format.

## Licence

Code: MIT (see `LICENSE`). Translations, annotations and essays under `content/`: CC BY-SA 4.0 (see `content/LICENSE.md`). Original Greek and Latin texts: Perseus Digital Library, CC BY-SA 4.0.
