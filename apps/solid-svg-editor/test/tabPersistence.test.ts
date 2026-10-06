import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEmptySvgDocument } from '../src/editor/svg-document';
import type { EditorTab } from '../src/editor/types';
import { createTabPersistence, restorePersistedTabs } from '../src/features/documents/tab-persistence';

describe('tab persistence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves tabs after changes settle and restores them with fresh ids', () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    const tabs: readonly EditorTab[] = [
      tab('a', 'one.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>', false),
      tab('b', 'broken.svg', '<svg><g></svg>', true)
    ];
    const dispose = createRoot((dispose) => {
      const [currentTabs] = createSignal(tabs);
      const [activeTabId] = createSignal('b');
      createTabPersistence({ tabs: currentTabs, activeTabId, storage });
      return dispose;
    });

    flush();
    vi.advanceTimersByTime(500);
    dispose();

    const restored = restorePersistedTabs(storage);

    expect(restored?.tabs.map((item) => [item.name, item.dirty, item.parseError !== undefined])).toEqual([
      ['one.svg', false, false],
      ['broken.svg', true, true]
    ]);
    expect(restored?.tabs[0]?.document.root.children).toHaveLength(1);
    expect(restored?.activeTabId).toBe(restored?.tabs[1]?.id);
    expect(restored?.tabs.map((item) => item.id)).not.toContain('a');
  });

  it('ignores missing or malformed storage', () => {
    const storage = createMemoryStorage();

    expect(restorePersistedTabs(storage)).toBeUndefined();

    storage.setItem('solid-svg-editor-tabs-v1', '{"tabs":[{"name":1}],"activeIndex":0}');

    expect(restorePersistedTabs(storage)).toBeUndefined();
  });
});

function tab(id: string, name: string, code: string, dirty: boolean): EditorTab {
  return { id, name, code, dirty, document: createEmptySvgDocument(), parseError: undefined };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
}
