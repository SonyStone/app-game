import { expect, test } from 'vitest';
import { packBrushData, unpackBrushData } from '../src/lib/workspace-binary';

test('binary views become reusable references and round-trip sharing', async () => {
  const allocation = new Uint8Array(1024);
  const bytes = allocation.subarray(20, 24);
  bytes.set([2, 4, 8, 16]);
  const source = { bytes, again: bytes, nested: [{ value: 12, bytes }] };
  const packed = packBrushData(source);
  expect(packed.buffers.size).toBe(1);
  const restored = await unpackBrushData(structuredClone(packed.value), async id => packed.buffers.get(id)!.slice()) as typeof source;
  expect(restored).toEqual(source);
  expect(restored.bytes).toBe(restored.again);
  expect(restored.bytes).toBe(restored.nested[0]!.bytes);
  const repacked = packBrushData(restored);
  expect([...repacked.buffers.keys()]).toEqual([...packed.buffers.keys()]);
});
