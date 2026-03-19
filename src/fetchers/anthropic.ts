import { z } from 'zod';
import type { ModelEntry, Fetcher } from '../types.ts';

const TIMEOUT_MS = 15_000;
const API_URL = 'https://api.anthropic.com/v1/models';
const API_VERSION = '2023-06-01';
const PAGE_LIMIT = 1000;

const AnthropicCapabilitiesSchema = z.object({
  image_input: z.object({ supported: z.boolean() }).optional(),
  pdf_input: z.object({ supported: z.boolean() }).optional(),
}).passthrough();

const AnthropicModelSchema = z.object({
  id: z.string(),
  type: z.literal('model'),
  display_name: z.string(),
  created_at: z.string(),
  max_input_tokens: z.number().optional(),
  max_tokens: z.number().optional(),
  capabilities: AnthropicCapabilitiesSchema.optional(),
});

const AnthropicResponseSchema = z.object({
  data: z.array(AnthropicModelSchema),
  has_more: z.boolean(),
  last_id: z.string().nullable().optional(),
});

function deriveCapabilities(model: z.infer<typeof AnthropicModelSchema>): string[] {
  const caps: string[] = ['text'];
  if (model.capabilities?.image_input?.supported) {
    caps.push('image');
  }
  if (model.capabilities?.pdf_input?.supported) {
    caps.push('pdf');
  }
  return caps;
}

function deriveStatus(modelId: string): ModelEntry['status'] {
  const lower = modelId.toLowerCase();
  if (lower.includes('claude-2') || lower.includes('claude-instant') || lower.includes('claude-3-opus') || lower.includes('claude-3-sonnet') || lower.includes('claude-3-haiku')) {
    return 'deprecated';
  }
  return 'live';
}

export const fetchAnthropic: Fetcher = async () => {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const allModels: ModelEntry[] = [];
  let afterId: string | undefined;

  // Paginate through all models — each page gets its own timeout
  do {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const url = new URL(API_URL);
      url.searchParams.set('limit', String(PAGE_LIMIT));
      if (afterId) url.searchParams.set('after_id', afterId);

      const response = await fetch(url.toString(), {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          'content-type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
      }

      const raw = await response.json();
      const parsed = AnthropicResponseSchema.parse(raw);

      for (const m of parsed.data) {
        allModels.push({
          id: m.id,
          provider: 'Anthropic',
          name: m.display_name,
          capabilities: deriveCapabilities(m),
          contextWindow: m.max_input_tokens,
          status: deriveStatus(m.id),
        });
      }

      if (parsed.has_more && parsed.last_id) {
        afterId = parsed.last_id;
      } else {
        break;
      }
    } finally {
      clearTimeout(timer);
    }
  } while (true);

  return allModels;
};
