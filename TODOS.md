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

### RSS/Atom Feed
- **What:** Subscribe to model changes (new models, deprecations) via RSS reader
- **Why:** Developers who integrate multiple providers want push notifications when models change
- **Context:** changelog.json already has the data — this is a format conversion to Atom XML. ~10min CC time.
- **Depends on:** v1 shipped (changelog.json exists)

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
