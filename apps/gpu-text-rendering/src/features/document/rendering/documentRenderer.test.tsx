import { gpuError } from '@app-game/solid-gpu/errors';
import type { GpuDevice } from '@app-game/solid-gpu/gpu';
import { render } from '@solidjs/web';
import { err, ok, okAsync } from 'neverthrow';
import { createRoot, createSignal, flush, onCleanup, Show } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DocumentCamera } from '../../camera/createDocumentCamera';
import type { RenderLayer } from '../../scene/RenderLayer';
import type { TextDocument } from '../document';
import { createGlyphRenderer, type TextRenderer } from './createTypeGpuRenderer';
import { DocumentRenderer } from './DocumentRenderer';
import { GlyphText } from './GlyphText';
import { VectorArtwork } from './VectorArtwork';

vi.mock('@app-game/solid-gpu/gpu/TypeGPURootProvider', () => ({ useGpuDevice: () => gpu }));
vi.mock('./createTypeGpuRenderer', () => ({ createGlyphRenderer: vi.fn() }));
vi.mock('../../scene/FrameLoop', () => ({ useFrameLoop: () => ({ invalidate }) }));
vi.mock('../../viewport/createViewport', () => ({
  useViewport: () => ({ size: () => ({ css: { width: 1, height: 1 }, pixels: { width: 1, height: 1 } }) })
}));
type LayerProps = Parameters<typeof RenderLayer>[0];
let onLayer: (props: LayerProps) => void = () => {};
vi.mock('../../scene/RenderLayer', () => ({
  RenderLayer: (props: LayerProps) => {
    onLayer(props);
    return null;
  }
}));

const invalidate = vi.fn();

let gpu: GpuDevice;
const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  views.length = 0;
  gpu = { signal: new AbortController().signal } as GpuDevice;
});

afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
});

it('replaces the drawn view and releases the old renderer while retaining the GPU', async () => {
  const first = rendererFixture();
  const second = rendererFixture();
  vi.mocked(createGlyphRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));

  const mounted = mount();
  await settle();
  expect(mounted.drawnBy()).toEqual([first]);

  mounted.setDocument(documentFixture());
  await settle();

  expect(first.destroy).toHaveBeenCalledOnce();
  expect(second.destroy).not.toHaveBeenCalled();
  expect(mounted.detached).toHaveBeenCalledOnce();
  expect(mounted.drawnBy()).toEqual([first, second]);
  expect(mounted.onReady).toHaveBeenCalledTimes(2);
  expect(vi.mocked(createGlyphRenderer).mock.calls.every(([context]) => context === gpu)).toBe(true);
});

it('cancels preparation without drawing a stale renderer, leaving a late renderer to release itself', async () => {
  let resolve!: (result: Awaited<ReturnType<typeof createGlyphRenderer>>) => void;
  const pending = new Promise<Awaited<ReturnType<typeof createGlyphRenderer>>>((done) => {
    resolve = done;
  });
  const late = rendererFixture();
  const current = rendererFixture();
  // Like the real renderer, the late one destroys itself when its preparation signal aborts.
  vi.mocked(createGlyphRenderer)
    .mockImplementationOnce((_gpu, _document, { signal }) => {
      signal!.addEventListener('abort', late.destroy, { once: true });
      return pending;
    })
    .mockResolvedValueOnce(ok(current));

  const mounted = mount();
  await settle();
  const signal = vi.mocked(createGlyphRenderer).mock.calls[0]![2].signal!;
  expect(mounted.layers).toEqual([]);

  mounted.setDocument(documentFixture());
  await settle();
  expect(signal.aborted).toBe(true);

  resolve(ok(late));
  await settle();

  expect(late.destroy).toHaveBeenCalledOnce();
  expect(mounted.drawnBy()).toEqual([current]);
  expect(mounted.onReady).toHaveBeenCalledOnce();
  expect(mounted.onError).not.toHaveBeenCalled();
});

it('observes only the current renderer, invalidates frames on changes, and detaches residency listeners on GPU abort', async () => {
  const abort = new AbortController();
  gpu = { signal: abort.signal } as GpuDevice;
  const first = rendererFixture();
  const second = rendererFixture();
  vi.mocked(createGlyphRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));
  const mounted = mount();
  await settle();
  first.events.dispatchEvent(new Event('change'));
  expect(mounted.onResourceUsage).toHaveBeenCalledWith(1024);
  expect(invalidate).toHaveBeenCalledOnce();
  mounted.setDocument(documentFixture());
  await settle();
  mounted.onResourceUsage.mockClear();
  first.events.dispatchEvent(new Event('change'));
  expect(mounted.onResourceUsage).not.toHaveBeenCalled();
  second.events.dispatchEvent(new Event('change'));
  expect(mounted.onResourceUsage).toHaveBeenCalledOnce();
  abort.abort();
  second.events.dispatchEvent(new Event('change'));
  expect(mounted.onResourceUsage).toHaveBeenCalledOnce();
});

