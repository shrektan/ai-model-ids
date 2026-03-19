import { describe, it, expect } from 'bun:test';
import { html, raw, generate } from '../src/generator.ts';
import type { ModelEntry } from '../src/types.ts';

const makeModel = (id: string, provider: string): ModelEntry => ({
  id,
  provider,
  capabilities: ['text'],
  status: 'live',
});

describe('html tagged template — XSS escaping', () => {
  it('escapes < and > in interpolated values', () => {
    const result = html`<p>${'<script>alert(1)</script>'}</p>`;
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes & in interpolated values', () => {
    const result = html`<p>${'AT&T'}</p>`;
    expect(result).toContain('AT&amp;T');
  });

  it('escapes " in interpolated values', () => {
    const result = html`<a href="${'"onmouseover=alert(1)'}">${'click'}</a>`;
    expect(result).toContain('&quot;');
  });

  it('escapes \' in interpolated values', () => {
    const result = html`<p>${"it's fine"}</p>`;
    expect(result).toContain('&#39;');
  });

  it('passes raw() values through unescaped', () => {
    const trusted = raw('<strong>bold</strong>');
    const result = html`<div>${trusted}</div>`;
    expect(result).toContain('<strong>bold</strong>');
  });

  it('handles null/undefined gracefully', () => {
    const result = html`<p>${null}</p><p>${undefined}</p>`;
    expect(result).toContain('<p></p>');
  });
});

describe('generate', () => {
  const models: ModelEntry[] = [
    {
      id: 'gpt-4o',
      provider: 'OpenAI',
      name: 'GPT-4o',
      capabilities: ['text', 'image'],
      contextWindow: 128_000,
      status: 'live',
    },
    {
      id: 'claude-sonnet-4-0',
      provider: 'Anthropic',
      capabilities: ['text', 'image'],
      contextWindow: 200_000,
      status: 'live',
    },
    {
      id: 'old-model',
      provider: 'OpenAI',
      capabilities: ['text'],
      status: 'deprecated',
    },
  ];

  const emptyChangelog = {
    generatedAt: '2026-03-19T00:00:00.000Z',
    changes: [],
  };

  it('generates valid HTML document', () => {
    const output = generate({ models, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('<html');
    expect(output).toContain('</html>');
  });

  it('includes all model IDs in the output', () => {
    const output = generate({ models, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain('gpt-4o');
    expect(output).toContain('claude-sonnet-4-0');
    expect(output).toContain('old-model');
  });

  it('escapes special characters in model IDs', () => {
    const xssModels: ModelEntry[] = [
      {
        id: '<script>alert("xss")</script>',
        provider: 'Evil<Provider>',
        capabilities: ['text'],
        status: 'live',
      },
    ];
    const output = generate({ models: xssModels, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).not.toContain('<script>alert("xss")</script>');
    expect(output).toContain('&lt;script&gt;');
  });

  it('formats context window as human-readable', () => {
    const output = generate({ models, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain('128K');
    expect(output).toContain('200K');
  });

  it('includes model count in status bar', () => {
    const output = generate({ models, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain('3');
  });

  it('includes "What\'s New" section', () => {
    const output = generate({ models, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain("What");
    expect(output).toContain("New");
  });

  it('shows empty state when no recent changes', () => {
    const output = generate({ models, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain('No changes in the last 7 days');
  });

  it('includes search input with role=search', () => {
    const output = generate({ models, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain('role="search"');
    expect(output).toContain('search-input');
  });

  it('has aria-live on result count', () => {
    const output = generate({ models, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain('aria-live="polite"');
  });

  it('has copy buttons with data-copy attributes', () => {
    const output = generate({ models, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain('data-copy="gpt-4o"');
    expect(output).toContain('data-copy="claude-sonnet-4-0"');
  });

  it('formats 1M context window correctly', () => {
    const mModels: ModelEntry[] = [{
      id: 'gemini-1.5-pro',
      provider: 'Google',
      capabilities: ['text'],
      contextWindow: 2_000_000,
      status: 'live',
    }];
    const output = generate({ models: mModels, changelog: emptyChangelog, generatedAt: '2026-03-19T00:00:00.000Z' });
    expect(output).toContain('2M');
  });
});
