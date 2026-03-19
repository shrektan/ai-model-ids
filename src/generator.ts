import type { ModelEntry } from './types.ts';
import type { Changelog, ChangeEntry } from './differ.ts';

// ── XSS-safe tagged template literal ──────────────────────────────────────────
// Any interpolated value is HTML-escaped. Raw HTML can be injected via raw().
function escapeHtml(value: unknown): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class RawHtml {
  constructor(public readonly value: string) {}
}

/** Wrap a string to bypass escaping — use only for trusted HTML fragments. */
export function raw(html: string): RawHtml {
  return new RawHtml(html);
}

/** Tagged template literal — all interpolated values are HTML-escaped unless wrapped in raw(). */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i] ?? '';
    if (i < values.length) {
      const val = values[i];
      result += val instanceof RawHtml ? val.value : escapeHtml(val);
    }
  }
  return result;
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: '#10a37f',
  Anthropic: '#d97757',
  Google: '#4285f4',
  Mistral: '#f7d046',
  DeepSeek: '#4d6bfe',
  xAI: '#000000',
  Moonshot: '#6366f1',
  Alibaba: '#ff6a00',
  Zhipu: '#2563eb',
};

const STATUS_COLORS: Record<string, string> = {
  live: '#22c55e',
  preview: '#f59e0b',
  deprecated: '#ef4444',
};

// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatContextWindow(tokens: number | undefined): string {
  if (tokens === undefined) return '—';
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

function providerDot(provider: string): RawHtml {
  const color = PROVIDER_COLORS[provider] ?? '#888';
  return raw(
    `<span class="dot" style="background:${color}" aria-hidden="true"></span>`
  );
}

function statusDot(status: string): RawHtml {
  const color = STATUS_COLORS[status] ?? '#888';
  return raw(
    `<span class="dot" style="background:${color}" aria-hidden="true"></span>`
  );
}

// ── Row rendering ──────────────────────────────────────────────────────────────

function renderCapabilityTags(capabilities: string[]): RawHtml {
  const tags = capabilities
    .map(cap => html`<span class="cap-tag">${cap}</span>`)
    .join('');
  return raw(tags);
}

function renderDesktopRow(model: ModelEntry): string {
  const ariaLabel = [
    model.id,
    model.provider,
    model.capabilities.join(' and '),
    model.contextWindow ? `${formatContextWindow(model.contextWindow)} context` : '',
    model.status,
  ].filter(Boolean).join(', ');

  return html`
    <tr class="model-row"
        data-id="${model.id}"
        data-provider="${model.provider}"
        data-capabilities="${model.capabilities.join(',')}"
        data-context="${model.contextWindow ?? ''}"
        data-status="${model.status}"
        tabindex="0"
        aria-label="${ariaLabel}">
      <td class="col-copy">
        <button class="copy-btn" data-copy="${model.id}" title="Copy model ID" aria-label="Copy ${model.id}">
          <span class="copy-icon" aria-hidden="true">⎘</span>
        </button>
      </td>
      <td class="col-id"><code class="model-id">${model.id}</code></td>
      <td class="col-provider">${raw(providerDot(model.provider).value)} ${model.provider}</td>
      <td class="col-caps">${raw(renderCapabilityTags(model.capabilities).value)}</td>
      <td class="col-context">${formatContextWindow(model.contextWindow)}</td>
      <td class="col-status">${raw(statusDot(model.status).value)} ${model.status}</td>
    </tr>`;
}

// ── Changelog section ──────────────────────────────────────────────────────────

