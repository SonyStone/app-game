// @vitest-environment jsdom
import type { Sample } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickShape } from './createQuickShape';

let frames: (() => void)[] = [];
beforeEach(() => {
  frames = [];
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames[id - 1] = () => {};
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('replaces a held stroke with its shape, follows the pen once per frame and flushes the last move on release', () => {
  const { quickShape, sent, dispose } = setup();
  const drag = quickShape.strokeHold.hold(line(0, 0, 200, 0))!;
  expect(drag).toBeDefined();
  flush();
  expect(quickShape.hint()).toMatchObject({ name: 'Line', snapping: false });
  expect(sent).toHaveLength(1);
  expect(sent[0]!.samples[0]).toMatchObject({ x: 0, y: 0 });
  expect(sent[0]!.samples.at(-1)).toMatchObject({ x: 200, y: 0 });

  // The line turns and stretches around its start, so that its end follows the pen.
  drag.move(sample(0, 300));
  drag.move(sample(0, 100));
  expect(sent).toHaveLength(1);
  runFrames();
  expect(sent).toHaveLength(2);
  expect(sent[1]!.samples.at(-1)!.x).toBeCloseTo(0);
  expect(sent[1]!.samples.at(-1)!.y).toBeCloseTo(100);

  drag.move(sample(150, 0));
  drag.end(false);
  expect(sent).toHaveLength(3);
  expect(sent[2]!.samples.at(-1)!.x).toBeCloseTo(150);
  flush();
  expect(quickShape.hint()).toBeUndefined();
  runFrames();
  expect(sent).toHaveLength(3);
  dispose();
});

it('snaps while Shift is held or a finger touches the canvas', () => {
  const { quickShape, sent, dispose } = setup();
  const drag = quickShape.strokeHold.hold(line(0, 0, 200, 30))!;
  const angle = () => {
    const end = sent.at(-1)!.samples.at(-1)!;
    return (Math.atan2(end.y, end.x) * 180) / Math.PI;
  };
  expect(angle()).toBeCloseTo(8.53, 1);

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
  runFrames();
  expect(angle()).toBeCloseTo(15);
  flush();
  expect(quickShape.hint()).toMatchObject({ snapping: true, snap: 'Line at 15° steps' });
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey: false }));
  runFrames();
  expect(angle()).toBeCloseTo(8.53, 1);

  drag.fingers(1);
  runFrames();
  expect(angle()).toBeCloseTo(15);
  drag.end(false);
  dispose();
});

it('stops sending once cancelled, and leaves strokes alone when disabled, too small or not a shape', () => {
  const { quickShape, sent, dispose } = setup();
  const drag = quickShape.strokeHold.hold(line(0, 0, 200, 0))!;
  drag.move(sample(0, 100));
  quickShape.cancel();
  runFrames();
  drag.end(false);
  expect(sent).toHaveLength(1);
  flush();
  expect(quickShape.hint()).toBeUndefined();

  // 20 document pixels at zoom 1 is under the 24 CSS pixels a shape needs.
  expect(quickShape.strokeHold.hold(line(0, 0, 20, 0))).toBeUndefined();
  const scribble = Array.from({ length: 80 }, (_, index) => sample(index * 5, (index % 7) * 40 - (index % 3) * 25));
  expect(quickShape.strokeHold.hold(scribble)).toBeUndefined();

  quickShape.update({ enabled: false, delay: 5000 });
  flush();
  expect(quickShape.settings()).toEqual({ enabled: false, delay: 1500 });
  expect(quickShape.strokeHold.delay()).toBe(1500);
  expect(quickShape.strokeHold.hold(line(0, 0, 200, 0))).toBeUndefined();
  expect(JSON.parse(localStorage.getItem('paint.quickShape')!)).toEqual({ enabled: false, delay: 1500 });
  expect(sent).toHaveLength(1);
  dispose();
});

function setup() {
  const sent: Extract<PaintCommand, { type: 'replace-stroke' }>[] = [];
  return createRoot((dispose) => ({
    quickShape: createQuickShape({ send: (command) => sent.push(command), camera: defaultCamera }),
    sent,
    dispose
  }));
}

function runFrames() {
  const pending = frames;
  frames = [];
  pending.forEach((frame) => frame());
}

function line(x0: number, y0: number, x1: number, y1: number): Sample[] {
  return Array.from({ length: 40 }, (_, index) =>
    sample(x0 + ((x1 - x0) * index) / 39, y0 + ((y1 - y0) * index) / 39)
  );
}

function sample(x: number, y: number): Sample {
  return { x, y, pressure: 0.5, time: x + y };
}
