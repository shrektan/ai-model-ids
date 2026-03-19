import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ModelEntrySchema } from '../types.ts';
import type { ModelEntry } from '../types.ts';
import { readFileSync } from 'fs';

// YAML file schema — each file is an array of ModelEntry-compatible objects
const YAMLFileSchema = z.array(ModelEntrySchema);

/**
 * Creates a fetcher that reads model data from a curated YAML file.
 * Used for providers without usable APIs: Anthropic, Kimi, Qwen, Zhipu.
 */
export function createYamlFetcher(filePath: string): () => Promise<ModelEntry[]> {
  return async (): Promise<ModelEntry[]> => {
    const content = readFileSync(filePath, 'utf-8');
    const raw = parseYaml(content);
    const parsed = YAMLFileSchema.parse(raw);
    return parsed;
  };
}
