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
  Qwen: '#ff6a00',
  Zhipu: '#2563eb',
  MiniMax: '#00b4d8',
};

const STATUS_COLORS: Record<string, string> = {
  live: '#22c55e',
  preview: '#f59e0b',
  deprecated: '#ef4444',
};

const SITE_URL = 'https://shrektan.github.io/ai-model-ids';

// ── ID sanitization ──────────────────────────────────────────────────────────
function sanitizeForId(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
}

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

function renderDesktopRow(model: ModelEntry, isFirstOfProvider: boolean): string {
  const ariaLabel = [
    model.id,
    model.provider,
    model.capabilities.join(' and '),
    model.contextWindow ? `${formatContextWindow(model.contextWindow)} context` : '',
    model.status,
  ].filter(Boolean).join(', ');

  const modelAnchorId = `model-${sanitizeForId(model.id)}`;
  const providerAnchor = isFirstOfProvider
    ? `<a id="provider-${sanitizeForId(model.provider)}" class="provider-anchor" aria-hidden="true"></a>`
    : '';

  return html`
    <tr class="model-row"
        id="${modelAnchorId}"
        itemscope itemtype="https://schema.org/SoftwareApplication"
        data-id="${model.id}"
        data-provider="${model.provider}"
        data-capabilities="${model.capabilities.join(',')}"
        data-context="${model.contextWindow ?? ''}"
        data-status="${model.status}"
        tabindex="0"
        aria-label="${ariaLabel}">
      <td class="col-copy">
        ${raw(providerAnchor)}
        <button class="copy-btn" data-copy="${model.id}" title="Copy model ID" aria-label="Copy ${model.id}">
          <span class="copy-icon" aria-hidden="true">⎘</span>
        </button>
      </td>
      <td class="col-id">
        <code class="model-id" itemprop="name">${model.id}</code>
        <div class="mobile-detail">
          ${raw(renderCapabilityTags(model.capabilities).value)}
          ${model.contextWindow ? raw(html`<span class="mobile-context">${formatContextWindow(model.contextWindow)}</span>`) : raw('')}
          <span class="mobile-status">${raw(statusDot(model.status).value)} ${model.status}</span>
        </div>
      </td>
      <td class="col-provider">${raw(providerDot(model.provider).value)} ${raw(`<span itemprop="provider" itemscope itemtype="https://schema.org/Organization"><meta itemprop="name" content="${escapeHtml(model.provider)}">`)}${model.provider}${raw('</span>')}</td>
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

// ── CSS (loaded from external file for editor support) ────────────────────────
const cssPath = new URL('./styles.css', import.meta.url).pathname;
const cssText = await Bun.file(cssPath).text();

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

  const seenProviders = new Set<string>();
  const tableRows = sortedModels.map(model => {
    const isFirst = !seenProviders.has(model.provider);
    seenProviders.add(model.provider);
    return renderDesktopRow(model, isFirst);
  }).join('');

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

  const description = `Searchable, copy-paste ready reference for AI model IDs across all major providers. ${totalCount} models from ${providerCount} providers. Updated daily.`;
  const ogTitle = `AI Model IDs — ${totalCount} models from ${providerCount} providers`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'AI Model IDs — The canonical developer reference',
    description,
    url: `${SITE_URL}/`,
    dateModified: generatedAt.slice(0, 10),
    inLanguage: 'en',
    about: {
      '@type': 'Thing',
      name: 'AI Model Identifiers',
      description: `API model ID strings for ${providers.sort().join(', ')}`,
    },
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Model IDs — The canonical developer reference</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="${escapeHtml(`AI model IDs, ${providers.sort().map(p => `${p} models`).join(', ')}, LLM model list, AI API model names, model identifier lookup, AI model reference`)}">
  <meta name="google-site-verification" content="O0qbGX2hXl-GzO3OXUJFGyK9V7Wj-C37TGPq9sqQpbI">
  <link rel="canonical" href="${SITE_URL}/">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="alternate" type="application/atom+xml" title="AI Model IDs — Changes Feed" href="feed.xml">
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${SITE_URL}/">
  <meta property="og:image" content="${SITE_URL}/og-image.svg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${SITE_URL}/og-image.svg">
  <!-- Structured Data -->
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-W9943HC3NS"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-W9943HC3NS');
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>${cssText}</style>
</head>
<body>
  <div class="page-wrapper">
    <!-- Header -->
    <header class="site-header">
      <div class="site-brand">
        <h1 class="site-title">AI Model IDs</h1>
        <p class="site-subtitle">The canonical developer reference for AI model IDs across all major providers.</p>
      </div>
      <div class="header-actions">
        <button class="hamburger-btn" id="hamburger-btn" aria-label="Toggle filters" aria-expanded="false" aria-controls="filters-row">&#8801;</button>
        <a class="header-link" href="feed.xml" target="_blank" rel="noopener">Feed</a>
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
            <th data-sort="caps" class="col-caps" scope="col">Capabilities</th>
            <th data-sort="context" class="sortable col-context" scope="col">Context</th>
            <th data-sort="status" class="sortable col-status" scope="col">Status</th>
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

// ── Static file generators ────────────────────────────────────────────────────

export function generateFavicon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#1a1a1a"/>
  <text x="16" y="22" text-anchor="middle" font-family="monospace" font-size="16" font-weight="bold" fill="#fafafa">AI</text>
</svg>`;
}

