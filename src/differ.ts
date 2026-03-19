import type { ModelEntry } from './types.ts';

export type ChangeType = 'added' | 'removed' | 'modified';

export interface ChangeEntry {
  type: ChangeType;
  model: ModelEntry;
  // For "modified" changes, what fields changed and their previous values
  previous?: Partial<ModelEntry>;
  date: string; // ISO date string
}

export interface Changelog {
  generatedAt: string;
  changes: ChangeEntry[];
}

/**
 * Compares a new model list against the previous (cached) list and returns a changelog.
 * If no baseline is provided (first run), all models are treated as "added".
 */
export function diff(
  current: ModelEntry[],
  previous: ModelEntry[] | null,
  date: string = new Date().toISOString().slice(0, 10),
): Changelog {
  if (!previous) {
    // First run: treat everything as added
    return {
      generatedAt: new Date().toISOString(),
      changes: current.map(model => ({ type: 'added', model, date })),
    };
  }

  const previousMap = new Map<string, ModelEntry>(
    previous.map(m => [`${m.provider}::${m.id}`, m]),
  );
  const currentMap = new Map<string, ModelEntry>(
    current.map(m => [`${m.provider}::${m.id}`, m]),
  );

  const changes: ChangeEntry[] = [];

  // Detect added and modified models
  for (const [key, model] of currentMap) {
    const prev = previousMap.get(key);
    if (!prev) {
      changes.push({ type: 'added', model, date });
    } else {
      const diff = findModifications(prev, model);
      if (diff) {
        changes.push({ type: 'modified', model, previous: diff, date });
      }
    }
  }

  // Detect removed models
  for (const [key, model] of previousMap) {
    if (!currentMap.has(key)) {
      changes.push({ type: 'removed', model, date });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    changes,
  };
}

/**
 * Returns a partial ModelEntry with the previous values of fields that changed,
 * or null if nothing changed.
 */
function findModifications(
  prev: ModelEntry,
  curr: ModelEntry,
): Partial<ModelEntry> | null {
  const changed: Partial<ModelEntry> = {};

  if (prev.name !== curr.name) changed.name = prev.name;
  if (prev.status !== curr.status) changed.status = prev.status;
  if (prev.contextWindow !== curr.contextWindow) changed.contextWindow = prev.contextWindow;

  const prevCaps = [...prev.capabilities].sort().join(',');
  const currCaps = [...curr.capabilities].sort().join(',');
  if (prevCaps !== currCaps) changed.capabilities = prev.capabilities;

  return Object.keys(changed).length > 0 ? changed : null;
}