it('reports a failure once without drawing', async () => {
  const failure = gpuError('device', 'Preparation failed');
  vi.mocked(createGlyphRenderer).mockResolvedValue(err(failure));

  const mounted = mount();
  await settle();

  expect(mounted.onError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(mounted.layers).toEqual([]);
  expect(mounted.onReady).not.toHaveBeenCalled();
});

it('draws with the current camera and reactive options', async () => {
  const renderer = rendererFixture();
  vi.mocked(createGlyphRenderer).mockResolvedValue(ok(renderer));

  const mounted = mount();
  await settle();
  const view = views[0]!;
  mounted.layers[0]!.draw({ pass: {} as GPURenderPassEncoder, width: 1, height: 1 });
  expect(view.draw.mock.lastCall![1]).toMatchObject({ grids: false });

  mounted.setGrids(true);
  flush();
  mounted.layers[0]!.draw({ pass: {} as GPURenderPassEncoder, width: 1, height: 1 });
  expect(view.draw.mock.lastCall![1]).toMatchObject({ grids: true });
});

it('prepares once for several views and ends only the view that unmounts', async () => {
  const renderer = rendererFixture();
  vi.mocked(createGlyphRenderer).mockResolvedValue(ok(renderer));

  const mounted = mount({ views: 2 });
  await settle();
  expect(createGlyphRenderer).toHaveBeenCalledOnce();
  expect(views.map((view) => view.renderer)).toEqual([renderer, renderer]);
  expect(mounted.drawnBy()).toEqual([renderer, renderer]);

  mounted.setViewCount(1);
  flush();
  expect(views[1]!.destroy).toHaveBeenCalledOnce();
  expect(views[0]!.destroy).not.toHaveBeenCalled();
  expect(renderer.destroy).not.toHaveBeenCalled();
});

it('rejects an engine that does not match the document kind', () => {
  vi.mocked(createGlyphRenderer).mockReturnValue(new Promise(() => {}));
  const mount = () =>
    createRoot((dispose) => {
      cleanups.push(dispose);
      render(
        () => (
          <DocumentRenderer document={documentFixture()} onError={vi.fn()}>
            <VectorArtwork camera={cameraFixture()} />
          </DocumentRenderer>
        ),
        globalThis.document.createElement('div')
      );
    });

  expect(mount).toThrow('VectorArtwork draws curve documents');
});

function mount({ views: initialViews = 1 } = {}) {
  const layers: LayerProps[] = [];
  const detached = vi.fn();
  const onReady = vi.fn();
  const onResourceUsage = vi.fn();
  const onError = vi.fn();
  onLayer = (props) => {
    layers.push(props);
    onCleanup(detached);
  };

  const result = createRoot((disposeState) => {
    const [document, setDocument] = createSignal(documentFixture());
    const [grids, setGrids] = createSignal(false);
    const [viewCount, setViewCount] = createSignal(initialViews);
    const camera = cameraFixture();
    const host = globalThis.document.createElement('div');
    const disposeView = render(
      () => (
        <DocumentRenderer document={document()} onError={onError} onReady={onReady} onResourceUsage={onResourceUsage}>
          <GlyphText camera={camera} grids={grids()} />
          <Show when={viewCount() > 1}>
            <GlyphText camera={camera} grids={grids()} />
          </Show>
        </DocumentRenderer>
      ),
      host
    );

    cleanups.push(() => {
      disposeView();
      disposeState();
    });

    return { setDocument, setGrids, setViewCount };
  });

  /** The renderer each mounted layer draws with, found through the view it draws once. */
  function drawnBy() {
    return layers.map((layer) => {
      views.forEach((view) => view.draw.mockClear());
      layer.draw({ pass: {} as GPURenderPassEncoder, width: 1, height: 1 });
      return views.find((view) => view.draw.mock.calls.length > 0)?.renderer;
    });
  }

  return { ...result, layers, drawnBy, detached, onReady, onError, onResourceUsage };
}

function cameraFixture() {
  return { camera: () => ({ x: 0.5, y: 0.5, zoom: 2, rotation: 0 }) } as unknown as DocumentCamera;
}

function documentFixture() {
  return { kind: 'glyphs', pages: [{ width: 612, height: 792, x: 0, y: 0 }] } as TextDocument;
}

/** Views created by the current test, in creation order, with the renderer that created each. */
const views: { renderer: TextRenderer; draw: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];

function rendererFixture(): TextRenderer {
  const renderer: TextRenderer = {
    draw: vi.fn(() => ok()),
    render: vi.fn(() => ok()),
    createView: vi.fn(() => {
      const view = { renderer, draw: vi.fn(() => ok()), destroy: vi.fn() };
      views.push(view);
      return view;
    }),
    destroy: vi.fn(),
    settle: vi.fn(() => okAsync()),
    events: new EventTarget(),
    resourceBytes: 1024,
    refinement: undefined
  };
  return renderer;
}

async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    flush();
  }
}
