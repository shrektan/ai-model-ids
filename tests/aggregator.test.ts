import { describe, it, expect, mock, afterEach } from 'bun:test';
import { aggregate } from '../src/aggregator.ts';
import type { ModelEntry } from '../src/types.ts';

const makeModel = (id: string, provider: string): ModelEntry => ({
  id,
  provider,
  capabilities: ['text'],
  status: 'live',
});

describe('aggregate', () => {
  it('merges results from multiple fetchers', async () => {
    const configs = [
      { name: 'A', fetcher: async () => [makeModel('a-1', 'A'), makeModel('a-2', 'A')] },
      { name: 'B', fetcher: async () => [makeModel('b-1', 'B')] },
    ];

    const { models, errors } = await aggregate(configs, null);

    expect(models).toHaveLength(3);
    expect(errors).toHaveLength(0);
  });

  it('falls back to cache for failed provider', async () => {
    const cache: ModelEntry[] = [
      makeModel('a-old', 'A'),
      makeModel('b-old', 'B'),
    ];

    const configs = [
      { name: 'A', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('Network error'); } },
      { name: 'B', fetcher: async () => [makeModel('b-new', 'B')] },
    ];

    const { models, errors } = await aggregate(configs, cache);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.provider).toBe('A');

    // Should have b-new (fresh) and a-old (from cache)
    const ids = models.map(m => m.id);
    expect(ids).toContain('a-old');
    expect(ids).toContain('b-new');
    expect(ids).not.toContain('b-old');
  });

  it('omits failed provider when no cache is available', async () => {
    const configs = [
      { name: 'A', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('Network error'); } },
      { name: 'B', fetcher: async () => [makeModel('b-1', 'B')] },
    ];

    const { models, errors } = await aggregate(configs, null);

    expect(errors).toHaveLength(1);
    const ids = models.map(m => m.id);
    expect(ids).not.toContain('a-1');
    expect(ids).toContain('b-1');
  });

  it('throws when ALL providers fail and there is no cache', async () => {
    const configs = [
      { name: 'A', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('fail'); } },
      { name: 'B', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('fail'); } },
    ];

    await expect(aggregate(configs, null)).rejects.toThrow('All 2 providers failed');
  });

  it('warns about duplicate model IDs across providers', async () => {
    const warnMock = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnMock as unknown as typeof console.warn;

    const configs = [
      { name: 'A', fetcher: async () => [makeModel('shared-model', 'A'), makeModel('a-only', 'A')] },
      { name: 'B', fetcher: async () => [makeModel('shared-model', 'B'), makeModel('b-only', 'B')] },
    ];

    await aggregate(configs, null);

    console.warn = originalWarn;

    expect(warnMock).toHaveBeenCalledTimes(1);
    const callArg = String(warnMock.mock.calls[0]);
    expect(callArg).toContain('shared-model');
    expect(callArg).toContain('A');
    expect(callArg).toContain('B');
  });

  it('does NOT throw when all providers fail but cache exists', async () => {
    const cache: ModelEntry[] = [makeModel('a-old', 'A'), makeModel('b-old', 'B')];

    const configs = [
      { name: 'A', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('fail'); } },
      { name: 'B', fetcher: async (): Promise<ModelEntry[]> => { throw new Error('fail'); } },
    ];

    const { models } = await aggregate(configs, cache);
    expect(models).toHaveLength(2);
  });
});
