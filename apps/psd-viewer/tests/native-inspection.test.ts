import { expect, it } from 'vitest';
import { nativeDeltas } from '../src/features/inspection/NativeInspection';
import { pathGeometry } from '../src/features/inspection/PathOverlay';
import { wireSample } from '../src/features/psd-worker/nativePixels';

it('compares native16 and float bits without a display RGB8 round trip', () => {
  const rect = { left: 25, top: 30, width: 1, height: 1 };
  const bytes = Uint8Array.of(0x12, 0x34);
  const saved = {
    depth: 16 as const,
    mode: 1,
    encoding: 'big-endian-wire' as const,
    source: 'savedComposite' as const,
    planes: [{ ...rect, id: 0, bytes }]
  };
  const internal = Math.round((0x1234 * 32768) / 65535);
  expect(
    nativeDeltas(
      {
        ...rect,
        strategy: 'window',
        approximations: [],
        channels: 4,
        depth: 16,
        encoding: 'rgba16-internal',
        samples: Uint16Array.of(internal + 1, internal, internal, 32768)
      },
      saved
    )
  ).toEqual([1]);
  const float = new Float32Array([0.125, 0.125, 0.125, 1]);
  const wire = new Uint8Array(4);
  new DataView(wire.buffer).setFloat32(0, 0.125, false);
  expect(
    nativeDeltas(
      {
        ...rect,
        strategy: 'window',
        approximations: [],
        channels: 4,
        depth: 32,
        encoding: 'rgba-f32-bits',
        samples: new Uint32Array(float.buffer)
      },
      { ...saved, depth: 32, planes: [{ ...rect, id: 0, bytes: wire }] }
    )
  ).toEqual([0]);
  expect(wireSample(saved, 0, 24, 30)).toBeUndefined();
  expect(wireSample(saved, 0, 25, 30)).toBe(0x1234);
});

it('uses supplied cubic handles in document pixels and preserves closure', () => {
  const knot = (anchor: number[], before: number[], after: number[]) => ({
    selector: 1,
    q24YX: [],
    anchor,
    before,
    after
  });
  const path = {
    recordIndex: 0,
    originationIndex: 0,
    closed: true,
    knots: [knot([10, 20], [8, 18], [12, 22]), knot([30, 40], [28, 38], [32, 42])]
  };
  expect(pathGeometry(path)).toBe('M 10 20 C 12 22 28 38 30 40 C 32 42 8 18 10 20 Z');
  expect(pathGeometry({ ...path, closed: false })).toBe('M 10 20 C 12 22 28 38 30 40');
});
