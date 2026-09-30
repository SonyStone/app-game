import { expect, it } from 'vitest';
import { createDocument } from './document';
import type { TileData } from './tilePixels';

it('selects past and redo states without mutating current layers, pixels or undo position', () => {
  const doc = createDocument();
  const a = new Uint8Array([1]),
    b = new Uint8Array([2]);
  doc.commit([{ layerId: doc.active.id, key: '0,0', before: undefined, after: a }]);
  doc.commit([{ layerId: doc.active.id, key: '0,0', before: a, after: b }]);
  doc.selectHistorySource(1);
  expect(doc.historySourceLayer(doc.active.id)!.tiles.get('0,0')).toBe(a);
  expect(doc.active.tiles.get('0,0')).toBe(b);
  expect(doc.state().canRedo).toBe(false);
  doc.undo();
  doc.selectHistorySource(2);
  expect(doc.active.tiles.get('0,0')).toBe(a);
  expect(doc.historySourceLayer(doc.active.id)!.tiles.get('0,0')).toBe(b);
  expect(doc.state().canRedo).toBe(true);
  doc.selectHistorySource(0);
  expect(doc.historySourceLayer(doc.active.id)!.tiles.size).toBe(0);
  expect(doc.active.tiles.size).toBe(1);
});

it('pins a selected source across history branching, pruning, persistence and garbage collection', () => {
  const doc = createDocument();
  const a = new Uint8Array([1]);
  doc.commit([{ layerId: doc.active.id, key: '0,0', before: undefined, after: a }]);
  doc.selectHistorySource(1);
  doc.undo();
  for (let i = 0; i < 110; i++) doc.changeLayer({ type: 'update', id: doc.active.id, patch: { opacity: i / 110 } });
  expect(doc.state().historyStates.some((state) => state.id === 1)).toBe(false);
  expect([...doc.snapshots()]).toContain(a);
  const reference: TileData = { storageId: 'source-version', byteLength: 1 };
  doc.persist((pixels) => (pixels === a ? reference : pixels));
  expect(doc.historySourceLayer(doc.active.id)!.tiles.get('0,0')).toBe(reference);
  expect([...doc.snapshots()]).toContain(reference);
  expect(() => doc.selectHistorySource(-1)).toThrow('no longer available');
});

it('reconstructs deleted layers, resets on open and preserves a handoff independently of current pixels', () => {
  const doc = createDocument();
  const firstId = doc.active.id;
  doc.changeLayer({ type: 'add' });
  const secondId = doc.active.id;
  const pixels = new Uint8Array([4]);
  doc.commit([{ layerId: secondId, key: '-1,0', before: undefined, after: pixels }]);
  doc.changeLayer({ type: 'delete', id: secondId });
  doc.selectHistorySource(2);
  expect(doc.historySourceLayer(secondId)!.tiles.get('-1,0')).toBe(pixels);
  expect(doc.layers).toHaveLength(1);
  const source = doc.historySourceSnapshot();
  doc.replace(doc.layers, firstId);
  expect(doc.historySourceLayer(secondId)).toBeUndefined();
  doc.restoreHistorySource(source);
  source.layers[1]!.tiles.clear();
  expect(doc.historySourceLayer(secondId)!.tiles.get('-1,0')).toBe(pixels);
  expect(doc.state().historyStates[0]!.id).not.toBe(doc.state().historySource.id);
});
