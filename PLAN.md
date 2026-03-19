# AI Model IDs — Project Plan

> The canonical developer reference for AI model IDs across all major providers.
> One searchable page. Auto-refreshed daily. Copy-paste ready.

## Problem

Every developer building multi-provider AI apps has to dig through 5+ separate docs sites
to find the exact model ID string. The docs are often buried, inconsistent, and change without
notice. No existing tool provides a simple, browsable HTML page with raw provider model IDs.

## Competitive Landscape

| Tool | What it does | Gap |
|------|-------------|-----|
| Model-ID-Cheatsheet | MCP server, 19 providers, daily auto-update | No HTML page — MCP only |
| LiteLLM Models | 2600+ models on website | Uses LiteLLM format, not raw IDs |
| OpenRouter | 400+ models, browsable | Uses OpenRouter-specific IDs |
| AIML API Docs | Model ID listing | Documentation format, not auto-updated |

## Accepted Scope (v1)

- **Searchable & filterable UI** — instant search, filter by provider/capabilities/context window
- **Copy-to-clipboard** on every model ID
- **Model changelog/diff view** — "What's New" section showing daily changes
- **JSON API endpoint** — `/api/models.json` for programmatic access
- **Hybrid data sourcing** — provider APIs where available + curated YAML for the rest
- **GitHub Pages + Actions** — free hosting, daily cron job
- **Local dev experience** — `bun run dev` to run pipeline + serve locally

## Providers (v1)

1. OpenAI
2. Anthropic (Claude)
3. Google (Gemini)
4. Mistral
5. DeepSeek
6. xAI (Grok)
7. Moonshot (Kimi)
8. Alibaba (Qwen)
9. Zhipu (GLM)

> Meta (Llama) deferred — no direct API, model IDs vary by hosting provider. See TODOS.md.

## Model Metadata

Per model entry (defined as Zod schema in `src/types.ts`, TypeScript type inferred):

```typescript
// src/types.ts
import { z } from 'zod';

export const ModelEntrySchema = z.object({
  id: z.string(),              // raw model ID string (e.g., "claude-sonnet-4-20250514")
  provider: z.string(),        // provider name
  name: z.string().optional(), // human-readable display name
  capabilities: z.array(z.string()), // ["text", "image", "audio", "video", "embedding"]
  contextWindow: z.number().optional(),
  status: z.enum(['live', 'deprecated', 'preview']),
});

export type ModelEntry = z.infer<typeof ModelEntrySchema>;
export type Fetcher = () => Promise<ModelEntry[]>;
```

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Validation:** Zod (runtime schema validation for all external data)
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Hosting:** GitHub Pages (artifact deploy via `actions/deploy-pages`)
- **CI/CD:** GitHub Actions (daily cron)
- **Data format:** JSON (models.json) + YAML (curated providers)

## API Key Management

Each API-based fetcher reads credentials from environment variables:

| Provider | Env Var |
|----------|---------|
| OpenAI | `OPENAI_API_KEY` |
| Google | `GOOGLE_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| xAI | `XAI_API_KEY` |

- **CI:** GitHub Secrets → env vars in workflow
- **Local:** `.env` file (gitignored), `.env.example` shipped with all required keys
- **Rule:** Never hardcode keys. Fetchers read from `process.env` only.

## Architecture

```
GitHub Actions (Daily Cron)
├── Step 0: Download live models.json → cache
│   └── Serves as: error recovery fallback + differ baseline
├── Step 1: Fetcher Scripts (9 providers, parallel via Promise.allSettled)
│   ├── API-based: OpenAI, Google, Mistral, DeepSeek, xAI
│   │   └── Auth: process.env.{PROVIDER}_API_KEY
│   │   └── Timeout: 15s per fetcher (AbortController)
│   └── YAML-based: Anthropic, Kimi, Qwen, Zhipu
│   │   └── Single generic reader: src/fetchers/yaml.ts
│   └── All return: ModelEntry[] via shared Fetcher type
│       └── capabilities: string[] (not single type)
│       └── Validated with Zod at parse time
├── Step 2: Aggregator: merge all → models.json
│   └── On per-provider failure: use cached entries for that provider
│   └── On ALL fail: abort, keep old page live
├── Step 3: Differ: models.json vs cached → changelog.json
│   └── No cache (first run)? Treat all as "added"
├── Step 4: Generator: models.json + changelog.json → index.html
│   └── Tagged template literals with auto-escaping (XSS safe)
└── Step 5: Deploy via actions/upload-pages-artifact
    └── dist/ never committed to source branch
