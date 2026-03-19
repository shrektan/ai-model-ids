import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { readFileSync } from 'fs';

const fixtureDir = join(import.meta.dir, '..', 'fixtures');

describe('fetchOpenAI', () => {
  const originalEnv = process.env['OPENAI_API_KEY'];

  beforeEach(() => {
    process.env['OPENAI_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['OPENAI_API_KEY'] = originalEnv;
    } else {
      delete process.env['OPENAI_API_KEY'];
    }
    mock.restore();
  });

  it('parses fixture response and returns valid ModelEntry[]', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'openai-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchOpenAI } = await import('../../src/fetchers/openai.ts');
    const models = await fetchOpenAI();

    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.provider).toBe('OpenAI');
      expect(typeof model.id).toBe('string');
      expect(Array.isArray(model.capabilities)).toBe(true);
      expect(['live', 'deprecated', 'preview']).toContain(model.status);
    }
  });

  it('filters out fine-tuned models (ft: prefix)', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'openai-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchOpenAI } = await import('../../src/fetchers/openai.ts');
    const models = await fetchOpenAI();

    const ftModels = models.filter(m => m.id.startsWith('ft:'));
    expect(ftModels.length).toBe(0);
  });

  it('infers embedding capability for embedding models', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'openai-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchOpenAI } = await import('../../src/fetchers/openai.ts');
    const models = await fetchOpenAI();

    const embeddingModel = models.find(m => m.id.includes('embedding'));
    expect(embeddingModel).toBeDefined();
    expect(embeddingModel?.capabilities).toEqual(['embedding']);
  });

  it('throws when API key is missing', async () => {
    delete process.env['OPENAI_API_KEY'];
    const { fetchOpenAI } = await import('../../src/fetchers/openai.ts');
    await expect(fetchOpenAI()).rejects.toThrow('OPENAI_API_KEY');
  });

  it('throws on HTTP error response', async () => {
    global.fetch = mock(() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 })),
    ) as unknown as typeof fetch;

    const { fetchOpenAI } = await import('../../src/fetchers/openai.ts');
    await expect(fetchOpenAI()).rejects.toThrow();
  });
});
