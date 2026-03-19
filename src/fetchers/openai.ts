import { z } from 'zod';
import type { ModelEntry, Fetcher } from '../types.ts';

const TIMEOUT_MS = 15_000;
const API_URL = 'https://api.openai.com/v1/models';

const OpenAIModelSchema = z.object({
  id: z.string(),
  object: z.string(),
  owned_by: z.string(),
});

const OpenAIResponseSchema = z.object({
  data: z.array(OpenAIModelSchema),
});

// Heuristic: infer capabilities and context window from the model ID.
// OpenAI doesn't expose these in the /models endpoint.
function inferCapabilities(modelId: string): string[] {
  const caps: string[] = ['text'];
  const lower = modelId.toLowerCase();
  if (lower.includes('vision') || lower.includes('-o') || lower.includes('gpt-4o') || lower.includes('gpt-4-turbo')) {
    caps.push('image');
  }
  if (lower.includes('whisper') || lower.includes('tts') || lower.includes('audio')) {
    caps.splice(0, caps.length); // replace
    if (lower.includes('whisper')) caps.push('audio');
    if (lower.includes('tts')) caps.push('audio');
  }
  if (lower.includes('embedding') || lower.includes('embed')) {
    return ['embedding'];
  }
  if (lower.includes('dall-e') || lower.includes('image')) {
    return ['image'];
  }
  return caps;
}

function inferContextWindow(modelId: string): number | undefined {
  const lower = modelId.toLowerCase();
  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) return 128_000;
  if (lower.includes('gpt-4-32k')) return 32_768;
  if (lower.includes('gpt-4')) return 8_192;
  if (lower.includes('gpt-3.5-turbo-16k')) return 16_384;
  if (lower.includes('gpt-3.5')) return 4_096;
  return undefined;
}

function inferStatus(modelId: string): ModelEntry['status'] {
  const lower = modelId.toLowerCase();
  // Legacy/old models are typically deprecated
  if (
    lower.includes('gpt-3.5-turbo-0301') ||
    lower.includes('gpt-3.5-turbo-0613') ||
    lower.includes('gpt-4-0314') ||
    lower.includes('gpt-4-0613') ||
    lower.includes('davinci') ||
    lower.includes('curie') ||
    lower.includes('babbage') ||
    lower.includes('ada-001') ||
    lower.includes('text-') ||
    lower.includes('code-')
  ) {
    return 'deprecated';
  }
  return 'live';
}

function isRelevantModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  // Exclude fine-tuned user models (ft:) and internal testing models
  if (lower.startsWith('ft:')) return false;
  return true;
}

export const fetchOpenAI: Fetcher = async () => {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json();
    const parsed = OpenAIResponseSchema.parse(raw);

    return parsed.data
      .filter(m => isRelevantModel(m.id))
      .map((m): ModelEntry => ({
        id: m.id,
        provider: 'OpenAI',
        capabilities: inferCapabilities(m.id),
        contextWindow: inferContextWindow(m.id),
        status: inferStatus(m.id),
      }));
  } finally {
    clearTimeout(timer);
  }
};
