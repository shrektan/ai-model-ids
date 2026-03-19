import { describe, it, expect } from 'bun:test';
import { diff } from '../src/differ.ts';
import type { ModelEntry } from '../src/types.ts';

const makeModel = (overrides: Partial<ModelEntry> & { id: string; provider: string }): ModelEntry => ({
  capabilities: ['text'],
  status: 'live',
  ...overrides,
});

describe('diff', () => {
  it('treats all models as added when no baseline', () => {
    const current = [
      makeModel({ id: 'a', provider: 'X' }),
      makeModel({ id: 'b', provider: 'X' }),
    ];

    const changelog = diff(current, null, '2026-01-01');

    expect(changelog.changes).toHaveLength(2);
    expect(changelog.changes.every(c => c.type === 'added')).toBe(true);
  });

  it('detects added models', () => {
    const previous = [makeModel({ id: 'a', provider: 'X' })];
    const current  = [makeModel({ id: 'a', provider: 'X' }), makeModel({ id: 'b', provider: 'X' })];

    const changelog = diff(current, previous, '2026-01-01');

    const added = changelog.changes.filter(c => c.type === 'added');
    expect(added).toHaveLength(1);
    expect(added[0]!.model.id).toBe('b');
  });

  it('detects removed models', () => {
    const previous = [makeModel({ id: 'a', provider: 'X' }), makeModel({ id: 'b', provider: 'X' })];
    const current  = [makeModel({ id: 'a', provider: 'X' })];

    const changelog = diff(current, previous, '2026-01-01');

    const removed = changelog.changes.filter(c => c.type === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0]!.model.id).toBe('b');
  });

  it('detects modified status', () => {
    const previous = [makeModel({ id: 'a', provider: 'X', status: 'live' })];
    const current  = [makeModel({ id: 'a', provider: 'X', status: 'deprecated' })];

    const changelog = diff(current, previous, '2026-01-01');

    const modified = changelog.changes.filter(c => c.type === 'modified');
    expect(modified).toHaveLength(1);
    expect(modified[0]!.previous?.status).toBe('live');
    expect(modified[0]!.model.status).toBe('deprecated');
  });

  it('detects modified contextWindow', () => {
    const previous = [makeModel({ id: 'a', provider: 'X', contextWindow: 128_000 })];
    const current  = [makeModel({ id: 'a', provider: 'X', contextWindow: 256_000 })];

    const changelog = diff(current, previous, '2026-01-01');

    const modified = changelog.changes.filter(c => c.type === 'modified');
    expect(modified).toHaveLength(1);
    expect(modified[0]!.previous?.contextWindow).toBe(128_000);
  });

  it('produces no changes for identical lists', () => {
    const models = [
      makeModel({ id: 'a', provider: 'X', contextWindow: 128_000 }),
      makeModel({ id: 'b', provider: 'X', status: 'preview' }),
    ];

    const changelog = diff(models, models, '2026-01-01');

    expect(changelog.changes).toHaveLength(0);
  });

  it('uses provider+id as composite key (same id, different providers)', () => {
    const previous = [
      makeModel({ id: 'model-1', provider: 'A', status: 'live' }),
      makeModel({ id: 'model-1', provider: 'B', status: 'live' }),
    ];
    const current = [
      makeModel({ id: 'model-1', provider: 'A', status: 'live' }),
      makeModel({ id: 'model-1', provider: 'B', status: 'deprecated' }),
    ];

    const changelog = diff(current, previous, '2026-01-01');

    const modified = changelog.changes.filter(c => c.type === 'modified');
    expect(modified).toHaveLength(1);
    expect(modified[0]!.model.provider).toBe('B');
  });

  it('includes date on all change entries', () => {
    const previous = [makeModel({ id: 'a', provider: 'X' })];
    const current  = [makeModel({ id: 'b', provider: 'X' })];

    const changelog = diff(current, previous, '2026-03-19');

    for (const c of changelog.changes) {
      expect(c.date).toBe('2026-03-19');
    }
  });
});
