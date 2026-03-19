import { z } from 'zod';
import type { ModelEntry, Fetcher } from '../types.ts';

const TIMEOUT_MS = 15_000;
const API_URL = 'https://api.x.ai/v1/models';

const XAIModelSchema = z.object({
  id: z.string(),
  object: z.string().optional(),
  owned_by: z.string().optional(),
  input_modalities: z.array(z.string()).optional(),
  output_modalities: z.array(z.string()).optional(),
});

const XAIResponseSchema = z.object({
  data: z.array(XAIModelSchema),
  object: z.string().optional(),
});

function inferCapabilities(model: z.infer<typeof XAIModelSchema>): string[] {
  const caps = new Set<string>();

  // Use modalities from the API if available
  const inputMods = model.input_modalities ?? [];
  const outputMods = model.output_modalities ?? [];
  const allMods = [...inputMods, ...outputMods].map(m => m.toLowerCase());

  if (allMods.includes('text')) caps.add('text');
  if (allMods.includes('image')) caps.add('image');
  if (allMods.includes('audio')) caps.add('audio');

  // Fallback inference from model ID
  if (caps.size === 0) {
    caps.add('text');
    const lower = model.id.toLowerCase();
    if (lower.includes('vision') || lower.includes('-v')) caps.add('image');
  }

  return Array.from(caps);
}

function inferContextWindow(modelId: string): number | undefined {
  const lower = modelId.toLowerCase();
  if (lower.includes('grok-2') || lower.includes('grok-3')) return 131_072;
  if (lower.includes('grok-1')) return 8_192;
  return undefined;
}

function inferStatus(modelId: string): ModelEntry['status'] {
  const lower = modelId.toLowerCase();
  if (lower.includes('preview') || lower.includes('beta') || lower.includes('mini')) return 'preview';
  return 'live';
}

export const fetchXAI: Fetcher = async () => {
  const apiKey = process.env['XAI_API_KEY'];
  if (!apiKey) throw new Error('XAI_API_KEY is not set');

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
      throw new Error(`xAI API error: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json();
    const parsed = XAIResponseSchema.parse(raw);

    return parsed.data.map((m): ModelEntry => ({
      id: m.id,
      provider: 'xAI',
      capabilities: inferCapabilities(m),
      contextWindow: inferContextWindow(m.id),
      status: inferStatus(m.id),
    }));
  } finally {
    clearTimeout(timer);
  }
};