function renderChangeEntry(entry: ChangeEntry): string {
  const symbol = entry.type === 'added' ? '+' : entry.type === 'removed' ? '−' : '~';
  const cssClass = `change-${entry.type}`;
  const date = formatDate(entry.date);
  const provider = entry.model.provider;

  let description = '';
  if (entry.type === 'modified' && entry.previous) {
    const parts: string[] = [];
    if (entry.previous.contextWindow !== undefined && entry.model.contextWindow !== undefined) {
      parts.push(`context ${formatContextWindow(entry.previous.contextWindow)}→${formatContextWindow(entry.model.contextWindow)}`);
    }
    if (entry.previous.status) {
      parts.push(`status ${entry.previous.status}→${entry.model.status}`);
    }
    if (entry.previous.capabilities) {
      parts.push(`capabilities updated`);
    }
    description = parts.join(', ');
  }

  return html`
    <li class="change-entry ${cssClass}">
      <span class="change-symbol" aria-hidden="true">${symbol}</span>
      <span class="change-id"><code>${entry.model.id}</code></span>
      ${description ? raw(html`<span class="change-desc">${description}</span>`) : raw('')}
      <span class="change-meta">(${entry.type} ${date})</span>
      <span class="change-provider">${provider}</span>
    </li>`;
}

// ── Provider filter options ────────────────────────────────────────────────────

function renderProviderOptions(providers: string[]): string {
  const opts = providers
    .sort()
    .map(p => html`<option value="${p}">${p}</option>`)
    .join('');
  return `<option value="">All</option>${opts}`;
}

// ── Main generator ─────────────────────────────────────────────────────────────

export interface GeneratorOptions {
  models: ModelEntry[];
  changelog: Changelog;
  generatedAt: string;
}

