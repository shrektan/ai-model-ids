import { join } from 'path';
import { mkdir, writeFile, readFile, stat } from 'fs/promises';
import { z } from 'zod';
import { ModelEntrySchema } from './types.ts';
import type { ModelEntry } from './types.ts';
import { aggregate } from './aggregator.ts';
import type { FetcherConfig } from './aggregator.ts';
import { diff } from './differ.ts';
import {
  generate,
  generateFavicon,
  generateOgImage,
  generateSitemap,
  generateRobotsTxt,
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateFeed,
} from './generator.ts';
import { createOpenAICompatibleFetcher, PROVIDERS } from './fetchers/openai-compatible.ts';
import { fetchAnthropic } from './fetchers/anthropic.ts';

const DIST_DIR = join(import.meta.dir, '..', 'dist');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const FETCHER_CONFIGS: FetcherConfig[] = [
  // 8 OpenAI-compatible providers
  ...PROVIDERS.map(p => ({
    name: p.provider,
    fetcher: createOpenAICompatibleFetcher(p),
  })),
  // Anthropic has its own API format
  { name: 'Anthropic', fetcher: fetchAnthropic },
];

/** Load and validate the cached models.json from dist/. Returns null if missing or corrupt. */
async function loadCache(): Promise<ModelEntry[] | null> {
  try {
    const content = await readFile(join(DIST_DIR, 'models.json'), 'utf-8');
    const raw = JSON.parse(content);
    const parsed = z.array(ModelEntrySchema).parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

/** Check if the cache is fresh (less than CACHE_TTL_MS old). */
async function isCacheFresh(): Promise<boolean> {
  try {
    const info = await stat(join(DIST_DIR, 'models.json'));
    return Date.now() - info.mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  const forceRefresh = process.argv.includes('--force');
  console.log('AI Model IDs — pipeline starting');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  // Step 0: Load cache (for fallback + diff baseline)
  console.log('Step 0: Loading cache...');
  const cache = await loadCache();
  if (cache) {
    console.log(`  Loaded ${cache.length} cached models`);
  } else {
    console.log('  No valid cache found (first run or corrupt)');
  }

  // If cache is fresh and not forced, skip fetching and just regenerate HTML
  let models: ModelEntry[];
  let errors: Array<{ provider: string; error: string }> = [];

  if (cache && await isCacheFresh() && !forceRefresh) {
    console.log('');
    console.log('Step 1: Cache is fresh (< 1 hour old), skipping API calls.');
    console.log('  Use --force to re-fetch. Example: bun run build --force');
    models = cache;
  } else {
    // Step 1: Run all fetchers
    console.log('');
    console.log('Step 1: Fetching models from all providers...');
    const result = await aggregate(FETCHER_CONFIGS, cache);
    models = result.models;
    errors = result.errors;

    if (errors.length > 0) {
      console.warn(`  ${errors.length} provider(s) failed (used cache fallback where available):`);
      for (const { provider, error } of errors) {
        console.warn(`    [${provider}] ${error}`);
      }
    }
    console.log(`  Total models fetched: ${models.length}`);
  }

  // Step 2: Aggregate → models.json
  const modelsJson = JSON.stringify(models, null, 2);

  // Step 3: Diff → changelog.json
  console.log('');
  console.log('Step 3: Computing changelog...');
  const changelog = diff(models, cache);
  const addedCount    = changelog.changes.filter(c => c.type === 'added').length;
  const removedCount  = changelog.changes.filter(c => c.type === 'removed').length;
  const modifiedCount = changelog.changes.filter(c => c.type === 'modified').length;
  console.log(`  Changes: +${addedCount} added, -${removedCount} removed, ~${modifiedCount} modified`);

  // Step 4: Generate HTML
  console.log('');
  console.log('Step 4: Generating HTML...');
  const htmlContent = generate({
    models,
    changelog,
    generatedAt: new Date().toISOString(),
  });
  console.log(`  HTML size: ${(htmlContent.length / 1024).toFixed(1)} KB`);

  // Step 5: Write outputs
  console.log('');
  console.log('Step 5: Writing output files...');
  await mkdir(DIST_DIR, { recursive: true });
  await writeFile(join(DIST_DIR, 'models.json'), modelsJson);
  await writeFile(join(DIST_DIR, 'changelog.json'), JSON.stringify(changelog, null, 2));
  await writeFile(join(DIST_DIR, 'index.html'), htmlContent);

  // Also create the api/ subdirectory for /api/models.json route
  const apiDir = join(DIST_DIR, 'api');
  await mkdir(apiDir, { recursive: true });
  await writeFile(join(apiDir, 'models.json'), modelsJson);

  // Step 6: Generate SEO & discoverability files
  console.log('');
  console.log('Step 6: Generating SEO & discoverability files...');
  const generatedAt = new Date().toISOString();
  await writeFile(join(DIST_DIR, 'favicon.svg'), generateFavicon());
  await writeFile(join(DIST_DIR, 'og-image.svg'), generateOgImage(models.length, [...new Set(models.map(m => m.provider))].length));
  await writeFile(join(DIST_DIR, 'sitemap.xml'), generateSitemap(models));
  await writeFile(join(DIST_DIR, 'robots.txt'), generateRobotsTxt());
  await writeFile(join(DIST_DIR, 'llms.txt'), generateLlmsTxt(models));
  await writeFile(join(DIST_DIR, 'llms-full.txt'), generateLlmsFullTxt(models));
  await writeFile(join(DIST_DIR, 'feed.xml'), generateFeed(changelog, generatedAt));

  console.log(`  dist/index.html`);
  console.log(`  dist/models.json`);
  console.log(`  dist/api/models.json`);
  console.log(`  dist/changelog.json`);
  console.log(`  dist/favicon.svg`);
  console.log(`  dist/og-image.svg`);
  console.log(`  dist/sitemap.xml`);
  console.log(`  dist/robots.txt`);
  console.log(`  dist/llms.txt`);
  console.log(`  dist/llms-full.txt`);
  console.log(`  dist/feed.xml`);
  console.log('');
  console.log('Pipeline complete.');
}

run().catch(err => {
  console.error('Pipeline failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
