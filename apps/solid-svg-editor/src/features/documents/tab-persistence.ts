import { createEventListener } from '@solid-primitives/event-listener';
import { debounce } from '@solid-primitives/scheduled';
import { createTrackedEffect, type Accessor } from 'solid-js';

import { createEmptySvgDocument, parseSvgDocument } from '../../editor/svg-document';
import type { EditorTab } from '../../editor/types';
import { createId } from '../../svg-model';

const storageKey = 'solid-svg-editor-tabs-v1';

/** What is kept per tab: undo history and selection are not restored. */
type PersistedTabs = {
  readonly tabs: readonly { readonly name: string; readonly code: string; readonly dirty: boolean }[];
  readonly activeIndex: number;
};

/**
 * Rebuilds the tabs saved by `createTabPersistence` with fresh ids. Code that no longer parses is restored with its
 * parse error, like a failed import. Returns `undefined` when nothing usable is stored.
 */
export function restorePersistedTabs(
  storage: Storage | undefined = globalThis.localStorage
): { readonly tabs: readonly EditorTab[]; readonly activeTabId: string } | undefined {
  const saved = readPersistedTabs(storage);

  if (!saved || saved.tabs.length === 0) {
    return undefined;
  }

  const tabs = saved.tabs.map((tab): EditorTab => {
    const parsed = parseSvgDocument(tab.code);
    return parsed.ok
      ? { id: createId(), name: tab.name, document: parsed.document, code: tab.code, dirty: tab.dirty, parseError: undefined }
      : { id: createId(), name: tab.name, document: createEmptySvgDocument(), code: tab.code, dirty: tab.dirty, parseError: parsed.message };
  });
  const active = tabs[saved.activeIndex] ?? tabs[0];

  return active ? { tabs, activeTabId: active.id } : undefined;
}

/**
 * Saves the open tabs (name, code, unsaved flag) and the active tab to localStorage so a reload restores them, as
 * GodSVG keeps tabs between sessions. Writes are debounced and flushed when the page is hidden; a full storage quota
 * skips the write instead of throwing.
 */
export function createTabPersistence(options: {
  readonly tabs: Accessor<readonly EditorTab[]>;
  readonly activeTabId: Accessor<string>;
  readonly storage?: Storage | undefined;
}): void {
  const storage = options.storage ?? globalThis.localStorage;
  let pending: PersistedTabs | undefined;

  const write = () => {
    if (!pending || !storage) {
      return;
    }

    try {
      storage.setItem(storageKey, JSON.stringify(pending));
    } catch {
      // Quota exceeded or storage disabled: keep the editor working without persistence.
    }

    pending = undefined;
  };
  const scheduleWrite = debounce(write, 400);

  createTrackedEffect(() => {
    const tabs = options.tabs();
    const activeId = options.activeTabId();
    pending = {
      tabs: tabs.map((tab) => ({ name: tab.name, code: tab.code, dirty: tab.dirty })),
      activeIndex: Math.max(0, tabs.findIndex((tab) => tab.id === activeId))
    };
    scheduleWrite();
  });

  createEventListener(globalThis.window, 'pagehide', () => {
    scheduleWrite.clear();
    write();
  });
}

function readPersistedTabs(storage: Storage | undefined): PersistedTabs | undefined {
  try {
    const value: unknown = JSON.parse(storage?.getItem(storageKey) ?? 'null');
    return isPersistedTabs(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isPersistedTabs(value: unknown): value is PersistedTabs {
  if (typeof value !== 'object' || value === null || !('tabs' in value) || !('activeIndex' in value)) {
    return false;
  }

  return (
    Array.isArray(value.tabs) &&
    typeof value.activeIndex === 'number' &&
    value.tabs.every(
      (tab: unknown) =>
        typeof tab === 'object' &&
        tab !== null &&
        'name' in tab &&
        typeof tab.name === 'string' &&
        'code' in tab &&
        typeof tab.code === 'string' &&
        'dirty' in tab &&
        typeof tab.dirty === 'boolean'
    )
  );
}