```

## Project Structure

```
ai-model-ids/
├── src/
│   ├── types.ts              # Zod schemas + ModelEntry type + Fetcher type
│   ├── fetchers/
│   │   ├── openai.ts         # API-based fetcher
│   │   ├── google.ts
│   │   ├── mistral.ts
│   │   ├── deepseek.ts
│   │   ├── xai.ts
│   │   └── yaml.ts           # Generic YAML fetcher (Anthropic, Kimi, Qwen, Zhipu)
│   ├── aggregator.ts         # Merge fetcher results + error recovery
│   ├── differ.ts             # Compare today vs yesterday → changelog
│   ├── generator.ts          # HTML generation with auto-escaping
│   └── main.ts               # Orchestrator
├── data/
│   ├── anthropic.yaml        # Curated model data
│   ├── kimi.yaml
│   ├── qwen.yaml
│   └── zhipu.yaml
├── dist/                     # Generated (gitignored)
│   ├── index.html
│   ├── models.json
│   └── changelog.json
├── tests/
│   ├── fetchers/             # One test per API fetcher
│   │   ├── openai.test.ts
│   │   ├── google.test.ts
│   │   ├── mistral.test.ts
│   │   ├── deepseek.test.ts
│   │   └── xai.test.ts
│   ├── fixtures/             # Recorded real API responses
│   │   ├── openai-models.json
│   │   ├── google-models.json
│   │   ├── mistral-models.json
│   │   ├── deepseek-models.json
│   │   └── xai-models.json
│   ├── aggregator.test.ts    # Error recovery, partial/total failure
│   ├── differ.test.ts        # Add/remove/modify, no-baseline bootstrap
│   ├── generator.test.ts     # HTML escaping, template correctness
│   ├── validation.test.ts    # Zod schema accepts/rejects edge cases
│   └── main.test.ts          # Orchestration, abort guard
├── .github/
│   └── workflows/
│       └── update.yml        # Daily cron job
├── .env.example              # Required env vars template
├── .gitignore                # Includes dist/, .env
├── package.json
├── tsconfig.json
└── README.md
```

## Error Handling Strategy

- Each fetcher is isolated — if one provider's API fails, others still update
- **Timeout:** Every API fetch has a 15s timeout via `AbortController`
- **Fallback:** On failure, use that provider's entries from the cached `models.json` (downloaded at Step 0)
- **Cache corruption:** If cached `models.json` is invalid JSON, treat as "no cache" (no fallback, provider is omitted)
- **Total failure:** If ALL providers fail AND no cache exists, abort generation entirely
- **First run:** No cache = no fallback. All fetchers must succeed on first deployment.
- **XSS prevention:** Tagged template literal with auto-escaping for all interpolated values
- **Schema validation:** Zod validates every API response and YAML parse result at runtime

## UI Specification

### Visual Identity

Terminal/monospace reference aesthetic. Feels like a well-designed man page, not a SaaS landing page.

```
DESIGN TOKENS:
──────────────
Typography:
  Model IDs:  JetBrains Mono / monospace, 14px
  UI text:    system-ui, -apple-system, sans-serif, 14px
  Headers:    system-ui, 600 weight

Colors:
  Text:       #1a1a1a
  Background: #fafafa
  Alt row:    #f5f5f5
  Borders:    #e5e5e5
  Link:       #0066cc

Status badges:
  Live:       #22c55e (green)
  Preview:    #f59e0b (amber)
  Deprecated: #ef4444 (red)

Provider brand colors (dot only):
  OpenAI:     #10a37f
  Anthropic:  #d97757
  Google:     #4285f4
  Mistral:    #f7d046
  DeepSeek:   #4d6bfe
  xAI:        #000000
  Moonshot:   #6366f1
  Alibaba:    #ff6a00
  Zhipu:      #2563eb