export function generate(opts: GeneratorOptions): string {
  const { models, changelog, generatedAt } = opts;

  const providers = [...new Set(models.map(m => m.provider))];
  const totalCount = models.length;
  const providerCount = providers.length;

  // Sort models: by provider then by ID
  const sortedModels = [...models].sort((a, b) => {
    const pCmp = a.provider.localeCompare(b.provider);
    return pCmp !== 0 ? pCmp : a.id.localeCompare(b.id);
  });

  const tableRows = sortedModels.map(renderDesktopRow).join('');

  // Only show last 7 days of changes
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const recentChanges = changelog.changes
    .filter(c => c.date >= sevenDaysAgo && changelog.changes.length < models.length) // skip first-run "added" flood
    .slice(0, 50);

  const changelogSection = recentChanges.length === 0
    ? html`<p class="empty-state">No changes in the last 7 days. All models are up to date.</p>`
    : html`<ul class="changelog-list">${raw(recentChanges.map(renderChangeEntry).join(''))}</ul>`;

  const formattedDate = formatDate(generatedAt);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Model IDs — The canonical developer reference</title>
  <meta name="description" content="Searchable, copy-paste ready reference for AI model IDs across all major providers. ${totalCount} models from ${providerCount} providers. Updated daily.">
  <meta name="keywords" content="AI model IDs, OpenAI models, Anthropic models, Google Gemini, model API names, LLM model list">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    /* ── Reset & base ─────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; font: inherit; }

    :root {
      --color-text: #1a1a1a;
      --color-bg: #fafafa;
      --color-alt-row: #f5f5f5;
      --color-border: #e5e5e5;
      --color-link: #0066cc;
      --color-status-live: #22c55e;
      --color-status-preview: #f59e0b;
      --color-status-deprecated: #ef4444;
      --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
      --font-ui: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
    }

    html { font-size: 15px; scroll-behavior: smooth; }
    body {
      font-family: var(--font-ui);
      color: var(--color-text);
      background: var(--color-bg);
      line-height: 1.5;
      min-height: 100vh;
    }

    a { color: var(--color-link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    a:focus-visible { outline: 2px solid var(--color-link); outline-offset: 2px; border-radius: 2px; }

    /* ── Layout ───────────────────────────────────────────────────── */
    .page-wrapper {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 var(--space-4);
    }

    /* ── Header ───────────────────────────────────────────────────── */
    .site-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4) 0;
      border-bottom: 1px solid var(--color-border);
    }
    .site-title {
      font-family: var(--font-ui);
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .header-actions { display: flex; gap: var(--space-3); align-items: center; }
    .header-link {
      font-size: 13px;
      color: var(--color-link);
      display: flex;
      align-items: center;
      gap: 3px;
      padding: var(--space-2) var(--space-2);
    }

    /* ── Toolbar ──────────────────────────────────────────────────── */
    .toolbar {
      padding: var(--space-4) 0 var(--space-3);
    }

    .search-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }

    .search-form {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-input {
      width: 100%;
      height: 40px;
      padding: 0 var(--space-3);
      padding-right: 72px;
      font-family: var(--font-ui);
      font-size: 14px;
      border: 1px solid var(--color-border);
      background: #fff;
      outline: none;
      color: var(--color-text);
    }
    .search-input:focus {
      border-color: var(--color-link);
      outline: 2px solid rgba(0, 102, 204, 0.15);
      outline-offset: 0;
    }
    .search-hint {
      position: absolute;
      right: var(--space-3);
      font-size: 11px;
      color: #999;
      pointer-events: none;
      font-family: var(--font-mono);
      border: 1px solid #ccc;
      padding: 1px 5px;
      background: var(--color-alt-row);
    }

    .filters-row {
      display: grid;
      grid-template-columns: repeat(4, auto) 1fr;
      gap: var(--space-2) var(--space-4);
      align-items: center;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 13px;
    }
    .filter-label { color: #666; white-space: nowrap; }
    .filter-select {
      height: 32px;
      padding: 0 var(--space-2);
      border: 1px solid var(--color-border);
      background: #fff;
      font-family: var(--font-ui);
      font-size: 13px;
      color: var(--color-text);
      cursor: pointer;
      min-width: 80px;
    }
    .filter-select:focus {
      border-color: var(--color-link);
      outline: 2px solid rgba(0, 102, 204, 0.15);
      outline-offset: 0;
    }

    .clear-btn {
      font-size: 12px;
      color: var(--color-link);
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--space-1) var(--space-2);
      display: none;
    }
    .clear-btn:hover { text-decoration: underline; }
    .clear-btn.visible { display: inline; }

    /* ── Status bar ───────────────────────────────────────────────── */
    .status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2) 0;
      font-size: 13px;
      color: #555;
      border-top: 1px solid var(--color-border);
      border-bottom: 1px solid var(--color-border);
    }
    .status-count { font-weight: 500; }
    .status-count [aria-live] { display: inline; }
    .status-date { color: #888; }

    /* ── Table ────────────────────────────────────────────────────── */
    .table-wrapper {
      overflow-x: auto;
      margin-top: 0;
    }

    .models-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .models-table th {
      position: sticky;
      top: 0;
      background: var(--color-bg);
      border-bottom: 2px solid var(--color-border);
      padding: var(--space-2) var(--space-3);
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #555;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }
    .models-table th:hover { color: var(--color-text); }
    .models-table th.sorted-asc::after { content: ' ▲'; font-size: 10px; }
    .models-table th.sorted-desc::after { content: ' ▼'; font-size: 10px; }
    .col-copy-hdr { width: 36px; cursor: default !important; }

    .model-row td {
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--color-border);
      vertical-align: middle;
    }
    .model-row:nth-child(even) td { background: var(--color-alt-row); }
    .model-row:hover td { background: #eef4ff; }
    .model-row:focus { outline: 2px solid var(--color-link); outline-offset: -1px; }
    .model-row.hidden { display: none; }

    .col-copy { width: 36px; padding: 0 4px !important; }
    .col-id { min-width: 200px; }
    .col-provider { white-space: nowrap; min-width: 100px; }
    .col-caps { min-width: 120px; }
    .col-context { white-space: nowrap; min-width: 70px; text-align: right; font-variant-numeric: tabular-nums; }
    .col-status { white-space: nowrap; min-width: 100px; }

    /* ── Copy button ──────────────────────────────────────────────── */
    .copy-btn {
      background: none;
      border: 1px solid var(--color-border);
      cursor: pointer;
      padding: 3px 6px;
      font-size: 14px;
      color: #777;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 36px;
      min-height: 36px;
      transition: color 0.1s, border-color 0.1s;
    }
    .copy-btn:hover { color: var(--color-text); border-color: #999; }
    .copy-btn:focus-visible { outline: 2px solid var(--color-link); outline-offset: 1px; }
    .copy-btn.copied { color: var(--color-status-live); border-color: var(--color-status-live); }

    /* ── Tooltip ──────────────────────────────────────────────────── */
    .copy-tooltip {
      position: fixed;
      background: #1a1a1a;
      color: #fff;
      font-size: 11px;
      padding: 3px 8px;
      pointer-events: none;
      z-index: 1000;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.1s;
    }
    .copy-tooltip.visible { opacity: 1; }

    /* ── Model ID ─────────────────────────────────────────────────── */
    .model-id {
      font-family: var(--font-mono);
      font-size: 13px;
      background: none;
    }

    /* ── Provider dot ─────────────────────────────────────────────── */
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* ── Capability tags ──────────────────────────────────────────── */
    .cap-tag {
      display: inline-block;
      font-size: 11px;
      padding: 1px 6px;
      border: 1px solid var(--color-border);
      background: #f8f8f8;
      margin: 1px 2px 1px 0;
      white-space: nowrap;
    }

    /* ── Empty state ──────────────────────────────────────────────── */
    .empty-state {
      padding: var(--space-5) var(--space-4);
      text-align: center;
      color: #666;
      font-size: 13px;
    }
    .empty-state a { color: var(--color-link); }

    #no-results {
      display: none;
      padding: var(--space-6) var(--space-4);
      text-align: center;
      color: #666;
    }
    #no-results.visible { display: block; }

    /* ── What's New ───────────────────────────────────────────────── */
    .whats-new {
      margin-top: var(--space-6);
      border-top: 2px solid var(--color-border);
      padding-top: var(--space-5);
      padding-bottom: var(--space-6);
    }
    .whats-new h2 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: var(--space-3);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #555;
      text-wrap: balance;
    }

    .changelog-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .change-entry {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      font-size: 13px;
      padding: 3px 0;
    }

    .change-symbol {
      font-family: var(--font-mono);
      font-weight: 700;
      width: 14px;
      flex-shrink: 0;
    }
    .change-added .change-symbol { color: var(--color-status-live); }
    .change-removed .change-symbol { color: var(--color-status-deprecated); }
    .change-modified .change-symbol { color: var(--color-status-preview); }

    .change-id code {
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .change-desc { color: #666; font-size: 12px; }
    .change-meta { color: #999; font-size: 12px; }
    .change-provider { color: #888; font-size: 12px; margin-left: auto; }

    /* ── Skeleton ─────────────────────────────────────────────────── */
    .skeleton-row td {
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--color-border);
    }
    .skeleton-bar {
      height: 14px;
      background: linear-gradient(90deg, #eee 25%, #ddd 50%, #eee 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
    @keyframes shimmer { to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) {
      .skeleton-bar { animation: none; }
      .copy-btn, .copy-tooltip { transition: none; }
    }

    /* ── Footer ───────────────────────────────────────────────────── */
    .site-footer {
      border-top: 1px solid var(--color-border);
      padding: var(--space-4) 0;
      font-size: 12px;
      color: #888;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: var(--space-6);
    }

    /* ── Hamburger / mobile header ────────────────────────────────── */
    .hamburger-btn {
      display: none;
      background: none;
      border: 1px solid var(--color-border);
      cursor: pointer;
      padding: 6px 10px;
      font-size: 16px;
      line-height: 1;
    }
    .hamburger-btn:focus-visible { outline: 2px solid var(--color-link); }

    /* ── Mobile filters drawer ────────────────────────────────────── */
    .filters-drawer {
      display: contents; /* visible on desktop */
    }

    /* ── Responsive ───────────────────────────────────────────────── */
    @media (max-width: 1023px) {
      .filters-row {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 639px) {
      .site-header { padding: var(--space-3) 0; }
      .site-title { font-size: 15px; }

      .hamburger-btn { display: flex; align-items: center; }

      .filters-row {
        display: none;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-2);
        margin-top: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        background: #fff;
      }
      .filters-row.open { display: grid; }

      /* Mobile: hide caps/context/status columns, show minimal */
      .models-table th.col-caps,
      .models-table th.col-context,
      .models-table th.col-status,
      .model-row td.col-caps,
      .model-row td.col-context,
      .model-row td.col-status { display: none; }

      /* Mobile expand detail */
      .model-row.expanded td.col-caps,
      .model-row.expanded td.col-context,
      .model-row.expanded td.col-status { display: table-cell; }

      .copy-btn {
        min-width: 44px;
        min-height: 44px;
        font-size: 18px;
      }

      /* mobile: make status-bar vertical */
      .status-bar { flex-direction: column; align-items: flex-start; gap: 2px; }

      .filters-row .filter-group { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <!-- Header -->
    <header class="site-header">
      <h1 class="site-title">AI Model IDs</h1>
      <div class="header-actions">
        <button class="hamburger-btn" id="hamburger-btn" aria-label="Toggle filters" aria-expanded="false" aria-controls="filters-row">&#8801;</button>
        <a class="header-link" href="api/models.json" target="_blank" rel="noopener">JSON API</a>
        <a class="header-link" href="https://github.com/shrektan/ai-model-ids" target="_blank" rel="noopener noreferrer">GitHub &#8599;</a>
      </div>
    </header>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-row">
        <form class="search-form" role="search" aria-label="Search models">
          <input
            type="search"
            id="search-input"
            class="search-input"
            placeholder="Search models..."
            autocomplete="off"
            spellcheck="false"
            aria-label="Search model IDs"
          >
          <span class="search-hint" aria-hidden="true">/</span>
        </form>
      </div>

      <div class="filters-row" id="filters-row">
        <div class="filter-group">
          <label class="filter-label" for="filter-provider">Provider:</label>
          <select id="filter-provider" class="filter-select" aria-label="Filter by provider">
            ${renderProviderOptions(providers)}
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label" for="filter-caps">Capabilities:</label>
          <select id="filter-caps" class="filter-select" aria-label="Filter by capabilities">
            <option value="">All</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
            <option value="embedding">Embedding</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label" for="filter-status">Status:</label>
          <select id="filter-status" class="filter-select" aria-label="Filter by status">
            <option value="">All</option>
            <option value="live">Live</option>
            <option value="preview">Preview</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label" for="filter-context">Context Window:</label>
          <select id="filter-context" class="filter-select" aria-label="Filter by context window">
            <option value="">Any</option>
            <option value="8k">≥ 8K</option>
            <option value="32k">≥ 32K</option>
            <option value="128k">≥ 128K</option>
            <option value="200k">≥ 200K</option>
            <option value="1m">≥ 1M</option>
          </select>
        </div>
        <div class="filter-group">
          <button class="clear-btn" id="clear-filters" type="button">Clear filters</button>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar">
      <span class="status-count">
        Showing <span id="result-count" aria-live="polite" role="status">${totalCount}</span> of ${totalCount} models from ${providerCount} providers
      </span>
      <span class="status-date">Data refreshed: ${formattedDate}</span>
    </div>

    <!-- Table -->
    <div class="table-wrapper" id="table-wrapper">
      <table class="models-table" id="models-table" aria-label="AI model IDs">
        <thead>
          <tr>
            <th class="col-copy-hdr" aria-label="Copy"></th>
            <th data-sort="id" class="sortable" scope="col">Model ID</th>
            <th data-sort="provider" class="sortable" scope="col">Provider</th>
            <th data-sort="caps" scope="col">Capabilities</th>
            <th data-sort="context" class="sortable col-context" scope="col">Context</th>
            <th data-sort="status" class="sortable" scope="col">Status</th>
          </tr>
        </thead>
        <tbody id="models-tbody">
          ${tableRows}
        </tbody>
      </table>
      <div id="no-results" role="alert">
        <p>No models match <strong id="no-results-query"></strong>. Try a broader search.</p>
        <p><button class="clear-btn visible" id="no-results-clear" type="button">Clear filters</button></p>
      </div>
    </div>

    <!-- What's New -->
    <section class="whats-new" aria-label="What's New">
      <h2>What&#8217;s New <span style="font-weight:400;text-transform:none;">(last 7 days)</span></h2>
      ${changelogSection}
    </section>

    <!-- Footer -->
    <footer class="site-footer">
      <span>AI Model IDs — updated daily via GitHub Actions</span>
      <span><a href="api/models.json">models.json</a> &middot; <a href="https://github.com/shrektan/ai-model-ids">GitHub</a></span>
    </footer>
  </div>

  <!-- Copy tooltip (shared, repositioned via JS) -->
  <div class="copy-tooltip" id="copy-tooltip" role="status" aria-live="polite"></div>

  <script>
  (function() {
    'use strict';

    // ── Constants ────────────────────────────────────────────────────
    const DEBOUNCE_MS = 100;
    const COPY_FEEDBACK_MS = 1500;

    // ── Elements ─────────────────────────────────────────────────────
    const searchInput    = document.getElementById('search-input');
    const filterProvider = document.getElementById('filter-provider');
    const filterCaps     = document.getElementById('filter-caps');
    const filterStatus   = document.getElementById('filter-status');
    const filterContext  = document.getElementById('filter-context');
    const clearBtn       = document.getElementById('clear-filters');
    const noResultsClear = document.getElementById('no-results-clear');
    const resultCount    = document.getElementById('result-count');
    const noResults      = document.getElementById('no-results');
    const noResultsQuery = document.getElementById('no-results-query');
    const tooltip        = document.getElementById('copy-tooltip');
    const tbody          = document.getElementById('models-tbody');
    const table          = document.getElementById('models-table');
    const hamburgerBtn   = document.getElementById('hamburger-btn');
    const filtersRow     = document.getElementById('filters-row');

    const allRows = Array.from(tbody.querySelectorAll('.model-row'));
    const totalCount = allRows.length;

    // ── URL state ────────────────────────────────────────────────────
    function readUrlState() {
      const params = new URLSearchParams(window.location.search);
      if (searchInput)    searchInput.value    = params.get('q')        || '';
      if (filterProvider) filterProvider.value = params.get('provider') || '';
      if (filterCaps)     filterCaps.value     = params.get('caps')     || '';
      if (filterStatus)   filterStatus.value   = params.get('status')   || '';
      if (filterContext)  filterContext.value   = params.get('context')  || '';
    }

    function writeUrlState() {
      const params = new URLSearchParams();
      const q = searchInput ? searchInput.value.trim() : '';
      if (q)                                params.set('q',        q);
      if (filterProvider && filterProvider.value) params.set('provider', filterProvider.value);
      if (filterCaps     && filterCaps.value)     params.set('caps',     filterCaps.value);
      if (filterStatus   && filterStatus.value)   params.set('status',   filterStatus.value);
      if (filterContext  && filterContext.value)   params.set('context',  filterContext.value);

      const newUrl = params.toString()
        ? window.location.pathname + '?' + params.toString()
        : window.location.pathname;

      history.replaceState(null, '', newUrl);
    }

    // ── Context window thresholds ────────────────────────────────────
    const CONTEXT_THRESHOLDS = {
      '8k':   8_000,
      '32k':  32_000,
      '128k': 128_000,
      '200k': 200_000,
      '1m':   1_000_000,
    };

    // ── Filter logic ─────────────────────────────────────────────────
    function matchRow(row) {
      const id       = row.dataset.id       || '';
      const provider = row.dataset.provider || '';
      const caps     = row.dataset.capabilities || '';
      const context  = row.dataset.context  ? parseInt(row.dataset.context, 10) : 0;
      const status   = row.dataset.status   || '';

      const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
      if (q && !id.toLowerCase().includes(q)) return false;

      const pFilter = filterProvider ? filterProvider.value : '';
      if (pFilter && provider !== pFilter) return false;

      const cFilter = filterCaps ? filterCaps.value : '';
      if (cFilter && !caps.split(',').includes(cFilter)) return false;

      const sFilter = filterStatus ? filterStatus.value : '';
      if (sFilter && status !== sFilter) return false;

      const ctxFilter = filterContext ? filterContext.value : '';
      if (ctxFilter) {
        const threshold = CONTEXT_THRESHOLDS[ctxFilter] || 0;
        if (!context || context < threshold) return false;
      }

      return true;
    }

    function applyFilters() {
      let visible = 0;
      for (const row of allRows) {
        if (matchRow(row)) {
          row.classList.remove('hidden');
          visible++;
        } else {
          row.classList.add('hidden');
        }
      }

      if (resultCount) resultCount.textContent = String(visible);

      // Show/hide empty state
      if (noResults) {
        if (visible === 0) {
          noResults.classList.add('visible');
          const q = searchInput ? searchInput.value.trim() : '';
          if (noResultsQuery) noResultsQuery.textContent = q ? \`"\${q}"\` : 'your filters';
        } else {
          noResults.classList.remove('visible');
        }
      }

      // Show/hide clear button
      const hasFilter = (searchInput && searchInput.value.trim()) ||
        (filterProvider && filterProvider.value) ||
        (filterCaps && filterCaps.value) ||
        (filterStatus && filterStatus.value) ||
        (filterContext && filterContext.value);
      if (clearBtn) clearBtn.classList.toggle('visible', !!hasFilter);

      writeUrlState();
    }

    function clearAllFilters() {
      if (searchInput)    searchInput.value    = '';
      if (filterProvider) filterProvider.value = '';
      if (filterCaps)     filterCaps.value     = '';
      if (filterStatus)   filterStatus.value   = '';
      if (filterContext)  filterContext.value   = '';
      applyFilters();
      if (searchInput) searchInput.focus();
    }

    // ── Debounce ─────────────────────────────────────────────────────
    let debounceTimer;
    function debouncedFilter() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilters, DEBOUNCE_MS);
    }

    // ── Event listeners ───────────────────────────────────────────────
    if (searchInput)    searchInput.addEventListener('input', debouncedFilter);
    if (filterProvider) filterProvider.addEventListener('change', applyFilters);
    if (filterCaps)     filterCaps.addEventListener('change', applyFilters);
    if (filterStatus)   filterStatus.addEventListener('change', applyFilters);
    if (filterContext)  filterContext.addEventListener('change', applyFilters);
    if (clearBtn)       clearBtn.addEventListener('click', clearAllFilters);
    if (noResultsClear) noResultsClear.addEventListener('click', clearAllFilters);

    // ── Keyboard shortcut: / to focus search ─────────────────────────
    document.addEventListener('keydown', function(e) {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        if (searchInput) searchInput.focus();
      }
    });

    // ── Row keyboard: Enter to copy ───────────────────────────────────
    tbody.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const row = e.target.closest('.model-row');
        if (row) {
          const modelId = row.dataset.id;
          if (modelId) copyToClipboard(modelId, e.target);
        }
      }
    });

    // ── Mobile: tap row to expand ─────────────────────────────────────
    tbody.addEventListener('click', function(e) {
      const row = e.target.closest('.model-row');
      if (!row) return;
      // Don't toggle if clicking copy button
      if (e.target.closest('.copy-btn')) return;
      if (window.innerWidth < 640) {
        row.classList.toggle('expanded');
      }
    });

    // ── Hamburger menu ────────────────────────────────────────────────
    if (hamburgerBtn && filtersRow) {
      hamburgerBtn.addEventListener('click', function() {
        const isOpen = filtersRow.classList.toggle('open');
        hamburgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }

    // ── Copy to clipboard ─────────────────────────────────────────────
    let tooltipTimer;

    function copyToClipboard(text, anchorEl) {
      navigator.clipboard.writeText(text).then(function() {
        showTooltip('Copied!', anchorEl, true);
      }).catch(function() {
        showTooltip('Copy failed. Select & copy manually.', anchorEl, false);
      });
    }

    function showTooltip(message, anchorEl, success) {
      if (!tooltip) return;
      clearTimeout(tooltipTimer);

      // Revert any previously copied button
      document.querySelectorAll('.copy-btn.copied').forEach(function(btn) {
        btn.classList.remove('copied');
        btn.querySelector('.copy-icon').textContent = '⎘';
      });

      // Mark the button as copied
      const btn = anchorEl.closest('.copy-btn');
      if (btn && success) {
        btn.classList.add('copied');
        const icon = btn.querySelector('.copy-icon');
        if (icon) icon.textContent = '✓';
      }

      // Position tooltip near anchor
      if (anchorEl) {
        const rect = anchorEl.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + 6) + 'px';
      }

      tooltip.textContent = message;
      tooltip.classList.add('visible');

      tooltipTimer = setTimeout(function() {
        tooltip.classList.remove('visible');
        if (btn) {
          btn.classList.remove('copied');
          const icon = btn.querySelector('.copy-icon');
          if (icon) icon.textContent = '⎘';
        }
      }, COPY_FEEDBACK_MS);
    }

    // Delegate copy button clicks
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.copy-btn');
      if (!btn) return;
      const text = btn.dataset.copy;
      if (text) copyToClipboard(text, btn);
    });

    // ── Sort ──────────────────────────────────────────────────────────
    let sortCol = null;
    let sortDir = 'asc';

    function sortTable(col) {
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }

      // Update header classes
      table.querySelectorAll('th[data-sort]').forEach(function(th) {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.dataset.sort === col) {
          th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
      });

      // Sort rows
      const rows = Array.from(tbody.querySelectorAll('.model-row'));
      rows.sort(function(a, b) {
        let aVal, bVal;
        switch (col) {
          case 'id':
            aVal = a.dataset.id || '';
            bVal = b.dataset.id || '';
            break;
          case 'provider':
            aVal = a.dataset.provider || '';
            bVal = b.dataset.provider || '';
            break;
          case 'context':
            aVal = parseInt(a.dataset.context || '0', 10);
            bVal = parseInt(b.dataset.context || '0', 10);
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
          case 'status':
            aVal = a.dataset.status || '';
            bVal = b.dataset.status || '';
            break;
          default:
            return 0;
        }
        const cmp = aVal.localeCompare(bVal);
        return sortDir === 'asc' ? cmp : -cmp;
      });

      rows.forEach(function(row) { tbody.appendChild(row); });
    }

    table.querySelectorAll('th[data-sort].sortable').forEach(function(th) {
      th.addEventListener('click', function() { sortTable(th.dataset.sort); });
    });

    // ── Back/forward restores URL state ──────────────────────────────
    window.addEventListener('popstate', function() {
      readUrlState();
      applyFilters();
    });

    // ── Init ──────────────────────────────────────────────────────────
    readUrlState();
    applyFilters();
  })();
  </script>
</body>
</html>`;
}
