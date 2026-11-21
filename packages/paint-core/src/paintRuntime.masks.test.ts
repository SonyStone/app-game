// @vitest-environment jsdom
import { createBrushResources } from '@app-game/abr-paint/resources';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRendererDouble } from '../tests/fixtures/rendererDouble';
import { defaultBrush, type Brush } from './brush';
import type { BrushEngine, PaintModules } from './composition/contracts';
import { createMemoryStorage } from './composition/memoryStorage';
import { createDocument, type Layer } from './document';
import { isMaskPlane } from './gpu/maskPlane';
import { MASK_TILE_PIXELS, packMaskTile } from './layerMask';
import { maskStrokeBrush, maskStrokeRefusal } from './maskStroke';
import { createPaintRuntime } from './paintRuntime';
import type { PaintEvent } from './protocol';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('paints Reveal or Hide, written reversed into an inverted mask, mixing encoded values', () => {
  const brush = { ...defaultBrush(), color: '#ff0000', backgroundColor: '#00ff00' };
  expect(maskStrokeBrush(brush, { inverted: false }, 255)).toMatchObject({
    color: '#ffffff',
    backgroundColor: '#000000',
    mixing: 'classic',
    tool: 'brush'
  });
  expect(maskStrokeBrush(brush, { inverted: false }, 0)).toMatchObject({
    color: '#000000',
    backgroundColor: '#ffffff'
  });
  expect(maskStrokeBrush(brush, { inverted: true }, 255)).toMatchObject({
    color: '#000000',
    backgroundColor: '#ffffff'
  });
  // The eraser stays an eraser: it hides.
  expect(maskStrokeBrush({ ...brush, tool: 'eraser' }, { inverted: false }, 255).tool).toBe('eraser');
});

it('refuses tools that sample the canvas or a history state on a mask', () => {
  const abr = (type: string, extra = {}) =>
    ({ ...defaultBrush(), engine: { id: 'abr', settings: { values: { tool: { type, ...extra } } } } }) as Brush;
  expect(maskStrokeRefusal(defaultBrush(), undefined, 'round')).toBeUndefined();
  expect(maskStrokeRefusal({ ...defaultBrush(), tool: 'eraser' }, undefined, 'eraser')).toBeUndefined();
  expect(maskStrokeRefusal(abr('PbTl'), undefined, 'round')).toBeUndefined();
  expect(maskStrokeRefusal(abr('ErTl'), undefined, 'round')).toBeUndefined();
  expect(maskStrokeRefusal(abr('SmTl'), undefined, 'round')).toMatch(/^Smudge cannot paint a mask/);
  expect(maskStrokeRefusal(abr('MixB'), undefined, 'round')).toMatch(/^The Mixer Brush cannot/);
  expect(maskStrokeRefusal(abr('BlTl'), undefined, 'round')).toMatch(/^Blur cannot/);
  expect(maskStrokeRefusal(abr('ShTl'), undefined, 'round')).toMatch(/^Sharpen cannot/);
  expect(maskStrokeRefusal(abr('ErTl', { eraseToHistory: true }), undefined, 'round')).toMatch(/^Erase to History/);
  expect(maskStrokeRefusal(abr('ErTl'), { altKey: true }, 'round')).toMatch(/^Erase to History/);
  expect(maskStrokeRefusal(defaultBrush(), undefined, 'custom')).toMatch(/^This brush cannot paint a mask/);
});

it('pins a stroke to the mask it began on, commits coverage there, and paints pixels after the target changes', async () => {
  const context = await start();
  const { runtime, renderer, events, waitFor, layerId } = context;
  runtime.send({ type: 'layer', action: { type: 'add-mask', id: layerId } });
  await waitFor(() => state(events)?.activeTarget.type === 'mask');
  const maskId = (state(events)!.activeTarget as { id: string }).id;
  const coverage = packMaskTile(new Uint8Array(MASK_TILE_PIXELS).fill(9));
  renderer.finish.mockResolvedValueOnce([{ layerId: maskId, key: '0,0', before: undefined, after: coverage }]);

  runtime.send({ type: 'mask-paint', paint: 'hide' });
  runtime.send({ type: 'begin', brush: { ...defaultBrush(), color: '#ff0000' }, samples: [sample(1)] });
  await waitFor(() => context.begun.length === 1);
  const [first] = context.begun;
  expect(isMaskPlane(first!.layer)).toBe(true);
  expect(first!.layer.id).toBe(maskId);
  expect(first!.brush).toMatchObject({ color: '#000000', mixing: 'classic' });
  // Choosing the pixels mid-stroke finishes the stroke on the mask first.
  runtime.send({ type: 'layer', action: { type: 'select', id: layerId, target: 'pixels' } });
  await waitFor(() => state(events)?.activeTarget.type === 'pixels');
  const node = state(events)!.nodes.find((node) => node.id === layerId)!;
  expect(node.mask?.tileCount).toBe(1);
  expect(node.kind === 'raster' && node.tileCount).toBe(0);

  runtime.send({ type: 'begin', brush: defaultBrush(), samples: [sample(2)] });
  runtime.send({ type: 'end' });
  await waitFor(() => context.begun.length === 2);
  expect(context.begun[1]!.layer.id).toBe(layerId);
  expect(context.begun[1]!.brush.mixing).toBe('linear');
  await stop(context);
});