Spacing: 8px base unit, 4px grid
Borders: 1px solid #e5e5e5

ANTI-PATTERNS (never use):
  ✗ Gradients        ✗ Box shadows       ✗ Rounded cards
  ✗ Hero sections    ✗ Illustrations     ✗ Purple/blue accents
  ✗ Inter font       ✗ Card grids        ✗ Marketing copy
```

### Page Layout (Desktop, ≥1024px)

Search-first hierarchy. The search bar is the dominant element.

```
+--------------------------------------------------+
|  AI Model IDs                          [GitHub ↗] |
+--------------------------------------------------+
|                                                    |
|  [========= Search models... ============]  [/]   |
|                                                    |
|  Provider: [All ▾]   Capabilities: [All ▾]         |
|  Status:   [All ▾]   Context Window: [Any ▾]       |
|                                                    |
|  Showing 847 models from 9 providers               |
|  Data refreshed: Mar 19, 2026                      |
+--------------------------------------------------+
| ⎘ │ Model ID             │ Provider  │ Caps     │ Context │ Status  |
|---|----------------------|-----------|----------|---------|---------|
| ⎘ │ gpt-4o-2024-11-20   │ ● OpenAI  │ text img │ 128K    │ ● live  |
| ⎘ │ gpt-4o-mini         │ ● OpenAI  │ text img │ 128K    │ ● live  |
| ⎘ │ claude-sonnet-4-2025 │ ● Anthro  │ text img │ 200K    │ ● live  |
| ⎘ │ gemini-2.0-flash     │ ● Google  │ text img │ 1M      │ ● live  |
|   │                      │           │ aud vid  │         │         |
| ⎘ │ mistral-large-latest │ ● Mistral │ text     │ 128K    │ ● live  |
|   │  ... (all models)    │           │          │         │         |
+--------------------------------------------------+
|  What's New (last 7 days)                          |
|  + deepseek-r2  (added Mar 18)   DeepSeek          |
|  ~ gpt-4o context 128K→256K (modified Mar 17)      |
|  - gpt-4-turbo  (deprecated Mar 16)   OpenAI       |
+--------------------------------------------------+

Column headers are clickable → sort ascending/descending
[/] = keyboard shortcut hint: press / to focus search
● = colored dot (provider brand color or status color)
⎘ = copy button (always visible, no hover required)
```

### Table Row Detail

```
Each row — flat, no expand/collapse on desktop:
+---+----------------------+----------+------------+--------+--------+
| ⎘ | gpt-4o-2024-11-20    | ● OpenAI | text img   | 128K   | ● live |
+---+----------------------+----------+------------+--------+--------+

⎘ = copy button
  - Click → icon changes to ✓ + "Copied!" tooltip (1.5s), then reverts
  - Keyboard: Enter when row is focused
Model ID: monospace font (JetBrains Mono)
Provider: brand-colored dot + name
Capabilities: small rounded tags (subtle bg)
Context: human-readable (128K, 200K, 1M)
Status: colored dot + text
```

### Mobile Layout (<640px)

2-column with progressive disclosure.

```
+----------------------------------+
| AI Model IDs            [≡]      |
+----------------------------------+
| [====== Search... =========]     |
| Provider:[All ▾] Status:[All ▾]  |
+----------------------------------+
| Showing 847 models               |
+----------------------------------+
| ⎘ gpt-4o             ● OpenAI   |
| ⎘ gpt-4o-mini        ● OpenAI   |
| ⎘ claude-sonnet-4     ● Anthro   |
|   ▼ (tapped to expand)           |
|   Caps: text, image              |
|   Context: 200K │ Status: live   |
| ⎘ gemini-2.0-flash   ● Google   |
+----------------------------------+
| What's New (last 7 days)         |
| + deepseek-r2 (added Mar 18)    |
+----------------------------------+

Mobile-specific:
- Only Model ID + Provider visible in collapsed row
- Tap row to expand: capabilities, context, status
- Copy button (⎘) always visible, 44×44px touch target
- Filters collapse into [≡] hamburger menu
- Search bar always visible (not collapsed)
```

### Interaction States

```
FEATURE              | LOADING          | EMPTY                    | ERROR            | SUCCESS
---------------------|------------------|--------------------------|------------------|------------------
Page load            | Skeleton table   | N/A (always has data)    | "Unable to load  | Full table renders
                     | (gray bars)      |                          |  model data."    |
