import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { readFileSync } from 'fs';

const fixtureDir = join(import.meta.dir, '..', 'fixtures');

describe('fetchMistral', () => {
  const originalEnv = process.env['MISTRAL_API_KEY'];

  beforeEach(() => {
    process.env['MISTRAL_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['MISTRAL_API_KEY'] = originalEnv;
    } else {
      delete process.env['MISTRAL_API_KEY'];
    }
    mock.restore();
  });

  it('parses fixture and detects vision capability', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'mistral-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchMistral } = await import('../../src/fetchers/mistral.ts');
    const models = await fetchMistral();

    const pixModel = models.find(m => m.id.includes('pixtral'));
    expect(pixModel).toBeDefined();
    expect(pixModel?.capabilities).toContain('image');

    const textModel = models.find(m => m.id === 'mistral-large-latest');
    expect(textModel?.capabilities).toEqual(['text']);
  });

  it('infers embedding capability from model ID', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'mistral-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchMistral } = await import('../../src/fetchers/mistral.ts');
    const models = await fetchMistral();

    const embedModel = models.find(m => m.id === 'mistral-embed');
    expect(embedModel?.capabilities).toEqual(['embedding']);
  });

  it('uses max_context_length for contextWindow', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'mistral-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchMistral } = await import('../../src/fetchers/mistral.ts');
    const models = await fetchMistral();

    const large = models.find(m => m.id === 'mistral-large-latest');
    expect(large?.contextWindow).toBe(131072);
  });

  it('throws when API key is missing', async () => {
    delete process.env['MISTRAL_API_KEY'];
    const { fetchMistral } = await import('../../src/fetchers/mistral.ts');
    await expect(fetchMistral()).rejects.toThrow('MISTRAL_API_KEY');
  });
});
