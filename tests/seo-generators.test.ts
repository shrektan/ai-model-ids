import { describe, it, expect } from 'bun:test';
import {
  generateFavicon,
  generateOgImage,
  generateSitemap,
  generateRobotsTxt,
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateFeed,
} from '../src/generator.ts';
import type { ModelEntry } from '../src/types.ts';
import type { Changelog } from '../src/differ.ts';

const models: ModelEntry[] = [
  { id: 'gpt-4o', provider: 'OpenAI', capabilities: ['text', 'image'], contextWindow: 128_000, status: 'live' },
  { id: 'claude-sonnet-4-0', provider: 'Anthropic', capabilities: ['text'], contextWindow: 200_000, status: 'live' },
  { id: 'old-model', provider: 'OpenAI', capabilities: ['text'], status: 'deprecated' },
];

const changelog: Changelog = {
  generatedAt: '2026-03-19T00:00:00.000Z',
  changes: [
    { type: 'added', model: models[0]!, date: '2026-03-19' },
    { type: 'removed', model: models[2]!, date: '2026-03-18' },
  ],
};

const emptyChangelog: Changelog = { generatedAt: '2026-03-19T00:00:00.000Z', changes: [] };

describe('generateFavicon', () => {
  it('returns valid SVG', () => {
    const svg = generateFavicon();
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('contains AI text', () => {
    const svg = generateFavicon();
    expect(svg).toContain('>AI<');
  });
});

describe('generateOgImage', () => {
  it('returns valid SVG with correct dimensions', () => {
    const svg = generateOgImage(100, 5);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 1200 630"');
  });

  it('includes model count and provider count', () => {
    const svg = generateOgImage(100, 5);
    expect(svg).toContain('100+');
    expect(svg).toContain('5 providers');
  });
});

describe('generateSitemap', () => {
  it('returns valid XML with urlset root', () => {
    const xml = generateSitemap(models);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('</urlset>');
  });

  it('includes the homepage URL with priority 1.0', () => {
    const xml = generateSitemap(models);
    expect(xml).toContain('<priority>1.0</priority>');
    expect(xml).toContain('shrektan.github.io/ai-model-ids/');
  });

  it('includes model anchor URLs', () => {
    const xml = generateSitemap(models);
    expect(xml).toContain('#model-gpt-4o');
    expect(xml).toContain('#model-claude-sonnet-4-0');
  });

  it('includes provider anchor URLs', () => {
    const xml = generateSitemap(models);
    expect(xml).toContain('#provider-openai');
    expect(xml).toContain('#provider-anthropic');
  });

  it('includes API endpoint URL', () => {
    const xml = generateSitemap(models);
    expect(xml).toContain('/api/models.json');
  });
});

describe('generateRobotsTxt', () => {
  it('allows all user agents', () => {
    const txt = generateRobotsTxt();
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
  });

  it('includes sitemap URL', () => {
    const txt = generateRobotsTxt();
    expect(txt).toContain('Sitemap:');
    expect(txt).toContain('sitemap.xml');
  });
});

describe('generateLlmsTxt', () => {
  it('includes model count and provider count', () => {
    const txt = generateLlmsTxt(models);
    expect(txt).toContain('3 AI model IDs');
    expect(txt).toContain('2 providers');
  });

  it('includes provider names', () => {
    const txt = generateLlmsTxt(models);
    expect(txt).toContain('Anthropic');
    expect(txt).toContain('OpenAI');
  });

  it('includes link section', () => {
    const txt = generateLlmsTxt(models);
    expect(txt).toContain('## Links');
    expect(txt).toContain('JSON API');
    expect(txt).toContain('Atom Feed');
  });
});

describe('generateLlmsFullTxt', () => {
  it('lists all models', () => {
    const txt = generateLlmsFullTxt(models);
    expect(txt).toContain('gpt-4o');
    expect(txt).toContain('claude-sonnet-4-0');
    expect(txt).toContain('old-model');
  });

  it('includes provider headings', () => {
    const txt = generateLlmsFullTxt(models);
    expect(txt).toContain('## Anthropic');
    expect(txt).toContain('## OpenAI');
  });

  it('includes status and context window', () => {
    const txt = generateLlmsFullTxt(models);
    expect(txt).toContain('[live]');
    expect(txt).toContain('[deprecated]');
    expect(txt).toContain('128K');
  });

  it('includes total count', () => {
    const txt = generateLlmsFullTxt(models);
    expect(txt).toContain('Total: 3 models');
  });
});

describe('generateFeed', () => {
  it('returns valid Atom XML', () => {
    const xml = generateFeed(changelog, '2026-03-19T00:00:00.000Z');
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('</feed>');
  });

  it('includes entries for changes', () => {
    const xml = generateFeed(changelog, '2026-03-19T00:00:00.000Z');
    expect(xml).toContain('<entry>');
    expect(xml).toContain('Added: gpt-4o');
    expect(xml).toContain('Removed: old-model');
  });

  it('includes self link', () => {
    const xml = generateFeed(changelog, '2026-03-19T00:00:00.000Z');
    expect(xml).toContain('rel="self"');
    expect(xml).toContain('feed.xml');
  });

  it('handles empty changelog', () => {
    const xml = generateFeed(emptyChangelog, '2026-03-19T00:00:00.000Z');
    expect(xml).toContain('<feed');
    expect(xml).not.toContain('<entry>');
  });

  it('escapes special characters in model IDs', () => {
    const xssChangelog: Changelog = {
      generatedAt: '2026-03-19T00:00:00.000Z',
      changes: [{
        type: 'added',
        model: { id: '<script>alert(1)</script>', provider: 'Evil', capabilities: ['text'], status: 'live' },
        date: '2026-03-19',
      }],
    };
    const xml = generateFeed(xssChangelog, '2026-03-19T00:00:00.000Z');
    expect(xml).not.toContain('<script>alert(1)</script>');
    expect(xml).toContain('&lt;script&gt;');
  });
});
