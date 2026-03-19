# AI Model IDs

The canonical developer reference for AI model IDs across all major providers.

**One searchable page. Copy-paste ready. Updated daily.**

## What is this?

Every developer building multi-provider AI apps has to dig through 5+ separate docs sites to find the exact model ID string. This site puts them all in one place.

- **Search & filter** by provider, capabilities, context window, status
- **Copy-paste** any model ID with one click
- **Updated daily** via GitHub Actions
- **JSON API** at `/api/models.json` for programmatic access
- **Atom feed** at `/feed.xml` for change notifications

## Providers

OpenAI, Anthropic (Claude), Google (Gemini), Mistral, DeepSeek, xAI (Grok), Moonshot (Kimi), Alibaba (Qwen), Zhipu (GLM)

## Development

```bash
bun install
bun run src/main.ts        # Run pipeline (fetches models, generates site)
bun run src/main.ts --force # Force re-fetch (skip cache)
bun test                   # Run tests
```

Requires API keys in `.env` (see `.env.example`).

## Architecture

```
Fetchers (9 providers, parallel)
  → Aggregator (merge + fallback)
    → Differ (changelog)
      → Generator (HTML + SEO files)
        → dist/ (deployed to GitHub Pages)
```

## Output files

| File | Description |
|------|-------------|
| `index.html` | Searchable model table |
| `models.json` | All models as JSON |
| `api/models.json` | JSON API endpoint |
| `changelog.json` | Recent changes |
| `feed.xml` | Atom feed of changes |
| `sitemap.xml` | Search engine sitemap |
| `robots.txt` | Crawler instructions |
| `llms.txt` | AI-readable site description |
| `llms-full.txt` | Full model listing for AI tools |
| `favicon.svg` | Site favicon |
| `og-image.svg` | Social media preview image |

## License

MIT
