import { z } from 'zod';
import type { ModelEntry, Fetcher } from '../types.ts';

const TIMEOUT_MS = 15_000;
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const GoogleModelSchema = z.object({
  name: z.string(),                        // "models/gemini-1.5-pro"
  displayName: z.string().optional(),
  description: z.string().optional(),
  supportedGenerationMethods: z.array(z.string()).optional(),
  inputTokenLimit: z.number().optional(),
});

const GoogleResponseSchema = z.object({
  models: z.array(GoogleModelSchema),
});

function inferCapabilities(model: z.infer<typeof GoogleModelSchema>): string[] {
  const caps: Set<string> = new Set(['text']);
  const name = model.name.toLowerCase();
  const methods = model.supportedGenerationMethods ?? [];

  if (name.includes('vision') || name.includes('gemini')) {
    caps.add('image');
  }
  if (name.includes('gemini-1.5') || name.includes('gemini-2')) {
    caps.add('audio');
    caps.add('video');
  }
  if (name.includes('embedding') || methods.includes('embedContent')) {
    return ['embedding'];
  }
  if (name.includes('imagen')) {
    return ['image'];
  }

  return Array.from(caps);
}

function inferStatus(modelName: string): ModelEntry['status'] {
  const lower = modelName.toLowerCase();
  if (lower.includes('deprecated') || lower.includes('001') || lower.includes('bison') || lower.includes('gecko')) {
    return 'deprecated';
  }
  if (lower.includes('exp') || lower.includes('preview') || lower.includes('latest')) {
    return 'preview';
  }
  return 'live';
}

export const fetchGoogle: Fetcher = async () => {
  const apiKey = process.env['GOOGLE_API_KEY'];
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL(API_URL);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('pageSize', '200');

    const response = await fetch(url.toString(), { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json();
    const parsed = GoogleResponseSchema.parse(raw);

    return parsed.models.map((m): ModelEntry => {
      // name is "models/gemini-1.5-pro" — strip the prefix
      const id = m.name.replace(/^models\//, '');
      return {
        id,
        provider: 'Google',
        name: m.displayName,
        capabilities: inferCapabilities(m),
        contextWindow: m.inputTokenLimit,
        status: inferStatus(m.name),
      };
    });
  } finally {
    clearTimeout(timer);
  }
};
