# TODOS

## Phase 2

### Meta (Llama) Provider Support
- **What:** Add Meta/Llama models with a `hostedOn` field mapping hosting provider → model ID (Together AI, Replicate, AWS Bedrock, etc.)
- **Why:** Meta models are widely used but IDs differ per host. A developer searching for "Llama 3.1 70B" needs the exact ID for their specific provider.
- **Context:** Dropped from v1 because the current `ModelEntry` schema doesn't support provider-specific IDs for the same model. Requires extending the schema with a `hostedOn: Record<string, string>` field and updating the HTML generator to display multiple copy-paste targets per model.
- **Depends on:** v1 shipped, schema extension design decision

### Code Snippets
- **What:** Click a model → see API call boilerplate in Python/TS/curl
- **Why:** Developers want to go from "what's the model ID?" to "how do I call it?" in one click
- **Context:** Each provider has different SDK patterns. Need a template system per provider × language. ~30min CC time.
- **Depends on:** v1 shipped

### Dark Mode
- **What:** Add dark mode support via `prefers-color-scheme` CSS media query
- **Why:** Developers often look up model IDs while coding at night. Dark mode reduces eye strain and matches their IDE theme.
- **Context:** Current design tokens are light-only (#fafafa bg, #1a1a1a text). Dark mode requires a parallel set of color tokens and testing all status/provider colors against dark backgrounds. ~15min CC time.
- **Depends on:** v1 shipped

### DESIGN.md (Full Design System)
- **What:** Create a standalone DESIGN.md documenting the complete design system (tokens, components, patterns, responsive breakpoints)
- **Why:** Phase 2/3 features (code snippets, model comparison) need consistent visual treatment. A design system document prevents drift.
- **Context:** v1 plan has design tokens embedded in PLAN.md. DESIGN.md would formalize these and add component specifications. Consider running `/design-consultation` to generate it. ~30min CC time.
- **Depends on:** v1 shipped, visual language validated in production

### Submit Sitemap to Google Search Console
- **What:** Submit sitemap.xml to Google Search Console after first GitHub Pages deploy
- **Why:** Enables Google to discover and index the site faster. Without it, Google may take weeks to find the sitemap organically.
- **Context:** Manual post-deploy task. Requires Google account and domain verification.
- **Depends on:** Discoverability improvements deployed

### Validate Structured Data
- **What:** Run Google Rich Results Test on the deployed site to confirm JSON-LD and microdata parse correctly
- **Why:** Validates that structured data enables rich search snippets
- **Context:** One-time manual check at https://search.google.com/test/rich-results
- **Depends on:** Discoverability improvements deployed

### Share on Developer Communities
- **What:** Post to Hacker News, Reddit r/programming, Twitter/X after SEO improvements ship
- **Why:** Initial exposure builds backlinks and search authority
- **Context:** The site needs some organic traffic to kickstart SEO. Developer communities are the natural audience.
- **Depends on:** Discoverability improvements deployed, site verified working

## Phase 3

### MCP Server
- **What:** Wrap models.json as an MCP (Model Context Protocol) server for AI coding assistants
- **Why:** AI coding tools (Claude Code, Cursor, etc.) could query available models programmatically
- **Context:** The Model-ID-Cheatsheet competitor does this already. Our advantage: we also have the HTML page.
- **Depends on:** v1 shipped

### Model Comparison
- **What:** Side-by-side comparison of same-tier models across providers (e.g., GPT-4o vs Claude Sonnet vs Gemini Pro)
- **Why:** Developers evaluating providers want to compare capabilities and context windows at a glance
- **Depends on:** v1 shipped, capabilities field populated

### Community Contributions
- **What:** Enable PRs to add/update providers and model data
- **Why:** Scales data maintenance beyond a single maintainer
- **Context:** Requires contribution guidelines, YAML schema docs, and CI validation of contributed data
- **Depends on:** v1 shipped, stable schema
