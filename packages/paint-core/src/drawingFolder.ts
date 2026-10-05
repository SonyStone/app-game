/**
 * A drawing kept in a folder on disk: `drawing.json` holds the checkpoint, its tiles referring to versions by id, and
 * `tiles/<first two characters>/<id>` each version, compressed as in IndexedDB (`compressTile`). Versions are
 * immutable, so a version is written once and later checkpoints add only new ones. `drawing.json` is replaced whole,
 * so the folder always holds a complete drawing. Works on any `FileSystemDirectoryHandle`: a folder the user chose
 * with the File System Access API, or the origin private file system.
 */
export function openDrawingFolder(directory: FileSystemDirectoryHandle) {
  /** Shard folders by name, made on first use. */
  const shards = new Map<string, Promise<FileSystemDirectoryHandle>>();
  let tiles: Promise<FileSystemDirectoryHandle> | undefined;

  return {
    /** The folder's name, as the user knows it. */
    name: directory.name,
    directory,
    /** Whether the folder holds a drawing. */
    async hasDrawing() {
      try {
        await directory.getFileHandle(drawingFile);
        return true;
      } catch {
        return false;
      }
    },
    /** The checkpoint in `drawing.json`, unvalidated. Throws when there is none or it is not JSON. */
    async readDrawing(): Promise<unknown> {
      const file = await (await directory.getFileHandle(drawingFile)).getFile();
      const value: unknown = JSON.parse(await file.text());
      if (!value || typeof value !== 'object' || !('format' in value) || value.format !== folderFormat) {
        throw new Error('This folder does not hold a drawing.');
      }

      return 'document' in value ? value.document : undefined;
    },
    /** Replaces `drawing.json` with `checkpoint`; the write lands whole when it completes. */
    async writeDrawing(checkpoint: unknown) {
      await writeFile(
        directory,
        drawingFile,
        JSON.stringify({ format: folderFormat, version: 1, document: checkpoint })
      );
    },
    /** Ids of the versions in the folder. */
    async listTiles() {
      const ids = new Set<string>();
      for await (const shard of (await tileFolder()).values()) {
        if (shard.kind === 'directory') {
          for await (const entry of shard.values()) {
            if (entry.kind === 'file') {
              ids.add(entry.name);
            }
          }
        }
      }

      return ids;
    },
    /** The stored bytes of version `id`. Throws when the folder has none. */
    async readTile(id: string) {
      const file = await (await (await shard(id, false)).getFileHandle(id)).getFile();
      return new Uint8Array(await file.arrayBuffer());
    },
    /** Writes the stored bytes of version `id`. */
    async writeTile(id: string, stored: Uint8Array) {
      await writeFile(await shard(id, true), id, stored);
    },
    /** Removes version `id`, if the folder has it. */
    async deleteTile(id: string) {
      try {
        await (await shard(id, false)).removeEntry(id);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
          throw error;
        }
      }
    }
  };

  function tileFolder() {
    tiles ??= directory.getDirectoryHandle(tilesFolder, { create: true });
    return tiles;
  }

  async function shard(id: string, create: boolean) {
    const name = id.slice(0, 2);
    let pending = shards.get(name);
    if (!pending) {
      pending = tileFolder().then((folder) => folder.getDirectoryHandle(name, { create }));
      // A shard that is not there yet may be made by a later write.
      pending.catch(() => shards.delete(name));
      shards.set(name, pending);
    }

    return pending;
  }
}

/** A drawing folder; see `openDrawingFolder`. */
export type DrawingFolder = ReturnType<typeof openDrawingFolder>;

/** Writes `contents` to the file `name` in `directory`, replacing it. */
async function writeFile(directory: FileSystemDirectoryHandle, name: string, contents: Uint8Array | string) {
  const writable = await (await directory.getFileHandle(name, { create: true })).createWritable();
  try {
    await writable.write(contents as FileSystemWriteChunkType);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

const drawingFile = 'drawing.json';
const tilesFolder = 'tiles';
const folderFormat = 'paint-folder';
