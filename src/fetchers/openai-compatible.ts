import { z } from 'zod';
import type { ModelEntry, Fetcher } from '../types.ts';

const TIMEOUT_MS = 15_000;

/**
 * Generic schema for OpenAI-compatible /v1/models responses.
 * Most providers return at minimum { id, object }. Some add extra fields
 * (input_modalities, capabilities, max_context_length, etc.) which we
 * capture via passthrough() and handle in per-provider heuristics.
 */
const ModelSchema = z.object({
  id: z.string(),
  object: z.string().optional(),
  owned_by: z.string().optional(),
  // Mistral-specific
  capabilities: z.object({
    vision: z.boolean().optional(),
  }).passthrough().optional(),
  max_context_length: z.number().optional(),
  deprecation: z.string().nullable().optional(),
  // xAI-specific
  input_modalities: z.array(z.string()).optional(),
  output_modalities: z.array(z.string()).optional(),
}).passthrough();

const ResponseSchema = z.object({
  data: z.array(ModelSchema),
}).passthrough();

type RawModel = z.infer<typeof ModelSchema>;

// ─── Per-provider heuristics ────────────────────────────────────────

interface ProviderHeuristics {
  inferCapabilities: (m: RawModel) => string[];
  inferContextWindow: (m: RawModel) => number | undefined;
  inferStatus: (m: RawModel) => ModelEntry['status'];
  filterModel?: (m: RawModel, allModels: RawModel[]) => boolean;
}

const defaultHeuristics: ProviderHeuristics = {
  inferCapabilities: () => ['text'],
  inferContextWindow: () => undefined,
  inferStatus: () => 'live',
};

const PROVIDER_HEURISTICS: Record<string, ProviderHeuristics> = {
  OpenAI: {
    inferCapabilities(m) {
      const id = m.id.toLowerCase();
      if (id.includes('embedding') || id.includes('embed')) return ['embedding'];
      if (id.includes('dall-e') || id === 'image') return ['image'];
      if (id.includes('whisper') || id.includes('tts')) return ['audio'];
      const caps = ['text'];
      if (id.includes('gpt-4o') || id.includes('gpt-4-turbo') || id.includes('vision') || id.includes('o1') || id.includes('o3') || id.includes('o4')) {
        caps.push('image');
      }
      return caps;
    },
    inferContextWindow(m) {
      const id = m.id.toLowerCase();
      if (id.includes('gpt-4o') || id.includes('gpt-4-turbo') || id.includes('o1') || id.includes('o3') || id.includes('o4')) return 128_000;
      if (id.includes('gpt-4.1')) return 1_047_576;
      if (id.includes('gpt-4-32k')) return 32_768;
      if (id.includes('gpt-4')) return 8_192;
      if (id.includes('gpt-3.5-turbo-16k')) return 16_384;
      if (id.includes('gpt-3.5')) return 4_096;
      return undefined;
    },
    inferStatus(m) {
      const id = m.id.toLowerCase();
      if (id.includes('davinci') || id.includes('curie') || id.includes('babbage') ||
          id.includes('ada-001') || id.includes('text-') || id.includes('code-') ||
          id.includes('gpt-3.5-turbo-0301') || id.includes('gpt-3.5-turbo-0613') ||
          id.includes('gpt-4-0314') || id.includes('gpt-4-0613')) {
        return 'deprecated';
      }
      return 'live';
    },
    filterModel(m) {
      return !m.id.toLowerCase().startsWith('ft:');
    },
  },

  Mistral: {
    inferCapabilities(m) {
      if (m.id.toLowerCase().includes('embed')) return ['embedding'];
      const caps = ['text'];
      if (m.capabilities?.vision) caps.push('image');
      return caps;
    },
    inferContextWindow(m) {
      return m.max_context_length;
    },
    inferStatus(m) {
      if (m.deprecation) return 'deprecated';
      const id = m.id.toLowerCase();
      if (id.endsWith('-latest') || id.includes('preview') || id.includes('rc')) return 'preview';
      return 'live';
    },
  },

  DeepSeek: {
    inferCapabilities(m) {
      const id = m.id.toLowerCase();
      if (id.includes('vl') || id.includes('vision')) return ['text', 'image'];
      return ['text'];
    },
    inferContextWindow(m) {
      const id = m.id.toLowerCase();
      if (id.includes('coder')) return 128_000;
      if (id.includes('r1') || id.includes('v3') || id.includes('chat')) return 64_000;
      return undefined;
    },
    inferStatus(m) {
      const id = m.id.toLowerCase();
      if (id.includes('preview') || id.includes('beta')) return 'preview';
      return 'live';
    },
  },

  xAI: {
    inferCapabilities(m) {
      const caps = new Set<string>();
      const allMods = [...(m.input_modalities ?? []), ...(m.output_modalities ?? [])].map(s => s.toLowerCase());
      if (allMods.includes('text')) caps.add('text');
      if (allMods.includes('image')) caps.add('image');
      if (allMods.includes('audio')) caps.add('audio');
      if (caps.size === 0) {
        caps.add('text');
        if (m.id.toLowerCase().includes('vision') || m.id.toLowerCase().includes('-v')) caps.add('image');
      }
      return Array.from(caps);
    },
    inferContextWindow(m) {
      const id = m.id.toLowerCase();
      if (id.includes('grok-2') || id.includes('grok-3')) return 131_072;
      if (id.includes('grok-1')) return 8_192;
      return undefined;
    },
    inferStatus(m) {
      const id = m.id.toLowerCase();
      if (id.includes('preview') || id.includes('beta') || id.includes('mini')) return 'preview';
      return 'live';
    },
  },

  Moonshot: {
    inferCapabilities(m) {
      const id = m.id.toLowerCase();
      if (id.includes('vision') || id.includes('vl')) return ['text', 'image'];
      return ['text'];
    },
    inferContextWindow(m) {
      const id = m.id.toLowerCase();
      const match = id.match(/(\d+)k/);
      if (match) return parseInt(match[1]!) * 1000;
      if (id.includes('k2')) return 131_072;
      return undefined;
    },
    inferStatus(m) {
      const id = m.id.toLowerCase();
      if (id.includes('preview') || id.includes('beta')) return 'preview';
      return 'live';
    },
  },

  Google: {
    inferCapabilities(m) {
      const id = m.id.toLowerCase();
      if (id.includes('embedding') || id.includes('embed')) return ['embedding'];
      if (id.includes('imagen')) return ['image'];
      const caps = ['text'];
      if (id.includes('gemini')) caps.push('image');
      if (id.includes('gemini-1.5') || id.includes('gemini-2')) {
        caps.push('audio', 'video');
      }
      return caps;
    },
    inferContextWindow(m) {
      // Google's OpenAI-compat endpoint may not return context window.
      // Fallback to known values.
      const id = m.id.toLowerCase();
      if (id.includes('gemini-2')) return 1_048_576;
      if (id.includes('gemini-1.5-pro')) return 2_097_152;
      if (id.includes('gemini-1.5-flash')) return 1_048_576;
      if (id.includes('gemini-1.0')) return 32_768;
      return undefined;
    },
    inferStatus(m) {
      const id = m.id.toLowerCase();
      if (id.includes('deprecated') || id.includes('bison') || id.includes('gecko')) return 'deprecated';
      if (id.includes('exp') || id.includes('preview') || id.includes('latest')) return 'preview';
      return 'live';
    },
  },

  Qwen: {
    inferCapabilities(m) {
      const id = m.id.toLowerCase();
      if (id.includes('embed')) return ['embedding'];
      if (id.includes('audio')) return ['text', 'audio'];
      if (id.includes('vl') || id.includes('vision')) return ['text', 'image'];
      return ['text'];
    },
    inferContextWindow(m) {
      const id = m.id.toLowerCase();
      if (id.includes('qwen-long') || id.includes('qwen-max')) return 1_000_000;
      if (id.includes('qwen-plus') || id.includes('qwen-turbo')) return 131_072;
      if (id.includes('qwen2.5') || id.includes('qwen2')) return 131_072;
      return undefined;
    },
    inferStatus(m) {
      const id = m.id.toLowerCase();
      if (id.includes('preview') || id.includes('beta') || id.includes('latest')) return 'preview';
      return 'live';
    },
  },

  Zhipu: {
    inferCapabilities(m) {
      const id = m.id.toLowerCase();
      if (id.includes('embed')) return ['embedding'];
      if (id.includes('cogview') || id.includes('image')) return ['image'];
      if (id.includes('vision') || id.includes('vl')) return ['text', 'image'];
      return ['text'];
    },
    inferContextWindow(m) {
      const id = m.id.toLowerCase();
      if (id.includes('glm-4') || id.includes('glm-5')) return 128_000;
      if (id.includes('glm-3')) return 8_192;
      return undefined;
    },
    inferStatus(m) {
      const id = m.id.toLowerCase();
      if (id.includes('preview') || id.includes('beta')) return 'preview';
      return 'live';
    },
  },
};