export function generateOgImage(totalCount: number, providerCount: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1a1a1a"/>
  <text x="80" y="200" font-family="monospace" font-size="48" font-weight="bold" fill="#fafafa">AI Model IDs</text>
  <line x1="80" y1="220" x2="420" y2="220" stroke="#555" stroke-width="2"/>
  <text x="80" y="290" font-family="monospace" font-size="24" fill="#999">The canonical developer reference</text>
  <text x="80" y="325" font-family="monospace" font-size="24" fill="#999">for AI model IDs</text>
  <text x="80" y="420" font-family="monospace" font-size="20" fill="#22c55e">$</text>
  <text x="110" y="420" font-family="monospace" font-size="20" fill="#888"> stats</text>
  <text x="80" y="460" font-family="monospace" font-size="20" fill="#22c55e">&gt;</text>
  <text x="110" y="460" font-family="monospace" font-size="20" fill="#fafafa"> ${totalCount}+ models &#x2502; ${providerCount} providers &#x2502; Updated daily</text>
  <text x="80" y="560" font-family="monospace" font-size="16" fill="#555">shrektan.github.io/ai-model-ids</text>
</svg>`;
}

export function generateSitemap(models: ModelEntry[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const modelUrls = models.map(m =>
    `  <url><loc>${SITE_URL}/#model-${sanitizeForId(m.id)}</loc></url>`
  ).join('\n');
  const providerUrls = [...new Set(models.map(m => m.provider))].map(p =>
    `  <url><loc>${SITE_URL}/#provider-${sanitizeForId(p)}</loc></url>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/api/models.json</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE_URL}/feed.xml</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.5</priority></url>
${providerUrls}
${modelUrls}
</urlset>`;
}

export function generateRobotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

export function generateLlmsTxt(models: ModelEntry[]): string {
  const providers = [...new Set(models.map(m => m.provider))].sort();
  return `# AI Model IDs

> The canonical developer reference for AI model IDs across all major providers.

This site lists ${models.length} AI model IDs from ${providers.length} providers: ${providers.join(', ')}.

Each model entry includes: raw API model ID, provider, capabilities, context window size, and status (live/preview/deprecated).

## Links

- Homepage: ${SITE_URL}/
- JSON API: ${SITE_URL}/api/models.json
- Atom Feed: ${SITE_URL}/feed.xml
- Full model listing: ${SITE_URL}/llms-full.txt
- GitHub: https://github.com/shrektan/ai-model-ids
`;
}

export function generateLlmsFullTxt(models: ModelEntry[]): string {
  const sorted = [...models].sort((a, b) => {
    const pCmp = a.provider.localeCompare(b.provider);
    return pCmp !== 0 ? pCmp : a.id.localeCompare(b.id);
  });

  let currentProvider = '';
  const lines: string[] = [
    '# AI Model IDs — Full Model Listing',
    '',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    `Total: ${models.length} models`,
    '',
  ];

  for (const m of sorted) {
    if (m.provider !== currentProvider) {
      currentProvider = m.provider;
      lines.push(`## ${currentProvider}`, '');
    }
    const ctx = m.contextWindow ? ` | Context: ${formatContextWindow(m.contextWindow)}` : '';
    const caps = m.capabilities.length > 0 ? ` | Caps: ${m.capabilities.join(', ')}` : '';
    lines.push(`- ${m.id} [${m.status}]${ctx}${caps}`);
  }

  return lines.join('\n') + '\n';
}

export function generateFeed(changelog: Changelog, generatedAt: string): string {
  const recentChanges = changelog.changes.slice(0, 50);

  const entries = recentChanges.map(entry => {
    const title = entry.type === 'added' ? `Added: ${entry.model.id}`
      : entry.type === 'removed' ? `Removed: ${entry.model.id}`
      : `Modified: ${entry.model.id}`;
    const id = `${SITE_URL}/#${entry.type}-${sanitizeForId(entry.model.id)}-${entry.date}`;

    return `  <entry>
    <title>${escapeHtml(title)}</title>
    <id>${escapeHtml(id)}</id>
    <link href="${SITE_URL}/#model-${sanitizeForId(entry.model.id)}"/>
    <updated>${entry.date}T00:00:00Z</updated>
    <summary>${escapeHtml(entry.type)} ${escapeHtml(entry.model.provider)} model: ${escapeHtml(entry.model.id)}</summary>
  </entry>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>AI Model IDs — Changes Feed</title>
  <subtitle>Daily changes to AI model IDs across all major providers</subtitle>
  <link href="${SITE_URL}/feed.xml" rel="self"/>
  <link href="${SITE_URL}/"/>
  <id>${SITE_URL}/</id>
  <updated>${generatedAt}</updated>
${entries}
</feed>`;
}
