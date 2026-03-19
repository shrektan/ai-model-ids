import { join } from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { z } from 'zod';
import { ModelEntrySchema } from './types.ts';
import type { ModelEntry } from './types.ts';
import { aggregate } from './aggregator.ts';
import type { FetcherConfig } from './aggregator.ts';
import { diff } from './differ.ts';
import { generate } from './generator.ts';
import { fetchOpenAI } from './fetchers/openai.ts';
import { fetchGoogle } from './fetchers/google.ts';
import { fetchMistral } from './fetchers/mistral.ts';
import { fetchDeepSeek } from './fetchers/deepseek.ts';
import { fetchXAI } from './fetchers/xai.ts';
import { fetchAnthropic } from './fetchers/anthropic.ts';
import { createYamlFetcher } from './fetchers/yaml.ts';

const DIST_DIR = join(import.meta.dir, '..', 'dist');
const DATA_DIR = join(import.meta.dir, '..', 'data');

const FETCHER_CONFIGS: FetcherConfig[] = [
  { name: 'OpenAI',    fetcher: fetchOpenAI },
  { name: 'Google',    fetcher: fetchGoogle },
  { name: 'Mistral',   fetcher: fetchMistral },
  { name: 'DeepSeek',  fetcher: fetchDeepSeek },
  { name: 'xAI',       fetcher: fetchXAI },
  { name: 'Anthropic', fetcher: fetchAnthropic },
  { name: 'Moonshot',  fetcher: createYamlFetcher(join(DATA_DIR, 'kimi.yaml')) },
  { name: 'Alibaba',   fetcher: createYamlFetcher(join(DATA_DIR, 'qwen.yaml')) },
  { name: 'Zhipu',     fetcher: createYamlFetcher(join(DATA_DIR, 'zhipu.yaml')) },
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

async function run(): Promise<void> {
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

  // Step 1: Run all fetchers
  console.log('');
  console.log('Step 1: Fetching models from all providers...');
  const { models, errors } = await aggregate(FETCHER_CONFIGS, cache);

  if (errors.length > 0) {
    console.warn(`  ${errors.length} provider(s) failed (used cache fallback where available):`);
    for (const { provider, error } of errors) {
      console.warn(`    [${provider}] ${error}`);
    }
  }
  console.log(`  Total models fetched: ${models.length}`);

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

  // Also create the api/ subdirectory symlink-like copy for /api/models.json route
  const apiDir = join(DIST_DIR, 'api');
  await mkdir(apiDir, { recursive: true });
  await writeFile(join(apiDir, 'models.json'), modelsJson);

  console.log(`  dist/index.html`);
  console.log(`  dist/models.json`);
  console.log(`  dist/api/models.json`);
  console.log(`  dist/changelog.json`);
  console.log('');
  console.log('Pipeline complete.');
}

run().catch(err => {
  console.error('Pipeline failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
