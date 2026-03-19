import type { ModelEntry, Fetcher } from './types.ts';

export interface FetcherConfig {
  name: string;
  fetcher: Fetcher;
}

export interface AggregatorResult {
  models: ModelEntry[];
  errors: Array<{ provider: string; error: string }>;
}

/**
 * Runs all fetchers in parallel and merges results.
 * On per-provider failure, falls back to that provider's entries from the cache.
 * If ALL providers fail and there is no cache, throws to abort generation.
 */
export async function aggregate(
  configs: FetcherConfig[],
  cache: ModelEntry[] | null,
): Promise<AggregatorResult> {
  const results = await Promise.allSettled(
    configs.map(({ fetcher }) => fetcher()),
  );

  const models: ModelEntry[] = [];
  const errors: AggregatorResult['errors'] = [];

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i]!;
    const result = results[i]!;

    if (result.status === 'fulfilled') {
      models.push(...result.value);
    } else {
      const errorMessage = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);

      errors.push({ provider: config.name, error: errorMessage });

      // Fall back to cached entries for this provider
      if (cache) {
        const cachedEntries = cache.filter(m => m.provider === config.name);
        models.push(...cachedEntries);
      }
    }
  }

  // Warn about duplicate model IDs across providers
  const idProviders = new Map<string, string[]>();
  for (const m of models) {
    const providers = idProviders.get(m.id);
    if (providers) {
      providers.push(m.provider);
    } else {
      idProviders.set(m.id, [m.provider]);
    }
  }
  for (const [id, providers] of idProviders) {
    if (providers.length > 1) {
      console.warn(`Duplicate model ID "${id}" found across providers: ${providers.join(', ')}`);
    }
  }

  // Total failure: no models fetched and no cache fallback available
  if (models.length === 0 && errors.length === configs.length) {
    throw new Error(
      `All ${configs.length} providers failed and no cache is available. Aborting generation.\n` +
      errors.map(e => `  ${e.provider}: ${e.error}`).join('\n'),
    );
  }

  return { models, errors };
}
