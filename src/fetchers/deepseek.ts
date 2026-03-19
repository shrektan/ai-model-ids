import { z } from 'zod';
import type { ModelEntry, Fetcher } from '../types.ts';

const TIMEOUT_MS = 15_000;
const API_URL = 'https://api.deepseek.com/models';

const DeepSeekModelSchema = z.object({
  id: z.string(),
  object: z.string().optional(),
  owned_by: z.string().optional(),
});

const DeepSeekResponseSchema = z.object({
  object: z.string().optional(),
  data: z.array(DeepSeekModelSchema),
});

function inferCapabilities(modelId: string): string[] {
  const lower = modelId.toLowerCase();
  if (lower.includes('vl') || lower.includes('vision')) return ['text', 'image'];
  return ['text'];
}

function inferContextWindow(modelId: string): number | undefined {
  const lower = modelId.toLowerCase();
  if (lower.includes('r1')) return 64_000;
  if (lower.includes('v3') || lower.includes('chat')) return 64_000;
  if (lower.includes('coder')) return 128_000;
  return undefined;
}

function inferStatus(modelId: string): ModelEntry['status'] {
  const lower = modelId.toLowerCase();
  if (lower.includes('preview') || lower.includes('beta') || lower.includes('0324') || lower.includes('0131')) return 'preview';
  return 'live';
}

export const fetchDeepSeek: Fetcher = async () => {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json();
    const parsed = DeepSeekResponseSchema.parse(raw);

    return parsed.data.map((m): ModelEntry => ({
      id: m.id,
      provider: 'DeepSeek',
      capabilities: inferCapabilities(m.id),
      contextWindow: inferContextWindow(m.id),
      status: inferStatus(m.id),
    }));
  } finally {
    clearTimeout(timer);
  }
};
