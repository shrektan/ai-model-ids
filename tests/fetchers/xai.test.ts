import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { readFileSync } from 'fs';

const fixtureDir = join(import.meta.dir, '..', 'fixtures');

describe('fetchXAI', () => {
  const originalEnv = process.env['XAI_API_KEY'];

  beforeEach(() => {
    process.env['XAI_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['XAI_API_KEY'] = originalEnv;
    } else {
      delete process.env['XAI_API_KEY'];
    }
    mock.restore();
  });

  it('parses fixture and returns xAI models', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'xai-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchXAI } = await import('../../src/fetchers/xai.ts');
    const models = await fetchXAI();

    expect(models.length).toBe(4);
    for (const m of models) {
      expect(m.provider).toBe('xAI');
    }
  });

  it('infers image capability from input_modalities', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'xai-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchXAI } = await import('../../src/fetchers/xai.ts');
    const models = await fetchXAI();

    const visionModel = models.find(m => m.id === 'grok-2-vision-1212');
    expect(visionModel?.capabilities).toContain('image');

    const textModel = models.find(m => m.id === 'grok-2-1212');
    expect(textModel?.capabilities).not.toContain('image');
  });

  it('marks mini models as preview status', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'xai-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchXAI } = await import('../../src/fetchers/xai.ts');
    const models = await fetchXAI();

    const miniModel = models.find(m => m.id === 'grok-3-mini');
    expect(miniModel?.status).toBe('preview');
  });

  it('throws when API key is missing', async () => {
    delete process.env['XAI_API_KEY'];
    const { fetchXAI } = await import('../../src/fetchers/xai.ts');
    await expect(fetchXAI()).rejects.toThrow('XAI_API_KEY');
  });
});
