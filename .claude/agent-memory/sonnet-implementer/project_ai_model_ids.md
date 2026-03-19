---
name: ai-model-ids project context
description: Architecture, key decisions, and structure of the ai-model-ids project
type: project
---

Bun + TypeScript static-site generator that fetches model IDs from 9 AI providers and produces a searchable HTML page deployed to GitHub Pages daily.

**Why:** Developer reference for AI model ID strings across providers — no existing tool offers raw IDs in a browsable, auto-updated HTML page.

**How to apply:** Use this context when modifying the pipeline, adding providers, or updating the UI.

## Architecture
- `src/main.ts` — pipeline orchestrator: cache load → aggregate → diff → generate → write to `dist/`
- `src/aggregator.ts` — runs all fetchers via Promise.allSettled, falls back to cached provider entries on failure
- `src/differ.ts` — compares current vs previous using `provider::id` composite key
- `src/generator.ts` — XSS-safe tagged template literal (`html`...) + `raw()` escape hatch; outer `generate()` uses plain template string with pre-built HTML fragments (NOT `html` tag)
- `src/fetchers/` — 5 API fetchers (OpenAI, Google, Mistral, DeepSeek, xAI) + `yaml.ts` generic reader for Anthropic/Moonshot/Alibaba/Zhipu
- `data/` — curated YAML files for providers without usable listing APIs

## Key constraint
The outer `generate()` function uses a plain template literal (not `html` tagged). Pre-built HTML fragment strings must be interpolated directly, not wrapped in `raw()`. The `html` tag + `raw()` pattern is only for sub-component helpers (renderDesktopRow, renderChangeEntry, etc.).

## Test approach
Fetcher tests use `global.fetch = mock(...) as unknown as typeof fetch` (cast needed for TS). Fixtures live in `tests/fixtures/`.

## Run commands
- `bun test` — all tests
- `bun run typecheck` — tsc --noEmit
- `bun run src/main.ts` — run full pipeline (needs API keys in .env)
