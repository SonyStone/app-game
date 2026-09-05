import { describe, expect, it } from 'vitest';
import {
  MAX_RECORDING_MS,
  applyPointerSample,
  createPlayback,
  createRecording,
  stylusReveal,
  type PointerSample,
  type VirtualPointer
} from './pointer-recording';

describe('pointer recording', () => {
  it('retains browser measurements, rejects pre-recording samples and stops at sixty seconds', () => {
    const take = createRecording(800, 600, 1000);
    take.append(sample({ timeStamp: 999 }));
    take.append(sample({ timeStamp: 1000, pressure: 0.73, tiltX: 37, twist: 205 }));
    take.append(sample({ timeStamp: 61_000 }));
    take.append(sample({ timeStamp: 61_001 }));
    take.finish(70_000);
    expect(take.duration).toBe(MAX_RECORDING_MS);
    expect(take.samples).toHaveLength(2);
    expect(take.samples[0]).toMatchObject({ time: 0, timeStamp: 1000, pressure: 0.73, tiltX: 37, twist: 205 });
    expect(take.samples[1]?.time).toBe(60_000);
  });

  it('sorts delayed coalesced input and preserves ordering of simultaneous pointers', () => {
    const take = createRecording(800, 600, 0);
    take.append(sample({ timeStamp: 20, pointerId: 1 }));
    take.append(sample({ timeStamp: 10, pointerId: 2 }));
    take.append(sample({ timeStamp: 20, pointerId: 2 }));
    take.finish(30);
    expect(take.samples.map((point) => [point.time, point.pointerId])).toEqual([
      [10, 2],
      [20, 1],
      [20, 2]
    ]);
  });

  it('rebuilds simultaneous contacts and ink identically after backward seeking', () => {
    const take = createRecording(800, 600, 0);
    const events = [
      sample({ type: 'pointerdown', pointerId: 1, timeStamp: 10 }),
      sample({ type: 'pointerdown', pointerId: 2, timeStamp: 10 }),
      sample({ pointerId: 1, timeStamp: 20, x: 80 }),
      sample({ type: 'pointercancel', pointerId: 2, timeStamp: 25, buttons: 0 }),
      sample({ type: 'pointerup', pointerId: 1, timeStamp: 30, buttons: 0 })
    ];
    events.forEach((event) => take.append(event));
    take.finish(100);
    const pointers = new Map<number, VirtualPointer>();
    const delivered: PointerSample[] = [];
    const player = createPlayback(take, {
      reset() {
        pointers.clear();
        delivered.length = 0;
      },
      apply(point) {
        delivered.push(point);
        applyPointerSample(pointers, point);
      }
    });
    player.seek(22);
    const expected = structuredClone([...pointers]);
    expect([...pointers.values()].filter((pointer) => pointer.down)).toHaveLength(2);
    player.seek(100);
    expect([...pointers.values()].every((pointer) => !pointer.down)).toBe(true);
    player.seek(22);
    expect([...pointers]).toEqual(expected);
    expect(delivered).toHaveLength(3);
    player.seek(22);
    expect(delivered).toHaveLength(3);
    expect(player.seek(500)).toBe(100);
    expect(player.seek(-10)).toBe(0);
    expect(delivered).toHaveLength(0);
  });
});

describe('stylus contact animation', () => {
  it('leaves only the tip in hover and retains contact tilt throughout disappearance', () => {
    const pointers = new Map<number, VirtualPointer>();
    const hover = applyPointerSample(pointers, sample({ buttons: 0, pressure: 0 })).pointer;
    expect(stylusReveal(hover, 100)).toBe(0);
    const down = applyPointerSample(
      pointers,
      sample({ type: 'pointerdown', time: 100, tiltX: 42, tiltY: -20 })
    ).pointer;
    expect(stylusReveal(down, 100)).toBe(0);
    expect(stylusReveal(down, 230)).toBeCloseTo(0.5);
    expect(stylusReveal(down, 360)).toBe(1);
    const up = applyPointerSample(pointers, sample({ type: 'pointerup', time: 400, buttons: 0, pressure: 0 })).pointer;
    const nextHover = applyPointerSample(pointers, sample({ time: 410, buttons: 0, pressure: 0, tiltX: 0 })).pointer;
    expect(nextHover.pose.tiltX).toBe(42);
    expect(nextHover.pose.tiltY).toBe(-20);
    expect(stylusReveal(up, 490)).toBeCloseTo(0.5);
    expect(stylusReveal(nextHover, 580)).toBe(0);
  });

  it('reverses an interrupted reveal continuously and handles unexpected capture loss', () => {
    const pointers = new Map<number, VirtualPointer>();
    const down = applyPointerSample(pointers, sample({ type: 'pointerdown' })).pointer;
    const halfway = stylusReveal(down, 130);
    const up = applyPointerSample(pointers, sample({ type: 'pointerup', time: 130, buttons: 0 })).pointer;
    expect(stylusReveal(up, 130)).toBe(halfway);
    const nextDown = applyPointerSample(pointers, sample({ type: 'pointerdown', time: 180 })).pointer;
    expect(stylusReveal(nextDown, 180)).toBe(stylusReveal(up, 180));
    const lost = applyPointerSample(pointers, sample({ type: 'lostpointercapture', time: 190 })).pointer;
    expect(lost.down).toBe(false);
    expect(stylusReveal(lost, 500)).toBe(0);
  });
});

function sample(overrides: Partial<PointerSample> = {}): PointerSample {
  return {
    type: 'pointermove',
    time: 0,
    timeStamp: 0,
    x: 10,
    y: 20,
    pointerId: 1,
    pointerType: 'pen',
    isPrimary: true,
    pressure: 0.5,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    altitudeAngle: Math.PI / 2,
    azimuthAngle: 0,
    width: 1,
    height: 1,
    button: 0,
    buttons: 1,
    ...overrides
  };
}
