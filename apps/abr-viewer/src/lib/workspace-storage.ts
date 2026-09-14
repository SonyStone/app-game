import { createEffect, onCleanup, onSettled } from 'solid-js';
import type { Workspace } from './workspace';
import { packBrushData, unpackBrushData } from './workspace-binary';

/** Restores parsed brushes and edits without fetching, parsing, or regenerating tip PNGs.
 * Writes are serialized and coalesced after edits; drawing never touches this database.
 * Binary chunks are stored separately from editable metadata, unlike JSON storage adapters.
 */
export function persistWorkspace(workspace: Workspace, report: (message: string) => void) {
  let db: IDBDatabase | undefined;
  let disposed = false;
  let ready = false;
  let pending: ReturnType<Workspace['snapshot']> | undefined;
  let writing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const initial = workspace.root();

  async function flush() {
    if (!db || writing || !pending) return;
    const value = pending;
    pending = undefined;
    writing = true;
    try { await writeWorkspace(db, value); }
    catch (error) { if (!disposed) report(`Brush library could not be saved locally: ${String(error)}`); }
    finally {
      writing = false;
      if (pending) void flush();
      else if (disposed) db.close();
    }
  }
  createEffect(() => workspace.snapshot(), snapshot => {
    if (!ready) return;
    pending = snapshot;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 800);
  });
  onSettled(() => {
    void openWorkspaceDatabase().then(async database => {
      db = database;
      const snapshot = await readWorkspace(database);
      if (disposed) { database.close(); return; }
      // A late restore must never overwrite an import already started by the user.
      if (snapshot && workspace.root() === initial) workspace.restore(snapshot);
      ready = true;
      if (workspace.root() !== initial && !snapshot) {
        pending = workspace.snapshot();
        void flush();
      } else if (snapshot && workspace.root() !== snapshot.root) {
        pending = workspace.snapshot();
        void flush();
      }
    }).catch(error => {
      db?.close();
      if (!disposed) report(`Local brush library unavailable: ${String(error)}`);
    });
  });
  onCleanup(() => {
    disposed = true;
    clearTimeout(timer);
    if (pending) void flush();
    else if (!writing) db?.close();
  });
}

/** Dedicated database; schema versions can migrate independently of Paint documents. */
export function openWorkspaceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('abr-workspace', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace');
      request.result.createObjectStore('binary');
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other brush editor tabs to update local storage.'));
  });
}

/** Reads a complete checkpoint including ABR source resources needed by export. */
export function readWorkspace(db: IDBDatabase): Promise<ReturnType<Workspace['snapshot']> | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspace').objectStore('workspace').get('current');
    request.onsuccess = () => {
      void unpackBrushData(request.result, (id, length) => readBytes(db, id, length)).then(value => resolve(value as ReturnType<Workspace['snapshot']> | undefined), reject);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Writes missing binary chunks before atomically replacing the metadata checkpoint.
 * A failed/aborted save leaves the last complete workspace usable.
 */
export async function writeWorkspace(db: IDBDatabase, snapshot: ReturnType<Workspace['snapshot']>): Promise<void> {
  const packed = packBrushData(snapshot);
  for (const [id, bytes] of packed.buffers) {
    if (knownBytes(db).has(id)) continue;
    if (await getRecord(db, 'binary', id) !== bytes.byteLength) {
      for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
        await putRecord(db, 'binary', `${id}:${offset}`, bytes.slice(offset, offset + CHUNK_BYTES));
      }
      await putRecord(db, 'binary', id, bytes.byteLength);
    }
    knownBytes(db).add(id);
  }
  await putRecord(db, 'workspace', 'current', packed.value);
}

async function readBytes(db: IDBDatabase, id: string, length: number) {
  const bytes = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += CHUNK_BYTES) {
    const chunk = await getRecord(db, 'binary', `${id}:${offset}`);
    if (!(chunk instanceof Uint8Array) || chunk.length !== Math.min(CHUNK_BYTES, length - offset))
      throw new Error('Stored brush data is incomplete. Reimport the affected library.');
    bytes.set(chunk, offset);
  }
  knownBytes(db).add(id);
  return bytes;
}
function getRecord(db: IDBDatabase, store: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function putRecord(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Brush library save aborted.'));
    transaction.onerror = () => reject(transaction.error);
  });
}
const CHUNK_BYTES = 8 * 1024 * 1024;

function knownBytes(db: IDBDatabase) {
  let known = stored.get(db);
  if (!known) { known = new Set<string>(); stored.set(db, known); }
  return known;
}
const stored = new WeakMap<IDBDatabase, Set<string>>();
