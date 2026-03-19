import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { readFileSync } from 'fs';

const fixtureDir = join(import.meta.dir, '..', 'fixtures');

describe('fetchAnthropic', () => {
  const originalEnv = process.env['ANTHROPIC_API_KEY'];

  beforeEach(() => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalEnv;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    mock.restore();
  });

  it('parses fixture response into ModelEntry array', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'anthropic-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchAnthropic } = await import('../../src/fetchers/anthropic.ts');
    const models = await fetchAnthropic();

    expect(models.length).toBe(5);
    for (const model of models) {
      expect(model.provider).toBe('Anthropic');
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
    }
  });

  it('derives image capability from capabilities.image_input', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'anthropic-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchAnthropic } = await import('../../src/fetchers/anthropic.ts');
    const models = await fetchAnthropic();

    const opus = models.find(m => m.id.includes('opus-4-5'));
    expect(opus).toBeDefined();
    expect(opus!.capabilities).toContain('image');
    expect(opus!.capabilities).toContain('pdf');

    const claude2 = models.find(m => m.id === 'claude-2.1');
    expect(claude2).toBeDefined();
    expect(claude2!.capabilities).not.toContain('image');
  });

  it('uses max_input_tokens as contextWindow', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'anthropic-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchAnthropic } = await import('../../src/fetchers/anthropic.ts');
    const models = await fetchAnthropic();

    for (const model of models) {
      expect(model.contextWindow).toBe(200000);
    }
  });

  it('marks old models as deprecated', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'anthropic-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchAnthropic } = await import('../../src/fetchers/anthropic.ts');
    const models = await fetchAnthropic();

    const claude2 = models.find(m => m.id === 'claude-2.1');
    expect(claude2!.status).toBe('deprecated');

    const claude3Opus = models.find(m => m.id === 'claude-3-opus-20240229');
    expect(claude3Opus!.status).toBe('deprecated');

    const sonnet4 = models.find(m => m.id.includes('sonnet-4'));
    expect(sonnet4!.status).toBe('live');
  });

  it('sends x-api-key and anthropic-version headers', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'anthropic-models.json'), 'utf-8'),
    );

    let capturedHeaders: Record<string, string> = {};
    global.fetch = mock((url: string, opts: RequestInit) => {
      const headers = opts.headers as Record<string, string>;
      capturedHeaders = { ...headers };
      return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
    }) as unknown as typeof fetch;

    const { fetchAnthropic } = await import('../../src/fetchers/anthropic.ts');
    await fetchAnthropic();

    expect(capturedHeaders['x-api-key']).toBe('test-key');
    expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
  });

  it('throws when API key is missing', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const { fetchAnthropic } = await import('../../src/fetchers/anthropic.ts');
    await expect(fetchAnthropic()).rejects.toThrow('ANTHROPIC_API_KEY');
  });
});
