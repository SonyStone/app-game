import { createEffect, createSignal, onSettled, untrack, type Accessor } from 'solid-js';

import { downloadBlob } from '../../editor/export-utils';
import type { EditorTab } from '../../editor/types';
import type { ImportTarget } from '../import/createImportReview';
import { fileHandleStore } from './file-handle-store';

/** A paragraph of an alert: an English GodSVG message with placeholder values, translated where it is shown. */
export type AlertMessage = {
  readonly text: string;
  readonly values?: Readonly<Record<string, string>>;
  /** Translate the placeholder values too (they name actions, such as "Reset SVG"). */
  readonly translateValues?: boolean;
};

/**
 * GodSVG's file-bound tabs, on the File System Access API: SVGs opened through the file picker or dropped from the
 * file manager stay bound to their file, so Save writes back to it, "Save SVG as" picks a new file and rebinds, and
 * "Reset SVG" reloads it. Bindings survive reloads (see `fileHandleStore`). Opening a file that a tab already edits selects that
 * tab with GodSVG's alert. Importing into an empty, unsaved tab replaces it. Without the API (Firefox, Safari) files
 * open through `openFallbackDialog` and Save downloads.
 */
export function createFileBinding(options: {
  readonly tabs: Accessor<readonly EditorTab[]>;
  readonly activeTabId: Accessor<string>;
  readonly selectTab: (tabId: string) => void;
  /** The text saved for a tab: its document with the export formatter. */
  readonly exportTextOf: (tab: EditorTab) => string;
  readonly markTabClean: (tabId: string) => void;
  readonly renameTab: (tabId: string, name: string) => void;
  /** Replaces the active tab's document with SVG text, as an undoable edit. */
  readonly replaceActiveText: (text: string) => void;
  /** Opens text in a tab after the import review. */
  readonly requestImport: (text: string, name: string, target: ImportTarget) => void;
  readonly openFallbackDialog: () => void;
  readonly alert: (messages: readonly AlertMessage[]) => void;
  /** GodSVG's "Sync window title to file name": the title shows the bound file's name. */
  readonly syncWindowTitle: Accessor<boolean>;
}) {
  const [handles, setHandles] = createSignal<ReadonlyMap<string, FileSystemFileHandle>>(new Map());
  const pickerWindow = window as FilePickerWindow;
  const supported = typeof pickerWindow.showOpenFilePicker === 'function' && typeof pickerWindow.showSaveFilePicker === 'function';
  const baseTitle = document.title;

  // Restore the bindings of the tabs restored at startup, then keep the stored list in step with the tabs.
  const restoredTabIds = untrack(() => options.tabs().map((tab) => tab.id));
  const [restored, setRestored] = createSignal(false);

  onSettled(() => {
    void fileHandleStore.load().then((stored) => {
      const entries = stored.flatMap((handle, index) => {
        const tabId = restoredTabIds[index];
        return handle && tabId ? [[tabId, handle] as const] : [];
      });
      setHandles((current) => new Map([...entries, ...current]));
      setRestored(true);
    });
  });

  createEffect(
    () => (restored() ? options.tabs().map((tab) => handles().get(tab.id) ?? null) : undefined),
    (list) => {
      if (list) {
        void fileHandleStore.save(list);
      }
    }
  );

  createEffect(
    () => {
      const tab = options.tabs().find((item) => item.id === options.activeTabId());
      return options.syncWindowTitle() && tab && handles().has(tab.id) ? `${tab.name} - ${baseTitle}` : baseTitle;
    },
    (title) => {
      document.title = title;
    }
  );

  function bind(tabId: string, handle: FileSystemFileHandle): void {
    setHandles((current) => new Map(current).set(tabId, handle));
  }

  /** Opens SVG files through the system picker, or the fallback file input. */
  async function openFiles(): Promise<void> {
    if (!supported) {
      options.openFallbackDialog();
      return;
    }

    let picked: readonly FileSystemFileHandle[];

    try {
      picked = await pickerWindow.showOpenFilePicker!({ multiple: true, types: svgFileTypes, excludeAcceptAllOption: false });
    } catch {
      return;
    }

    await openHandles(picked);
  }

  /** Opens files the user picked or dropped; each stays bound to its tab. */
  async function openHandles(picked: readonly FileSystemFileHandle[]): Promise<void> {
    for (const handle of picked) {
      const existing = await tabEditing(handle);
      const file = await handle.getFile();
      const text = await file.text();

      if (existing) {
        options.selectTab(existing.id);
        const messages: AlertMessage[] = [{ text: '{file_path} is already being edited inside GodSVG.', values: { file_path: file.name } }];

        if (text !== options.exportTextOf(existing)) {
          messages.push({
            text: 'If you want to discard your edits and sync to the file\'s current content, use "{reset_svg}".',
            values: { reset_svg: 'Reset SVG' },
            translateValues: true
          });
        }

        options.alert(messages);
        continue;
      }

      importText(text, file.name, handle);
    }
  }

  /** Imports SVG text, bound to `handle` when given, replacing the active tab if it is empty and unsaved. */
  function importText(text: string, name: string, handle?: FileSystemFileHandle): void {
    const active = options.tabs().find((tab) => tab.id === options.activeTabId());
    const replaced = active && isEmptyUnsaved(active) ? active.id : undefined;

    options.requestImport(text, name, {
      ...(replaced ? { replaceTabId: replaced } : {}),
      onImported: (tabId) => {
        if (handle) {
          bind(tabId, handle);
        }
      }
    });
  }

  function isEmptyUnsaved(tab: EditorTab): boolean {
    return tab.document.root.children.length === 0 && !tab.dirty && tab.parseError === undefined && !handles().has(tab.id);
  }

  async function tabEditing(handle: FileSystemFileHandle): Promise<EditorTab | undefined> {
    for (const tab of options.tabs()) {
      const bound = handles().get(tab.id);

      if (bound && (await bound.isSameEntry(handle))) {
        return tab;
      }
    }

    return undefined;
  }

  /**
   * GodSVG's Save: writes the tab to its file, or asks where to save it first. Resolves `false` when nothing was
   * saved (the picker was cancelled or writing failed), so a closing tab stays open.
   */
  async function save(tabId: string): Promise<boolean> {
    const tab = options.tabs().find((item) => item.id === tabId);
    const handle = handles().get(tabId);

    if (!tab) {
      return false;
    }

    if (handle && (await write(handle, options.exportTextOf(tab)))) {
      options.markTabClean(tabId);
      return true;
    }

    return saveAs(tabId);
  }

  /** GodSVG's "Save SVG as": picks a file, writes the tab to it, and binds and renames the tab. */
  async function saveAs(tabId: string): Promise<boolean> {
    const tab = options.tabs().find((item) => item.id === tabId);

    if (!tab) {
      return false;
    }

    const text = options.exportTextOf(tab);

    if (!supported) {
      downloadBlob(text, tab.name, 'image/svg+xml');
      options.markTabClean(tabId);
      return true;
    }

    let handle: FileSystemFileHandle;

    try {
      handle = await pickerWindow.showSaveFilePicker!({ suggestedName: tab.name, types: svgFileTypes });
    } catch {
      return false;
    }

    if (!(await write(handle, text))) {
      return false;
    }

    bind(tabId, handle);
    options.renameTab(tabId, handle.name);
    options.markTabClean(tabId);
    return true;
  }

  /** GodSVG's "Reset SVG": replaces the active tab's document with its file's current content. */
  async function resetSvg(): Promise<void> {
    const tabId = options.activeTabId();
    const handle = handles().get(tabId);

    if (!handle) {
      return;
    }

    try {
      const text = await (await handle.getFile()).text();

      if (options.activeTabId() === tabId) {
        options.replaceActiveText(text);
        options.markTabClean(tabId);
      }
    } catch {
      options.alert([{ text: 'Check if the file still exists in the selected file path.' }]);
    }
  }

  return {
    /** Whether files can be bound (the browser has the File System Access API). */
    supported,
    /** The bound file's name, or `undefined` for a tab without a file. */
    fileName: (tabId: string) => handles().get(tabId)?.name,
    openFiles,
    openHandles,
    importText,
    save,
    saveAs,
    resetSvg
  };
}

const svgFileTypes = [{ description: 'SVG', accept: { 'image/svg+xml': ['.svg'] } }];

/** Writes text to a file, asking for write permission first (a restored handle starts without it). */
async function write(handle: FileSystemFileHandle, text: string): Promise<boolean> {
  try {
    const permissioned = handle as PermissionedHandle;
    const mode = { mode: 'readwrite' } as const;

    if (permissioned.queryPermission && (await permissioned.queryPermission(mode)) !== 'granted') {
      if ((await permissioned.requestPermission?.(mode)) !== 'granted') {
        return false;
      }
    }

    const stream = await handle.createWritable();
    await stream.write(text);
    await stream.close();
    return true;
  } catch {
    return false;
  }
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options: {
    readonly multiple?: boolean;
    readonly types?: typeof svgFileTypes;
    readonly excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: { readonly suggestedName?: string; readonly types?: typeof svgFileTypes }) => Promise<FileSystemFileHandle>;
};

type PermissionedHandle = FileSystemFileHandle & {
  queryPermission?: (descriptor: { readonly mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { readonly mode: 'readwrite' }) => Promise<PermissionState>;
};
