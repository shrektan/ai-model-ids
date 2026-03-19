import { describe, it, expect } from 'bun:test';
import { aggregate } from '../src/aggregator.ts';
import type { ModelEntry } from '../src/types.ts';

// Integration-style tests for the orchestration behavior
// (Testing actual main.ts execution requires file I/O — tested via aggregate + diff + generate unit tests instead)

describe('main pipeline orchestration', () => {
  it('aggregate aborts when all fetchers fail with no cache', async () => {
    const configs = [
      { name: 'A', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('timeout'); } },
      { name: 'B', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('auth error'); } },
      { name: 'C', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('parse error'); } },
    ];

    await expect(aggregate(configs, null)).rejects.toThrow('All 3 providers failed');
  });

  it('aggregate succeeds when some providers fail but cache exists', async () => {
    const cache: ModelEntry[] = [
      { id: 'a-cached', provider: 'A', capabilities: ['text'], status: 'live' },
      { id: 'b-cached', provider: 'B', capabilities: ['text'], status: 'live' },
    ];

    const configs = [
      { name: 'A', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('timeout'); } },
      { name: 'B', fetcher: async () => [{ id: 'b-live', provider: 'B', capabilities: ['text'], status: 'live' as const }] },
      { name: 'C', fetcher: async () => [{ id: 'c-live', provider: 'C', capabilities: ['text'], status: 'live' as const }] },
    ];

    const { models, errors } = await aggregate(configs, cache);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.provider).toBe('A');

    const ids = models.map(m => m.id);
    expect(ids).toContain('a-cached'); // fallback from cache
    expect(ids).toContain('b-live');   // fresh
    expect(ids).toContain('c-live');   // fresh
  });

  it('single-provider result includes all models from that provider', async () => {
    const configs = [{
      name: 'X',
      fetcher: async (): Promise<ModelEntry[]> => [
        { id: 'x-1', provider: 'X', capabilities: ['text'], status: 'live' },
        { id: 'x-2', provider: 'X', capabilities: ['text'], status: 'live' },
        { id: 'x-3', provider: 'X', capabilities: ['embedding'], status: 'live' },
      ],
    }];

    const { models } = await aggregate(configs, null);
    expect(models).toHaveLength(3);
  });
});
