import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { readFileSync } from 'fs';

const fixtureDir = join(import.meta.dir, '..', 'fixtures');

describe('fetchGoogle', () => {
  const originalEnv = process.env['GOOGLE_API_KEY'];

  beforeEach(() => {
    process.env['GOOGLE_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['GOOGLE_API_KEY'] = originalEnv;
    } else {
      delete process.env['GOOGLE_API_KEY'];
    }
    mock.restore();
  });

  it('parses fixture response and strips models/ prefix from IDs', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'google-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchGoogle } = await import('../../src/fetchers/google.ts');
    const models = await fetchGoogle();

    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.id).not.toContain('models/');
      expect(model.provider).toBe('Google');
    }
  });

  it('infers embedding capability from supportedGenerationMethods', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'google-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchGoogle } = await import('../../src/fetchers/google.ts');
    const models = await fetchGoogle();

    const embeddingModel = models.find(m => m.id.includes('embedding'));
    expect(embeddingModel).toBeDefined();
    expect(embeddingModel?.capabilities).toEqual(['embedding']);
  });

  it('passes API key as query parameter', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'google-models.json'), 'utf-8'),
    );

    let capturedUrl = '';
    global.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
    }) as unknown as typeof fetch;

    const { fetchGoogle } = await import('../../src/fetchers/google.ts');
    await fetchGoogle();

    expect(capturedUrl).toContain('key=test-key');
  });

  it('throws when API key is missing', async () => {
    delete process.env['GOOGLE_API_KEY'];
    const { fetchGoogle } = await import('../../src/fetchers/google.ts');
    await expect(fetchGoogle()).rejects.toThrow('GOOGLE_API_KEY');
  });
});
