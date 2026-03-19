import { describe, it, expect } from 'bun:test';
import { ModelEntrySchema } from '../src/types.ts';

describe('ModelEntrySchema', () => {
  it('accepts a minimal valid entry', () => {
    const result = ModelEntrySchema.safeParse({
      id: 'gpt-4o',
      provider: 'OpenAI',
      capabilities: ['text'],
      status: 'live',
    });
    expect(result.success).toBe(true);
  });

  it('accepts entry with all optional fields', () => {
    const result = ModelEntrySchema.safeParse({
      id: 'claude-3-opus',
      provider: 'Anthropic',
      name: 'Claude 3 Opus',
      capabilities: ['text', 'image'],
      contextWindow: 200_000,
      status: 'deprecated',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const result = ModelEntrySchema.safeParse({
      provider: 'OpenAI',
      capabilities: ['text'],
      status: 'live',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing provider', () => {
    const result = ModelEntrySchema.safeParse({
      id: 'gpt-4o',
      capabilities: ['text'],
      status: 'live',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing capabilities', () => {
    const result = ModelEntrySchema.safeParse({
      id: 'gpt-4o',
      provider: 'OpenAI',
      status: 'live',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status value', () => {
    const result = ModelEntrySchema.safeParse({
      id: 'gpt-4o',
      provider: 'OpenAI',
      capabilities: ['text'],
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-array capabilities', () => {
    const result = ModelEntrySchema.safeParse({
      id: 'gpt-4o',
      provider: 'OpenAI',
      capabilities: 'text',
      status: 'live',
    });
    expect(result.success).toBe(false);
  });

  it('accepts preview status', () => {
    const result = ModelEntrySchema.safeParse({
      id: 'gpt-5-preview',
      provider: 'OpenAI',
      capabilities: ['text'],
      status: 'preview',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty capabilities array', () => {
    const result = ModelEntrySchema.safeParse({
      id: 'embedding-model',
      provider: 'OpenAI',
      capabilities: [],
      status: 'live',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-number contextWindow', () => {
    const result = ModelEntrySchema.safeParse({
      id: 'gpt-4o',
      provider: 'OpenAI',
      capabilities: ['text'],
      contextWindow: '128K',
      status: 'live',
    });
    expect(result.success).toBe(false);
  });
});
