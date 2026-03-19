import { z } from 'zod';
import type { ModelEntry, Fetcher } from '../types.ts';

const TIMEOUT_MS = 15_000;
const API_URL = 'https://api.mistral.ai/v1/models';

const MistralModelSchema = z.object({
  id: z.string(),
  object: z.string().optional(),
  capabilities: z.object({
    completion_chat: z.boolean().optional(),
    completion_fim: z.boolean().optional(),
    function_calling: z.boolean().optional(),
    fine_tuning: z.boolean().optional(),
    vision: z.boolean().optional(),
  }).optional(),
  description: z.string().optional(),
  max_context_length: z.number().optional(),
  deprecation: z.string().optional(),
});

const MistralResponseSchema = z.object({
  data: z.array(MistralModelSchema),
});

function inferCapabilities(model: z.infer<typeof MistralModelSchema>): string[] {
  const caps: string[] = ['text'];
  if (model.capabilities?.vision) caps.push('image');
  if (model.id.toLowerCase().includes('embed')) return ['embedding'];
  return caps;
}

function inferStatus(model: z.infer<typeof MistralModelSchema>): ModelEntry['status'] {
  if (model.deprecation) return 'deprecated';
  const lower = model.id.toLowerCase();
  if (lower.endsWith('-latest') || lower.includes('preview') || lower.includes('rc')) return 'preview';
  return 'live';
}

export const fetchMistral: Fetcher = async () => {
  const apiKey = process.env['MISTRAL_API_KEY'];
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json();
    const parsed = MistralResponseSchema.parse(raw);

    return parsed.data.map((m): ModelEntry => ({
      id: m.id,
      provider: 'Mistral',
      capabilities: inferCapabilities(m),
      contextWindow: m.max_context_length,
      status: inferStatus(m),
    }));
  } finally {
    clearTimeout(timer);
  }
};