// ─── Provider config table ──────────────────────────────────────────

export interface OpenAICompatibleConfig {
  provider: string;
  baseUrl: string;
  envVar: string;
}

export const PROVIDERS: OpenAICompatibleConfig[] = [
  { provider: 'OpenAI',   baseUrl: 'https://api.openai.com/v1',                                     envVar: 'OPENAI_API_KEY' },
  { provider: 'Mistral',  baseUrl: 'https://api.mistral.ai/v1',                                     envVar: 'MISTRAL_API_KEY' },
  { provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com',                                      envVar: 'DEEPSEEK_API_KEY' },
  { provider: 'xAI',      baseUrl: 'https://api.x.ai/v1',                                           envVar: 'XAI_API_KEY' },
  { provider: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1',                                     envVar: 'MOONSHOT_API_KEY' },
  { provider: 'Google',   baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',        envVar: 'GEMINI_API_KEY' },
  { provider: 'Qwen',     baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',              envVar: 'DASHSCOPE_API_KEY' },
  { provider: 'Zhipu',    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',                           envVar: 'ZHIPU_API_KEY' },
];

// ─── Generic fetcher factory ────────────────────────────────────────

export function createOpenAICompatibleFetcher(config: OpenAICompatibleConfig): Fetcher {
  const { provider, baseUrl, envVar } = config;
  const heuristics = PROVIDER_HEURISTICS[provider] ?? defaultHeuristics;

  return async (): Promise<ModelEntry[]> => {
    const apiKey = process.env[envVar];
    if (!apiKey) throw new Error(`${envVar} is not set`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const url = `${baseUrl}/models`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        redirect: 'error',
      });

      if (!response.ok) {
        throw new Error(`${provider} API error: ${response.status} ${response.statusText}`);
      }

      const raw = await response.json();
      const parsed = ResponseSchema.parse(raw);

      return parsed.data
        .filter(m => heuristics.filterModel ? heuristics.filterModel(m, parsed.data) : true)
        .map((m): ModelEntry => ({
          id: m.id,
          provider,
          capabilities: heuristics.inferCapabilities(m),
          contextWindow: heuristics.inferContextWindow(m),
          status: heuristics.inferStatus(m),
        }));
    } finally {
      clearTimeout(timer);
    }
  };
}
