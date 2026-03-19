import { describe, it, expect } from 'bun:test';
import { fetchMiniMax } from '../../src/fetchers/minimax.ts';
import { ModelEntrySchema } from '../../src/types.ts';

describe('fetchMiniMax', () => {
  it('returns 20 models', async () => {
    const models = await fetchMiniMax();
    expect(models).toHaveLength(20);
  });

  it('all entries have provider MiniMax', async () => {
    const models = await fetchMiniMax();
    for (const m of models) {
      expect(m.provider).toBe('MiniMax');
    }
  });

  it('all entries pass ModelEntrySchema validation', async () => {
    const models = await fetchMiniMax();
    for (const m of models) {
      const result = ModelEntrySchema.safeParse(m);
      expect(result.success).toBe(true);
    }
  });

  it('includes text, audio, video, and image capabilities', async () => {
    const models = await fetchMiniMax();
    const allCaps = new Set(models.flatMap(m => m.capabilities));
    expect(allCaps.has('text')).toBe(true);
    expect(allCaps.has('audio')).toBe(true);
    expect(allCaps.has('video')).toBe(true);
    expect(allCaps.has('image')).toBe(true);
  });

  it('text models have contextWindow set', async () => {
    const models = await fetchMiniMax();
    const textModels = models.filter(m => m.capabilities.includes('text'));
    for (const m of textModels) {
      expect(m.contextWindow).toBeDefined();
      expect(m.contextWindow).toBeGreaterThan(0);
    }
  });
});
