// @vitest-environment jsdom
import type { PaintEvent } from '@app-game/paint-core/protocol';
import { render } from '@solidjs/web';
import { ok } from 'neverthrow';
import { createRoot, createSignal, flush, onSettled, Show } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPaintEngine, type LayerThumbnailsEvent } from '../engine';
import type { EngineCommand, EngineHandlers } from '../engine/openPaintTransport';
import { createLayerThumbnails } from './createLayerThumbnails';

const transports = vi.hoisted(() => ({
  opened: [] as { handlers: EngineHandlers; post: ReturnType<typeof vi.fn<(command: EngineCommand) => unknown>> }[]
}));
vi.mock('../engine/openPaintTransport', () => ({
  openPaintTransport: (_mode: unknown, _canvas: unknown, _init: unknown, handlers: EngineHandlers) => {
    const transport = { handlers, post: vi.fn(() => ok()), close: vi.fn() };
    transports.opened.push(transport);
    return ok(transport);
  }
}));

let urls = 0;
let dispose: (() => void) | undefined;
beforeEach(() => {
  urls = 0;
  vi.stubGlobal('devicePixelRatio', 2);
  URL.createObjectURL = vi.fn(() => `blob:${++urls}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  transports.opened.length = 0;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('asks for the largest wanted size until every caller has released', () => {
  const thumbnails = mount();
  expect(thumbnails.size()).toBeUndefined();

  const releaseLarge = thumbnails.want(100);
  const releaseSmall = thumbnails.want();
  flush();
  // CSS pixels at the device pixel ratio, at most 256.
  expect(thumbnails.size()).toBe(200);

  releaseLarge();
  releaseLarge();
  flush();
  expect(thumbnails.size()).toBe(128);

  releaseSmall();
  flush();
  expect(thumbnails.size()).toBeUndefined();
});

it('shows each batch, revoking replaced and deleted images, and drops everything once nothing wants them', () => {
  const thumbnails = mount();
  const release = thumbnails.want();
  flush();
  thumbnails.receive(batch(['a', 'b'], ['a', 'b'], { left: 0, top: 0, width: 512, height: 256 }));
  flush();
  expect(thumbnails.thumbnail('a')).toEqual({ src: 'blob:1', width: 64, height: 32 });
  expect(thumbnails.thumbnail('b')).toEqual({ src: 'blob:2', width: 64, height: 32 });
  expect(thumbnails.frame()).toEqual({ left: 0, top: 0, width: 512, height: 256 });

  // A new image of `a`; `b` was deleted.
  thumbnails.receive(batch(['a'], ['a']));
  flush();
  expect(thumbnails.thumbnail('a')?.src).toBe('blob:3');
  expect(thumbnails.thumbnail('b')).toBeUndefined();
  expect(vi.mocked(URL.revokeObjectURL).mock.calls.flat().sort()).toEqual(['blob:1', 'blob:2']);

  release();
  flush();
  expect(thumbnails.thumbnail('a')).toBeUndefined();
  expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:3');

  // A batch already on its way when the last caller released is ignored.
  thumbnails.receive(batch(['a'], ['a']));
  flush();
  expect(thumbnails.thumbnail('a')).toBeUndefined();
  expect(urls).toBe(3);
});

it('lets a mounted panel want thumbnails, which the engine is asked for whenever it becomes ready', async () => {
  let thumbnails!: ReturnType<typeof createLayerThumbnails>;
  let engine!: ReturnType<typeof createPaintEngine>;
  const [open, setOpen] = createSignal(true);
  function Panel() {
    onSettled(() => thumbnails.want());
    return <img data-testid="thumb" src={thumbnails.thumbnail('a')?.src} />;
  }

  dispose = render(() => {
    thumbnails = createLayerThumbnails();
    engine = createPaintEngine({
      settings: { debug: () => false, liveTail: () => true, adaptiveQuality: () => true },
      onError: () => {},
      onSelection: () => {},
      layerThumbnails: { size: thumbnails.size, receive: thumbnails.receive }
    });
    return (
      <Show when={open()}>
        <Panel />
      </Show>
    );
  }, document.body);
  // As the canvas's effect does, outside an owned scope.
  const disconnect = engine.connect(document.createElement('canvas'), 'worker');
  const transport = transports.opened[0]!;
  const sizes = () =>
    transport.post.mock.calls.flatMap(([command]) => (command.type === 'layer-thumbnails' ? [command.size] : []));
  transport.handlers.message({ type: 'ready' });
  await Promise.resolve();
  flush();
  expect(sizes()).toEqual([128]);

  transport.handlers.message(batch(['a'], ['a']));
  flush();
  expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:1');

  setOpen(false);
  flush();
  expect(sizes()).toEqual([128, undefined]);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  setOpen(true);
  flush();
  expect(sizes()).toEqual([128, undefined, 128]);
  setOpen(false);
  flush();
  expect(sizes()).toEqual([128, undefined, 128, undefined]);
  disconnect();
});

/** Mounts thumbnails under a disposable owner. */
function mount() {
  return createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return createLayerThumbnails();
  });
}

/** An engine batch with new images of `changed` among `layerIds`. */
function batch(
  changed: string[],
  layerIds: string[],
  frame = { left: 0, top: 0, width: 512, height: 256 }
): LayerThumbnailsEvent & PaintEvent {
  return {
    type: 'layer-thumbnails',
    frame,
    layerIds,
    thumbnails: changed.map((layerId) => ({ layerId, width: 64, height: 32, image: new Blob([]) }))
  };
}
