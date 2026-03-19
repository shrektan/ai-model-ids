import type { ModelEntry, Fetcher } from '../types.ts';

/**
 * [STATIC] MiniMax does not provide a /v1/models listing endpoint (returns 404).
 * Models are manually curated from https://platform.minimax.io/docs/guides/models-intro
 * Last updated: 2026-03-19
 */
export const fetchMiniMax: Fetcher = async () => {
  const models: ModelEntry[] = [
    // ── Text / Chat models ──────────────────────────────────────────
    { id: 'MiniMax-M2.7',           provider: 'MiniMax', capabilities: ['text'], contextWindow: 204_800, status: 'live' },
    { id: 'MiniMax-M2.7-highspeed', provider: 'MiniMax', capabilities: ['text'], contextWindow: 204_800, status: 'live' },
    { id: 'MiniMax-M2.5',           provider: 'MiniMax', capabilities: ['text'], contextWindow: 204_800, status: 'live' },
    { id: 'MiniMax-M2.5-highspeed', provider: 'MiniMax', capabilities: ['text'], contextWindow: 204_800, status: 'live' },
    { id: 'MiniMax-M2.1',           provider: 'MiniMax', capabilities: ['text'], contextWindow: 204_800, status: 'live' },
    { id: 'MiniMax-M2.1-highspeed', provider: 'MiniMax', capabilities: ['text'], contextWindow: 204_800, status: 'live' },
    { id: 'MiniMax-M2',             provider: 'MiniMax', capabilities: ['text'], contextWindow: 204_800, status: 'live' },

    // ── Speech models ───────────────────────────────────────────────
    { id: 'speech-2.8-hd',    provider: 'MiniMax', capabilities: ['audio'], status: 'live' },
    { id: 'speech-2.8-turbo', provider: 'MiniMax', capabilities: ['audio'], status: 'live' },
    { id: 'speech-2.6-hd',    provider: 'MiniMax', capabilities: ['audio'], status: 'live' },
    { id: 'speech-2.6-turbo', provider: 'MiniMax', capabilities: ['audio'], status: 'live' },
    { id: 'speech-02-hd',     provider: 'MiniMax', capabilities: ['audio'], status: 'live' },
    { id: 'speech-02-turbo',  provider: 'MiniMax', capabilities: ['audio'], status: 'live' },

    // ── Video models (Hailuo) ───────────────────────────────────────
    { id: 'MiniMax-Hailuo-2.3',      provider: 'MiniMax', capabilities: ['video'], status: 'live' },
    { id: 'MiniMax-Hailuo-2.3-Fast', provider: 'MiniMax', capabilities: ['video'], status: 'live' },
    { id: 'MiniMax-Hailuo-02',       provider: 'MiniMax', capabilities: ['video'], status: 'live' },

    // ── Image model ─────────────────────────────────────────────────
    { id: 'image-01', provider: 'MiniMax', capabilities: ['image'], status: 'live' },

    // ── Music models ────────────────────────────────────────────────
    { id: 'music-2.0',  provider: 'MiniMax', capabilities: ['audio'], status: 'live' },
    { id: 'Music-2.5',  provider: 'MiniMax', capabilities: ['audio'], status: 'live' },
    { id: 'Music-2.5+', provider: 'MiniMax', capabilities: ['audio'], status: 'live' },
  ];

  return models;
};
