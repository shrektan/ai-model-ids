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
  <style>${cssText}</style>
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
