import { z } from 'zod';

export const ModelEntrySchema = z.object({
  id: z.string(),              // raw model ID string (e.g., "claude-sonnet-4-20250514")
  provider: z.string(),        // provider name
  name: z.string().optional(), // human-readable display name
  capabilities: z.array(z.string()), // ["text", "image", "audio", "video", "embedding"]
  contextWindow: z.number().optional(),
  status: z.enum(['live', 'deprecated', 'preview']),
});

export type ModelEntry = z.infer<typeof ModelEntrySchema>;
export type Fetcher = () => Promise<ModelEntry[]>;
