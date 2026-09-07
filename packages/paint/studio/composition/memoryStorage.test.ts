import { expect, it } from 'vitest';
import { defaultCamera } from '../camera';
import { createDocument, TILE_BYTES } from '../document';
import { snapshotDocument } from '../storage';
import { createMemoryStorage } from './memoryStorage';

it('isolates namespaces, snapshots pixels, and restores the checkpoint after reopening', async () => {
  const open = createMemoryStorage();
  const storage = await open('one');
  const doc = createDocument({ paged: true });
  const pixels = new Uint8Array(TILE_BYTES);
  pixels[0] = 127;
  const ref = storage.capture(pixels);
  pixels[0] = 200;
  doc.active.tiles.set('0,0', ref);
  await storage.save(snapshotDocument(doc.layers, doc.active.id, defaultCamera()));
  doc.active.tiles.clear();
  await storage.close();
  const reopened = await open('one');
  const saved = (await reopened.load())!;
  const tile = saved.layers[0]!.tiles.get('0,0')!;
  const read = await reopened.read(tile);
  expect(read[0]).toBe(127);
  read[0] = 12;
  expect((await reopened.read(tile))[0]).toBe(127);
  expect(await (await open('two')).load()).toBeUndefined();
  await expect(storage.read(ref)).rejects.toThrow('closed');
});

it('retains checkpoint and undo versions during collection and rejects invalid checkpoints atomically', async () => {
  const storage = await createMemoryStorage()('test');
  const doc = createDocument({ paged: true });
  const checkpoint = storage.capture(new Uint8Array(TILE_BYTES));
  const undo = storage.capture(new Uint8Array(TILE_BYTES));
  const obsolete = storage.capture(new Uint8Array(TILE_BYTES));
  doc.active.tiles.set('0,0', checkpoint);
  const snapshot = snapshotDocument(doc.layers, doc.active.id, defaultCamera());
  await storage.save(snapshot);
  await storage.collect([undo]);
  await expect(storage.read(checkpoint)).resolves.toHaveLength(TILE_BYTES);
  await expect(storage.read(undo)).resolves.toHaveLength(TILE_BYTES);
  await expect(storage.read(obsolete)).rejects.toThrow('could not be read');
  await expect(storage.save({ ...snapshot, activeId: 'missing' })).rejects.toThrow();
  expect((await storage.load())!.activeId).toBe(doc.active.id);
});
