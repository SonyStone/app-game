import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { defaultCamera } from './camera';
import { createDocument } from './document';
import { snapshotDocument } from './storage';
import { packTile, TILE_BYTES } from './tilePixels';
import { createTileStore } from './tileStore';

it('keeps a drawing in a folder, opens it from there and removes versions nothing needs', async () => {
  const directory = new MemoryDirectory('Sketches');
  const store = await createTileStore('folder-save');
  const document = createDocument({ paged: true });
  const first = packTile(new Uint8Array(TILE_BYTES).fill(120));
  document.commit([{ layerId: document.active.id, key: '0,0', before: undefined, after: first }]);
  document.persist(store.capture);
  await store.folder.save(directory as unknown as FileSystemDirectoryHandle);
  await store.save(snapshotDocument(document.layers, document.active.id, defaultCamera()));
  await store.folder.idle();
  expect(store.folder.status()).toEqual({ name: 'Sketches', access: 'granted', writing: false, pending: 0 });
  const saved = directory.files();
  expect(saved.filter((path) => path.startsWith('tiles/'))).toHaveLength(1);
  expect(saved).toContain('drawing.json');
  // Stored compressed, as in IndexedDB.
  expect(directory.size(saved.find((path) => path.startsWith('tiles/'))!)).toBeLessThan(TILE_BYTES / 50);

  // Opened elsewhere, the tiles stay in the folder and are read from it.
  const other = await createTileStore('folder-open');
  const opened = await other.folder.open(directory as unknown as FileSystemDirectoryHandle);
  await expect(other.read(opened.layers[0]!.tiles.get('0,0')!)).resolves.toEqual(first);

  // Unlinked, the drawing opened from the folder copies the versions it needs into IndexedDB first.
  await other.folder.unlink(() => opened.layers[0]!.tiles.values());
  expect(other.folder.status()).toBeUndefined();
  await other.close();
  const reopened = await createTileStore('folder-open');
  await expect(reopened.read(opened.layers[0]!.tiles.get('0,0')!)).resolves.toEqual(first);
  await reopened.close();

  // A new version replaces the old one; once nothing refers to the old one, it leaves the folder.
  const second = packTile(new Uint8Array(TILE_BYTES).fill(30));
  document.commit([
    { layerId: document.active.id, key: '0,0', before: document.active.tiles.get('0,0'), after: second }
  ]);
  document.persist(store.capture);
  await store.save(snapshotDocument(document.layers, document.active.id, defaultCamera()));
  await store.folder.idle();
  expect(directory.files().filter((path) => path.startsWith('tiles/'))).toHaveLength(2);
  await store.collect(() => document.active.tiles.values());
  await store.folder.idle();
  expect(directory.files().filter((path) => path.startsWith('tiles/'))).toHaveLength(1);
  await store.close();
});

it('refuses a folder without a drawing or with missing tiles', async () => {
  const store = await createTileStore('folder-refuse');
  const empty = new MemoryDirectory('Empty');
  await expect(store.folder.open(empty as unknown as FileSystemDirectoryHandle)).rejects.toThrow();

  const source = await createTileStore('folder-source');
  const directory = new MemoryDirectory('Broken');
  const document = createDocument({ paged: true });
  document.commit([
    { layerId: document.active.id, key: '0,0', before: undefined, after: packTile(new Uint8Array(TILE_BYTES).fill(9)) }
  ]);
  document.persist(source.capture);
  await source.folder.save(directory as unknown as FileSystemDirectoryHandle);
  await source.save(snapshotDocument(document.layers, document.active.id, defaultCamera()));
  await source.folder.idle();
  await source.close();
  directory.remove(directory.files().find((path) => path.startsWith('tiles/'))!);
  await expect(store.folder.open(directory as unknown as FileSystemDirectoryHandle)).rejects.toThrow('missing');
  await store.close();
});

/** The part of `FileSystemDirectoryHandle` a drawing folder uses, in memory. */
class MemoryDirectory {
  readonly kind = 'directory';
  #entries = new Map<string, MemoryDirectory | MemoryFile>();
  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let entry = this.#entries.get(name);
    if (!entry && options?.create) this.#entries.set(name, (entry = new MemoryDirectory(name)));
    if (!(entry instanceof MemoryDirectory)) throw new DOMException(name, 'NotFoundError');
    return entry;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    let entry = this.#entries.get(name);
    if (!entry && options?.create) this.#entries.set(name, (entry = new MemoryFile(name)));
    if (!(entry instanceof MemoryFile)) throw new DOMException(name, 'NotFoundError');
    return entry;
  }

  async removeEntry(name: string) {
    if (!this.#entries.delete(name)) throw new DOMException(name, 'NotFoundError');
  }

  async *values() {
    yield* this.#entries.values();
  }

  /** Paths of every file below, such as `tiles/ab/abcd…`. */
  files(): string[] {
    return [...this.#entries].flatMap(([name, entry]) =>
      entry instanceof MemoryDirectory ? entry.files().map((path) => `${name}/${path}`) : [name]
    );
  }

  size(path: string) {
    return this.#find(path).contents.byteLength;
  }

  remove(path: string) {
    const [name, ...rest] = path.split('/');
    const entry = this.#entries.get(name!);
    if (rest.length) (entry as MemoryDirectory).remove(rest.join('/'));
    else this.#entries.delete(name!);
  }

  #find(path: string): MemoryFile {
    const [name, ...rest] = path.split('/');
    const entry = this.#entries.get(name!)!;
    return rest.length ? (entry as MemoryDirectory).#find(rest.join('/')) : (entry as MemoryFile);
  }
}

class MemoryFile {
  readonly kind = 'file';
  contents = new Uint8Array();
  constructor(readonly name: string) {}

  async getFile() {
    return new Blob([this.contents]);
  }

  async createWritable() {
    let written = new Uint8Array();
    return {
      write: async (chunk: Uint8Array | string) => {
        written = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk.slice();
      },
      close: async () => {
        this.contents = written;
      },
      abort: async () => undefined
    };
  }
}
