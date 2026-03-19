import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { readFileSync } from 'fs';

const fixtureDir = join(import.meta.dir, '..', 'fixtures');

describe('fetchDeepSeek', () => {
  const originalEnv = process.env['DEEPSEEK_API_KEY'];

  beforeEach(() => {
    process.env['DEEPSEEK_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['DEEPSEEK_API_KEY'] = originalEnv;
    } else {
      delete process.env['DEEPSEEK_API_KEY'];
    }
    mock.restore();
  });

  it('parses fixture and returns DeepSeek models', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'deepseek-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchDeepSeek } = await import('../../src/fetchers/deepseek.ts');
    const models = await fetchDeepSeek();

    expect(models.length).toBe(3);
    for (const m of models) {
      expect(m.provider).toBe('DeepSeek');
    }
  });

  it('infers text capability for chat/reasoner models', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'deepseek-models.json'), 'utf-8'),
    );

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    ) as unknown as typeof fetch;

    const { fetchDeepSeek } = await import('../../src/fetchers/deepseek.ts');
    const models = await fetchDeepSeek();

    const chat = models.find(m => m.id === 'deepseek-chat');
    expect(chat?.capabilities).toContain('text');
  });

  it('throws when API key is missing', async () => {
    delete process.env['DEEPSEEK_API_KEY'];
    const { fetchDeepSeek } = await import('../../src/fetchers/deepseek.ts');
    await expect(fetchDeepSeek()).rejects.toThrow('DEEPSEEK_API_KEY');
  });
});