Search               | Instant (<100ms) | "No models match         | N/A (client-side)| Filtered table +
                     | No spinner needed|  '[query]'. Try a        |                  | updated count
                     |                  |  broader search."        |                  |
Filter               | Instant          | "No [provider] models    | N/A (client-side)| Filtered table +
                     |                  |  match your filters.     |                  | updated count
                     |                  |  [Clear filters]"        |                  |
Copy to clipboard    | N/A              | N/A                      | "Copy failed.    | ✓ icon + "Copied!"
                     |                  |                          |  Select & copy   | tooltip (1.5s)
                     |                  |                          |  manually."      |
What's New           | N/A (static HTML)| "No changes in the       | N/A              | Changelog list
                     |                  |  last 7 days. All models |                  | (7-day window)
                     |                  |  are up to date."        |                  |
Sort                 | Instant          | N/A                      | N/A              | Column sorted +
                     |                  |                          |                  | arrow indicator
```

### User Journey

```
STEP | USER DOES                  | USER FEELS            | DESIGN SUPPORTS
-----|----------------------------|-----------------------|------------------
  1  | Googles "gpt-4o model id"  | Frustrated, hunting   | SEO: title + meta
  2  | Lands on page              | "Is this legit?"      | Trust signals: date,
     |                            |                       | count, minimal chrome
  3  | Sees search bar (dominant) | "I know how to use    | Search-first layout
     |                            |  this"                |
  4  | Types "gpt-4o"             | Impatient → relieved  | 100ms debounce,
     |                            | (instant results)     | instant filtering
  5  | Spots model, clicks ⎘      | Satisfied             | ✓ "Copied!" feedback
  6  | Leaves (<30 seconds)       | "I'll bookmark this"  | URL state preserves
     |                            |                       | search/filter params
```

> Key insight: most visits are **under 30 seconds**. The full table must be in static HTML — no lazy loading, no JS-dependent rendering. The page must work with JavaScript disabled (except search/filter interactivity).

### Search & Filter Behavior

- **Search:** Client-side, 100ms debounce, matches against model ID and name
- **Keyboard shortcut:** Press `/` to focus search bar (standard dev tool convention)
- **URL sync:** All filters reflected in URL params (`?q=claude&provider=anthropic&status=live`)
- **Browser back/forward:** Restores previous filter state from URL
- **Clear all:** Single "Clear filters" button when any filter is active
- **Result count:** Updates live: "Showing 23 of 847 models"
- **Sort:** Click column header to sort. Click again to reverse. Arrow indicator (▲/▼) shows current sort.

### Accessibility

- **Keyboard navigation:** Tab through rows, Enter to copy, `/` to focus search
- **ARIA:** `role="search"` on search form, `aria-live="polite"` on result count
- **Copy feedback:** `role="status"` on "Copied!" tooltip for screen reader announcement
- **Screen reader row:** "gpt-4o, OpenAI, text and image, 128K context, live"
- **Touch targets:** Copy button 44×44px minimum on mobile
- **Contrast:** All text meets WCAG 2.1 AA (4.5:1 body, 3:1 large text)
- **Focus visible:** Clear focus ring on all interactive elements (no `outline: none`)
- **No-JS fallback:** Full table visible without JavaScript. Search/filter/copy require JS.

## Implementation Estimate

Human team: ~2 weeks | CC + gstack: ~1 hour

## NOT in Scope (v1)

- **Meta (Llama)** — no direct API, model IDs vary by hosting provider (Together, Replicate, Bedrock). Requires a `hostedOn` data model extension. Deferred to Phase 2.
- **Code snippets** — click model → API call boilerplate. Phase 2.
- **RSS/Atom feed** — subscribe to model changes. Phase 2.
- **MCP server** — wrap models.json for AI coding assistants. Phase 3.
- **Model comparison** — side-by-side same-tier models. Phase 3.
- **Community contributions** — PRs to add/update providers. Phase 3.
