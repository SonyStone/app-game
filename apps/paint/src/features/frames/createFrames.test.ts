// @vitest-environment jsdom
import { defaultCamera, type Camera } from '@app-game/paint-core/camera';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createFrames, frameRegion } from './createFrames';
import { framesFeature } from './framesFeature';

afterEach(() => {
  history.replaceState(null, '', '/');
});

it('adds frames covering the view, names, renames and removes them, and saves them with the document', () => {
  const { frames, sent, dispose } = setup();
  const first = frames.addFromView()!;
  flush();
  // The view is 800 × 600 CSS pixels at 200%, centered on (100, 50).
  expect(first).toMatchObject({ name: 'Frame 1', left: -100, top: -100, width: 400, height: 300 });
  expect(frames.activeFrame()?.id).toBe(first.id);
  const second = frames.addFromView()!;
  expect(second.name).toBe('Frame 2');

  frames.resize(second.id, { left: 10.4, top: -3.6, width: 0.2, height: 50.2 });
  flush();
  expect(frames.frames()[1]).toMatchObject({ left: 10, top: -4, width: 1, height: 51 });
  frames.rename(first.id, '  Cover  ');
  frames.remove(second.id);
  flush();
  expect(frames.frames().map((frame) => frame.name)).toEqual(['Cover']);
  expect(frames.activeFrame()).toBeUndefined();
  expect(frames.rename(first.id, '   ')).toBe(false);

  const saved = sent.filter((command) => command.type === 'feature').at(-1)!;
  expect(framesFeature.read({ frames: saved.type === 'feature' && saved.command })).toEqual({
    frames: [{ ...first, name: 'Cover' }]
  });
  dispose();
});

it('watches the active frame for the layers in it and shows a frame upright in the view', () => {
  const { frames, sent, camera, dispose } = setup();
  const frame = frames.addFromView()!;
  flush();
  expect(sent.filter((command) => command.type === 'watch-regions').at(-1)).toEqual({
    type: 'watch-regions',
    regions: { [frameRegion]: { left: -100, top: -100, width: 400, height: 300 } }
  });

  frames.activate(undefined);
  flush();
  expect(sent.at(-1)).toEqual({ type: 'watch-regions', regions: {} });

  frames.goTo(frame.id);
  flush();
  expect(camera()).toMatchObject({ x: 100, y: 50, zoom: 1.8, angle: 0 });
  dispose();
});

it('takes the frames of a loaded document and opens a linked frame once it exists', () => {
  history.replaceState(null, '', '/#frame=b%2F1');
  const { frames, setRestored, camera, dispose } = setup();
  const loaded = { frames: [{ id: 'b/1', name: 'Linked', left: 1000, top: 0, width: 200, height: 100 }] };
  setRestored({ frames: loaded });
  flush();
  expect(frames.activeFrame()?.name).toBe('Linked');
  expect(camera()).toMatchObject({ x: 1100, y: 50 });
  expect(frames.linkTo('b/1')).toBe(`${location.origin}/#frame=b%2F1`);
  dispose();
});

function setup() {
  return createRoot((dispose) => {
    const sent: Extract<PaintCommand, { type: 'feature' | 'watch-regions' }>[] = [];
    const [camera, setCamera] = createSignal<Camera>({ ...defaultCamera(), x: 100, y: 50, zoom: 2, angle: 0.3 });
    const [restored, setRestored] = createSignal<Record<string, unknown>>();
    const frames = createFrames({
      restored,
      canUpdate: () => true,
      send: (command) => sent.push(command),
      navigate: setCamera,
      camera,
      size: () => ({ width: 800, height: 600 })
    });
    flush();
    return { frames, sent, camera, setRestored, dispose };
  });
}