it('refuses a stroke a mask cannot take with an error, and ignores one on a hidden node’s mask', async () => {
  const context = await start();
  const { runtime, events, waitFor, layerId } = context;
  runtime.send({ type: 'layer', action: { type: 'add-mask', id: layerId } });
  await waitFor(() => state(events)?.activeTarget.type === 'mask');
  const smudge = { ...defaultBrush(), engine: { id: 'abr', settings: { values: { tool: { type: 'SmTl' } } } } };
  runtime.send({ type: 'begin', brush: smudge as Brush, samples: [sample(1)] });
  await waitFor(() => events.some((event) => event.type === 'error'));
  expect(events.find((event) => event.type === 'error')).toMatchObject({ message: expect.stringMatching(/^Smudge/) });
  expect(context.begun).toHaveLength(0);

  runtime.send({ type: 'layer', action: { type: 'update', id: layerId, patch: { visible: false } } });
  await waitFor(() => state(events)?.activePaintable === false);
  runtime.send({ type: 'begin', brush: defaultBrush(), samples: [sample(1)] });
  runtime.send({ type: 'end' });
  await vi.advanceTimersByTimeAsync(100);
  expect(context.begun).toHaveLength(0);
  await stop(context);
});

it('turns the red overlay on with a new mask, shows it only while the mask is painted, and toggles it', async () => {
  const context = await start();
  const { runtime, renderer, events, waitFor, layerId } = context;
  const overlaid = () => renderer.setMaskOverlay.mock.lastCall?.[0];
  expect(events.findLast((event) => event.type === 'state')).toMatchObject({ maskOverlay: false });
  runtime.send({ type: 'layer', action: { type: 'add-mask', id: layerId } });
  await waitFor(() => overlaid() !== undefined);
  expect(events.findLast((event) => event.type === 'state')).toMatchObject({ maskOverlay: true });
  expect(overlaid()).toMatchObject({ outside: 255, enabled: true });

  runtime.send({ type: 'layer', action: { type: 'select', id: layerId } });
  await waitFor(() => overlaid() === undefined);
  runtime.send({ type: 'layer', action: { type: 'select', id: layerId, target: 'mask' } });
  await waitFor(() => overlaid() !== undefined);
  runtime.send({ type: 'mask-overlay', enabled: false });
  await waitFor(() => overlaid() === undefined);
  expect(events.findLast((event) => event.type === 'state')).toMatchObject({ maskOverlay: false });
  await stop(context);
});

function sample(x: number) {
  return { x, y: 1, pressure: 1, time: x };
}

function state(events: PaintEvent[]) {
  return events.findLast((event) => event.type === 'state')?.document;
}

/** A runtime whose round engine records the layer and brush each stroke begins with. */
async function start() {
  const events: PaintEvent[] = [];
  const renderer = createRendererDouble();
  const begun: { layer: Layer; brush: Brush }[] = [];
  const engine: BrushEngine = (context) => {
    begun.push({ layer: context.layer, brush: context.brush });
    context.renderer.begin(context.layer, context.brush);
    return {
      add: async () => {},
      preview: () => {},
      finish: () => context.renderer.finish(),
      cancel: () => context.renderer.cancel()
    };
  };
  const modules: PaintModules = {
    document: () => createDocument(),
    resources: () => createBrushResources(),
    storage: createMemoryStorage(),
    renderer: async () => renderer,
    processors: { none: () => ({ add: (samples) => [...samples], preview: () => [], finish: () => [] }) },
    engines: { round: engine, abr: engine },
    selectEngine: () => 'round',
    selectProcessor: () => 'none',
    features: [],
    edits: []
  };
  const runtime = createPaintRuntime(
    (event) => events.push(event),
    () => {},
    modules
  );
  const waitFor = async (condition: () => boolean) => {
    const deadline = vi.getRealSystemTime() + 2000;
    while (!condition() && vi.getRealSystemTime() < deadline) {
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(condition()).toBe(true);
  };
  runtime.send({
    type: 'init',
    canvas: document.createElement('canvas'),
    size: { width: 256, height: 256 },
    dpr: 1,
    storageName: `masks-${crypto.randomUUID()}`
  });
  await waitFor(() => events.some((event) => event.type === 'ready'));
  return { runtime, renderer, events, waitFor, begun, layerId: state(events)!.activeId };
}

async function stop({ runtime, events, waitFor }: Awaited<ReturnType<typeof start>>) {
  runtime.send({ type: 'dispose' });
  await waitFor(() => events.some((event) => event.type === 'disposed'));
}
