import { render } from '@solidjs/web';
import { err, ok, okAsync } from 'neverthrow';
import { createRoot, createSignal, flush, onCleanup } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gpuError } from '../../../shared/errors';
import type { GpuContext } from '../../../shared/gpu/context';
import type { DocumentCamera } from '../../camera/createDocumentCamera';
import type { RenderLayer } from '../../scene/RenderLayer';
import type { TextDocument } from '../document';
import { createGlyphRenderer, type TextRenderer } from './createTypeGpuRenderer';
import { DocumentRenderer } from './DocumentRenderer';
import { GlyphText } from './GlyphText';
import { VectorArtwork } from './VectorArtwork';

vi.mock('../../../shared/gpu/GpuCanvasProvider', () => ({ useGpuCanvas: () => gpu }));
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

let gpu: GpuContext;
const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  renderers.length = 0;
  gpu = { signal: new AbortController().signal } as GpuContext;
});

afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
});

it('replaces the drawn layer and releases the old renderer while retaining the GPU', async () => {
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
  gpu = { signal: abort.signal } as GpuContext;
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
  mounted.layers[0]!.draw({ pass: {} as GPURenderPassEncoder, width: 1, height: 1 });
  expect(vi.mocked(renderer.draw).mock.lastCall![1]).toMatchObject({ grids: false });

  mounted.setGrids(true);
  flush();
  mounted.layers[0]!.draw({ pass: {} as GPURenderPassEncoder, width: 1, height: 1 });
  expect(vi.mocked(renderer.draw).mock.lastCall![1]).toMatchObject({ grids: true });
});

it('rejects an engine that does not match the document kind', () => {
  const mount = () =>
    createRoot((dispose) => {
      cleanups.push(dispose);
      render(
        () => (
          <DocumentRenderer document={documentFixture()} camera={cameraFixture()} onError={vi.fn()}>
            <VectorArtwork />
          </DocumentRenderer>
        ),
        globalThis.document.createElement('div')
      );
    });

  expect(mount).toThrow('VectorArtwork draws curve documents');
});

function mount() {
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
    const host = globalThis.document.createElement('div');
    const disposeView = render(
      () => (
        <DocumentRenderer
          document={document()}
          camera={cameraFixture()}
          onError={onError}
          onReady={onReady}
          onResourceUsage={onResourceUsage}
        >
          <GlyphText grids={grids()} />
        </DocumentRenderer>
      ),
      host
    );

    cleanups.push(() => {
      disposeView();
      disposeState();
    });

    return { setDocument, setGrids };
  });

  /** The renderer each mounted layer draws with, found by drawing it once. */
  function drawnBy() {
    return layers.map((layer) => {
      renderers.forEach((renderer) => vi.mocked(renderer.draw).mockClear());
      layer.draw({ pass: {} as GPURenderPassEncoder, width: 1, height: 1 });
      return renderers.find((renderer) => vi.mocked(renderer.draw).mock.calls.length > 0);
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

/** Renderers created by the current test, in creation order. */
const renderers: TextRenderer[] = [];

function rendererFixture(): TextRenderer {
  const renderer: TextRenderer = {
    draw: vi.fn(() => ok()),
    render: vi.fn(() => ok()),
    destroy: vi.fn(),
    settle: vi.fn(() => okAsync()),
    events: new EventTarget(),
    resourceBytes: 1024,
    refinement: undefined
  };
  renderers.push(renderer);
  return renderer;
}

async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    flush();
  }
}
