import type { PaintCommand, StateEvent } from '@app-game/paint-core/protocol';
import { readLinkedFolder } from '@app-game/paint-core/tileStore';
import { createEffect } from 'solid-js';
import { engineError, type PaintError } from '../../shared/errors';

/**
 * Keeping the drawing in a folder on disk: the folder holds the drawing and every later save writes only what
 * changed, and a drawing opened from a folder is read from it as needed instead of being copied into the browser.
 * Needs the File System Access API, which Chrome offers on computers but not on Android; `supported` is false there.
 * A failure writing the folder is reported once through `onError`. Must be created within a Solid owner.
 */
export function createDrawingFolder(options: {
  /** The folder the engine reports, if the drawing is kept in one. */
  status: () => FolderStatus | undefined;
  send: (command: Extract<PaintCommand, { type: 'folder' }>) => void;
  onError: (error: PaintError) => void;
  /** Storage the engine keeps the drawing in; the engine's default. */
  storageName?: string;
}) {
  /** Looked up when used, so that a picker provided later, such as by a test, is found. */
  const picker = () =>
    typeof window === 'undefined' ? undefined : (window as Window & Partial<FolderPicker>).showDirectoryPicker;
  const supported = typeof picker() === 'function';
  createEffect(
    () => options.status()?.error,
    (error) => {
      if (error) {
        options.onError(engineError('failed', `The drawing could not be written to its folder: ${error}`));
      }
    }
  );

  return {
    supported,
    status: options.status,
    /**
     * Asks for a folder and keeps the drawing there from now on. A folder that already holds a drawing is replaced only
     * after the user agrees. Does nothing when the user cancels.
     */
    async save() {
      const directory = await pickFolder();
      if (!directory) {
        return;
      }

      if (
        (await holdsDrawing(directory)) &&
        !window.confirm(`“${directory.name}” already holds a drawing. Replace it with this one?`)
      ) {
        return;
      }

      options.send({ type: 'folder', action: 'save', directory });
    },
    /** Asks for a folder holding a drawing and opens it, kept there. Does nothing when the user cancels. */
    async open() {
      const directory = await pickFolder();
      if (directory) {
        options.send({ type: 'folder', action: 'open', directory });
      }
    },
    /** Stops keeping the drawing in its folder; the drawing stays in the browser. */
    unlink() {
      options.send({ type: 'folder', action: 'unlink' });
    },
    /** Asks the user to let the browser use the drawing's folder again, after a restart; call it from a click. */
    async allow() {
      try {
        const directory = await readLinkedFolder(options.storageName ?? defaultStorage);
        if (
          directory &&
          (await (directory as FolderPermission).requestPermission({ mode: 'readwrite' })) === 'granted'
        ) {
          options.send({ type: 'folder', action: 'access' });
        }
      } catch (error) {
        options.onError(engineError('failed', error instanceof Error ? error.message : String(error), error));
      }
    }
  };

  async function pickFolder() {
    try {
      return await picker()!.call(window, { id: 'paint-drawing', mode: 'readwrite' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return undefined;
      }

      options.onError(engineError('failed', error instanceof Error ? error.message : String(error), error));
      return undefined;
    }
  }
}

/** The drawing folder: its state and commands; see `createDrawingFolder`. */
export type DrawingFolderControl = ReturnType<typeof createDrawingFolder>;

/** The folder the engine reports; see the state event's `storage.folder`. */
export type FolderStatus = NonNullable<NonNullable<StateEvent['storage']>['folder']>;

/** Folder picking of the File System Access API, which TypeScript's DOM library leaves out as Chromium-only. */
type FolderPicker = {
  showDirectoryPicker(options: { id?: string; mode: 'readwrite' }): Promise<FileSystemDirectoryHandle>;
};

/** Asking for access to a handle again, also left out of TypeScript's DOM library. */
type FolderPermission = FileSystemDirectoryHandle & {
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
};

/** Whether `directory` already holds a drawing. */
async function holdsDrawing(directory: FileSystemDirectoryHandle) {
  try {
    await directory.getFileHandle('drawing.json');
    return true;
  } catch {
    return false;
  }
}

/** The engine's storage when the editor names none. */
const defaultStorage = 'paint-studio';
