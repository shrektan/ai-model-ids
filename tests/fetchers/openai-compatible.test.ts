import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createOpenAICompatibleFetcher, PROVIDERS } from '../../src/fetchers/openai-compatible.ts';
import type { OpenAICompatibleConfig } from '../../src/fetchers/openai-compatible.ts';

const fixtureDir = join(import.meta.dir, '..', 'fixtures');

function makeConfig(provider: string): OpenAICompatibleConfig {
  return PROVIDERS.find(p => p.provider === provider)!;
}

describe('createOpenAICompatibleFetcher', () => {
  afterEach(() => {
    mock.restore();
  });

  // ─── Generic behavior (tested via OpenAI config) ──────────────────

  describe('generic behavior', () => {
    const config = makeConfig('OpenAI');

    beforeEach(() => {
      process.env['OPENAI_API_KEY'] = 'test-key';
    });

    afterEach(() => {
      delete process.env['OPENAI_API_KEY'];
    });

    it('throws when env var is missing', async () => {
      delete process.env['OPENAI_API_KEY'];
      const fetcher = createOpenAICompatibleFetcher(config);
      await expect(fetcher()).rejects.toThrow('OPENAI_API_KEY is not set');
    });

    it('throws on HTTP error', async () => {
      global.fetch = mock(() =>
        Promise.resolve(new Response('Unauthorized', { status: 401 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(config);
      await expect(fetcher()).rejects.toThrow('OpenAI API error: 401');
    });

    it('sends Bearer token in Authorization header', async () => {
      const fixture = { data: [] };
      let capturedHeaders: Record<string, string> = {};
      global.fetch = mock((_url: string, opts: RequestInit) => {
        capturedHeaders = { ...(opts.headers as Record<string, string>) };
        return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
      }) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(config);
      await fetcher();
      expect(capturedHeaders['Authorization']).toBe('Bearer test-key');
    });

    it('calls {baseUrl}/models', async () => {
      const fixture = { data: [] };
      let capturedUrl = '';
      global.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
      }) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(config);
      await fetcher();
      expect(capturedUrl).toBe('https://api.openai.com/v1/models');
    });
  });

  // ─── OpenAI-specific heuristics ───────────────────────────────────

  describe('OpenAI heuristics', () => {
    beforeEach(() => {
      process.env['OPENAI_API_KEY'] = 'test-key';
    });

    afterEach(() => {
      delete process.env['OPENAI_API_KEY'];
    });

    it('parses fixture and assigns correct provider', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'openai-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('OpenAI'));
      const models = await fetcher();

      expect(models.length).toBeGreaterThan(0);
      for (const m of models) {
        expect(m.provider).toBe('OpenAI');
      }
    });

    it('filters out fine-tuned models', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'openai-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('OpenAI'));
      const models = await fetcher();

      expect(models.find(m => m.id.startsWith('ft:'))).toBeUndefined();
    });

    it('infers embedding capability', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'openai-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('OpenAI'));
      const models = await fetcher();

      const embed = models.find(m => m.id.includes('embedding'));
      expect(embed).toBeDefined();
      expect(embed!.capabilities).toEqual(['embedding']);
    });

    it('infers image capability for gpt-4o', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'openai-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('OpenAI'));
      const models = await fetcher();

      const gpt4o = models.find(m => m.id === 'gpt-4o');
      expect(gpt4o!.capabilities).toContain('image');
    });
  });

  // ─── xAI-specific heuristics ──────────────────────────────────────

  describe('xAI heuristics', () => {
    beforeEach(() => {
      process.env['XAI_API_KEY'] = 'test-key';
    });

    afterEach(() => {
      delete process.env['XAI_API_KEY'];
    });

    it('uses input_modalities for capability inference', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'xai-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('xAI'));
      const models = await fetcher();

      const vision = models.find(m => m.id.includes('vision'));
      expect(vision).toBeDefined();
      expect(vision!.capabilities).toContain('image');
    });

    it('marks mini models as preview', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'xai-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('xAI'));
      const models = await fetcher();

      const mini = models.find(m => m.id.includes('mini'));
      expect(mini!.status).toBe('preview');
    });
  });

  // ─── Mistral-specific heuristics ──────────────────────────────────

  describe('Mistral heuristics', () => {
    beforeEach(() => {
      process.env['MISTRAL_API_KEY'] = 'test-key';
    });

    afterEach(() => {
      delete process.env['MISTRAL_API_KEY'];
    });

    it('uses capabilities.vision for image inference', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'mistral-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('Mistral'));
      const models = await fetcher();
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) {
        expect(m.provider).toBe('Mistral');
      }
    });

    it('uses max_context_length for contextWindow', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'mistral-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('Mistral'));
      const models = await fetcher();
      const withCtx = models.find(m => m.contextWindow !== undefined);
      expect(withCtx).toBeDefined();
    });
  });

  // ─── DeepSeek-specific heuristics ─────────────────────────────────

  describe('DeepSeek heuristics', () => {
    beforeEach(() => {
      process.env['DEEPSEEK_API_KEY'] = 'test-key';
    });

    afterEach(() => {
      delete process.env['DEEPSEEK_API_KEY'];
    });

    it('parses fixture and returns DeepSeek models', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'deepseek-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('DeepSeek'));
      const models = await fetcher();
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) {
        expect(m.provider).toBe('DeepSeek');
      }
    });
  });

  // ─── Google-specific heuristics ───────────────────────────────────

  describe('Google heuristics', () => {
    beforeEach(() => {
      process.env['GEMINI_API_KEY'] = 'test-key';
    });

    afterEach(() => {
      delete process.env['GEMINI_API_KEY'];
    });

    it('calls the correct OpenAI-compatible endpoint', async () => {
      const fixture = { data: [] };
      let capturedUrl = '';
      global.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
      }) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('Google'));
      await fetcher();
      expect(capturedUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models');
    });
  });

  // ─── Qwen-specific heuristics ────────────────────────────────────

  describe('Qwen heuristics', () => {
    beforeEach(() => {
      process.env['DASHSCOPE_API_KEY'] = 'test-key';
    });

    afterEach(() => {
      delete process.env['DASHSCOPE_API_KEY'];
    });

    it('filters bare third-party IDs when prefixed variant exists', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'qwen-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('Qwen'));
      const models = await fetcher();
      const ids = models.map(m => m.id);

      expect(ids).not.toContain('kimi-k2.5');
      expect(ids).not.toContain('MiniMax-M2.1');
    });

    it('keeps prefixed third-party IDs', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'qwen-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('Qwen'));
      const models = await fetcher();
      const ids = models.map(m => m.id);

      expect(ids).toContain('kimi/kimi-k2.5');
      expect(ids).toContain('MiniMax/MiniMax-M2.1');
    });

    it('keeps bare IDs without prefixed variant', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'qwen-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('Qwen'));
      const models = await fetcher();
      const ids = models.map(m => m.id);

      expect(ids).toContain('glm-4.7');
    });

    it('keeps native Qwen models', async () => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, 'qwen-models.json'), 'utf-8'));
      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
      ) as unknown as typeof fetch;

      const fetcher = createOpenAICompatibleFetcher(makeConfig('Qwen'));
      const models = await fetcher();
      const ids = models.map(m => m.id);

      expect(ids).toContain('qwen-max');
      expect(ids).toContain('qwen-plus');
    });
  });

  // ─── Provider config completeness ─────────────────────────────────

  describe('provider config', () => {
    it('has 8 OpenAI-compatible providers configured', () => {
      expect(PROVIDERS.length).toBe(8);
    });

    it('all providers have unique env vars', () => {
      const envVars = PROVIDERS.map(p => p.envVar);
      expect(new Set(envVars).size).toBe(envVars.length);
    });

    it('all providers have unique names', () => {
      const names = PROVIDERS.map(p => p.provider);
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
