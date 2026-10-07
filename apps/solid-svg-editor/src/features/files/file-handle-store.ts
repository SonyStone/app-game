import { objectStore, request } from '../../editor/idb';

/**
 * Keeps the files tabs are bound to across reloads. Restored tabs get fresh ids, so the handles are stored as a list in
 * tab order, the order `tab-persistence` restores the tabs in (`null` for a tab without a file). File System Access
 * handles can't go into localStorage but are structured-cloneable, so the list lives in IndexedDB. Failures (private
 * mode, blocked storage) are swallowed: bindings then last only for the session.
 */
export const fileHandleStore = {
  async load(): Promise<readonly (FileSystemFileHandle | null)[]> {
    try {
      const stored: unknown = await request((await objectStore('file-handles', 'readonly')).get(recordKey));
      return Array.isArray(stored) ? (stored as (FileSystemFileHandle | null)[]) : [];
    } catch {
      return [];
    }
  },

  async save(handles: readonly (FileSystemFileHandle | null)[]): Promise<void> {
    try {
      await request((await objectStore('file-handles', 'readwrite')).put(handles, recordKey));
    } catch {
      // Session-only bindings.
    }
  }
};

const recordKey = 'tabs';
