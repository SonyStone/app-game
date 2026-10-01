import { type AbortedError, gpuError } from '@app-game/solid-gpu/errors';
import { GpuCanvasProvider, maxDeviceRecoveries, TypeGPURootProvider } from '@app-game/solid-gpu/gpu';
import { runWorkerRequest } from '@app-game/solid-gpu/worker';
import { render } from '@solidjs/web';
import { err, ok, okAsync, ResultAsync } from 'neverthrow';
import { createRoot, createSignal, flush, Show } from 'solid-js';
import tgpu from 'typegpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentSource } from '../../../tests/fixtures/DocumentSource';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import type { DocumentError } from '../../shared/errors';
import { CameraControls } from '../camera/CameraControls';
import { CameraTour } from '../camera/CameraTour';
import { createDocumentCamera, pageAspectOf } from '../camera/createDocumentCamera';
import { createDocumentSource } from '../document/createDocumentSource';
import type { TextDocument } from '../document/document';
import type { DecodedDocument } from '../document/format/types';
import { readDocumentFile } from '../document/readDocumentFile';
import { createGlyphRenderer, type TextRenderer } from '../document/rendering/createTypeGpuRenderer';
import { DocumentRenderer } from '../document/rendering/DocumentRenderer';
import { GlyphText } from '../document/rendering/GlyphText';
import { FrameLoop } from '../scene/FrameLoop';
import { createViewport } from '../viewport/createViewport';
import { createViewerStatus } from './createViewerStatus';

vi.mock('typegpu', () => ({ default: { initFromDevice: vi.fn() } }));
vi.mock('@app-game/solid-gpu/worker/runWorkerRequest', () => ({ runWorkerRequest: vi.fn() }));
vi.mock('../document/readDocumentFile', () => ({ readDocumentFile: vi.fn() }));
const readGdoc = vi.fn<(input: string | ArrayBuffer) => ResultAsync<DecodedDocument, DocumentError | AbortedError>>();
const cancellations: ReturnType<typeof vi.fn>[] = [];
let setProgress: (value: import('../document/documentProgress').DocumentProgress) => void;
vi.mock('../document/rendering/createTypeGpuRenderer', () => ({ createGlyphRenderer: vi.fn() }));
vi.mock('../scene/createSceneUpscaler', () => ({
  createSceneUpscaler: () => ({ target: vi.fn(), blit: vi.fn(), destroy: vi.fn() })
}));

const cleanups: (() => void)[] = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const unobserve = vi.fn();

beforeEach(() => {
  viewDestroyed.clear();
  vi.resetAllMocks();
  frames.clear();
  cancellations.length = 0;
  vi.mocked(readDocumentFile).mockResolvedValue(ok({ format: 'gdoc', bytes: new ArrayBuffer(0) }));
  vi.mocked(runWorkerRequest).mockImplementation(async (_create, input, { signal, onProgress }) => {
    const cancel = vi.fn();
    signal.addEventListener('abort', cancel, { once: true });
    cancellations.push(cancel);
    setProgress = (value) => onProgress?.(value);
    return await readGdoc(input as string | ArrayBuffer);
  });
  setupGpu();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve = unobserve;
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe('document viewer ownership and reactivity', () => {
  it('starts decoding without a canvas and ignores late decoding after disposal', async () => {
    const pending = deferred<Awaited<ReturnType<typeof readGdoc>>>();
    vi.mocked(readGdoc).mockReturnValue(new ResultAsync(pending.promise));
    const { viewer, dispose } = setup();
    await settle();
    expect(readGdoc).toHaveBeenCalledOnce();
    expect(tgpu.initFromDevice).toHaveBeenCalledOnce();
    expect(createGlyphRenderer).not.toHaveBeenCalled();
    const state = viewer.state();
    dispose();
    expect(cancellations[0]).toHaveBeenCalled();
    const data = documentFixture();
    pending.resolve(ok(data));
    await settle();
    expect(createGlyphRenderer).not.toHaveBeenCalled();
    expect(viewer.state()).toEqual(state);
    expect(frames.size).toBe(0);
  });

  it('loads independently of GPU providers and suppresses callbacks after disposal', async () => {
    const pending = deferred<Awaited<ReturnType<typeof readGdoc>>>();
    vi.mocked(readGdoc).mockReturnValue(new ResultAsync(pending.promise));
    const onLoading = vi.fn();
    const onError = vi.fn();
    const children = vi.fn(() => null);
    const dispose = render(
      () => (
        <DocumentSource onLoading={onLoading} onError={onError}>
          {children}
        </DocumentSource>
      ),
      document.createElement('div')
    );
    cleanups.push(dispose);
    await settle();
    expect(onLoading).toHaveBeenCalledTimes(2);
    expect(tgpu.initFromDevice).not.toHaveBeenCalled();
    dispose();
    expect(cancellations[0]).toHaveBeenCalled();
    setProgress({ stage: 'processingPages', completed: 1, total: 2 });
    const data = documentFixture();
    pending.resolve(ok(data));
    await settle();
    expect(onLoading).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(children).not.toHaveBeenCalled();
  });

  it('draws on demand, reacts to options and stops the tour on wheel input', async () => {
    const renderer = rendererFixture();
    vi.mocked(readGdoc).mockReturnValue(okAsync(documentFixture()));
    vi.mocked(createGlyphRenderer).mockResolvedValue(ok(renderer));
    const { viewer, setCanvas } = setup();
    const canvas = makeCanvas();
    setCanvas(canvas);
    await settle();
    expect(viewer.state().phase).toBe('ready');
    await tick();
    expect(renderer.draw).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    viewer.setGrids(true);
    viewer.setVectorOnly(true);
    flush();
    await tick();
    expect(renderer.draw).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ grids: true, vectorOnly: true })
    );
    expect(frames.size).toBe(0);
    viewer.setAutoZoom(true);
    flush();
    await tick();
    expect(frames.size).toBe(1);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300 }));
    flush();
    expect(viewer.autoZoom()).toBe(false);
    await tick();
    expect(frames.size).toBe(0);
  });

  it.each([
    { top: 44, right: 24, bottom: 84, left: 24 },
    { top: 0, right: 0, bottom: 0, left: 0 },
    { top: 10, right: 160, bottom: 90, left: 8 }
  ])('fits mixed-size pages with padding %j without reloading', async (padding) => {
    const renderer = rendererFixture();
    const data = documentFixture();
    data.pages.push({ ...data.pages[0]!, width: 1224, height: 1584, x: -3, y: 5 });
    vi.mocked(readGdoc).mockReturnValue(okAsync(data));
    vi.mocked(createGlyphRenderer).mockResolvedValue(ok(renderer));
    const { viewer, setCanvas } = setup(padding);
    setCanvas(makeCanvas());
    await settle();
    await tick();
    viewer.setAutoZoom(true);
    flush();
    viewer.showOverview();
    flush();
    await tick();
    expect(viewer.autoZoom()).toBe(false);
    const frame = vi.mocked(renderer.draw).mock.lastCall![1];
    expect(frame.visible).toHaveLength(2);
    expect(frame.rotation).toEqual([1, 0, -0, 1]);
    for (const page of vi.mocked(createGlyphRenderer).mock.calls[0]![1].pages) {
      const left = (-page.x * frame.mul[0] + frame.add[0] + 1) * 400;
      const right = ((-page.x + page.width / 612) * frame.mul[0] + frame.add[0] + 1) * 400;
      const top = (1 - ((1 - page.y) * frame.mul[1] + frame.add[1])) * 300;
      const bottom = (1 - ((1 - page.y - page.height / 792) * frame.mul[1] + frame.add[1])) * 300;
      expect(left).toBeGreaterThanOrEqual(padding.left - 0.01);
      expect(right).toBeLessThanOrEqual(800 - padding.right + 0.01);
      expect(top).toBeGreaterThanOrEqual(padding.top - 0.01);
      expect(bottom).toBeLessThanOrEqual(600 - padding.bottom + 0.01);
    }
    expect(readGdoc).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });

  it('releases old targets, pointer captures and observers on replacement and removal', async () => {
    const first = rendererFixture();
    const second = rendererFixture();
    vi.mocked(readGdoc).mockImplementation(() => okAsync(documentFixture()));
    vi.mocked(createGlyphRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));
    const { viewer, setCanvas } = setup();
    const oldCanvas = makeCanvas();
    setCanvas(oldCanvas);
    await settle();
    await tick();
    oldCanvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch' }));
    flush();
    expect(viewer.dragging()).toBe(true);
    const newCanvas = makeCanvas();
    setCanvas(newCanvas);
    await settle();
    expect(viewer.dragging()).toBe(false);
    expect(oldCanvas.hasPointerCapture(1)).toBe(false);
    // The renderer belongs to the device: replacing the canvas ends only its view.
    expect(first.destroy).not.toHaveBeenCalled();
    expect(viewDestroyed.get(first)).toBe(1);
    expect(createGlyphRenderer).toHaveBeenCalledOnce();
    expect(unobserve).toHaveBeenCalledExactlyOnceWith(oldCanvas);
    expect(cancellations[0]).not.toHaveBeenCalled();
    expect(readGdoc).toHaveBeenCalledOnce();
    await tick();
    expect(first.draw).toHaveBeenCalled();
    oldCanvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    expect(frames.size).toBe(0);
    setCanvas(undefined);
    flush();
    expect(viewDestroyed.get(first)).toBe(2);
    expect(second.destroy).not.toHaveBeenCalled();
    expect(unobserve).toHaveBeenLastCalledWith(newCanvas);
    expect(frames.size).toBe(0);
  });

  it('prepares once across canvas replacement and draws into the current canvas', async () => {
    const pending = deferred<Awaited<ReturnType<typeof createGlyphRenderer>>>();
    const renderer = rendererFixture();
    vi.mocked(readGdoc).mockImplementation(() => okAsync(documentFixture()));
    vi.mocked(createGlyphRenderer).mockReturnValueOnce(pending.promise);
    const { viewer, setCanvas } = setup();
    setCanvas(makeCanvas());
    await settle();
    const gpu = vi.mocked(createGlyphRenderer).mock.calls[0]![0]!;
    setCanvas(makeCanvas());
    await settle();
    expect(gpu.signal.aborted).toBe(false);
    expect(tgpu.initFromDevice).toHaveBeenCalledOnce();
    pending.resolve(ok(renderer));
    await settle();
    expect(viewer.state().phase).toBe('ready');
    await tick();
    expect(createGlyphRenderer).toHaveBeenCalledOnce();
    expect(renderer.draw).toHaveBeenCalledOnce();
    expect(renderer.destroy).not.toHaveBeenCalled();
  });

  it('reuses the device and canvas context while replacing the document and renderer', async () => {
    const first = rendererFixture();
    const second = rendererFixture();
    vi.mocked(readGdoc).mockImplementation(() => okAsync(documentFixture()));
    vi.mocked(createGlyphRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));
    const { setCanvas, setSession, dispose } = setup();
    setCanvas(makeCanvas());
    await settle();
    const gpu = vi.mocked(createGlyphRenderer).mock.calls[0]![0]!;
    setSession({ file: new File(['pdf'], 'replacement.pdf') });
    await settle();
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(cancellations[0]).toHaveBeenCalledOnce();
    expect(vi.mocked(createGlyphRenderer).mock.calls[1]![0].device).toBe(gpu.device);
    expect(gpu.signal.aborted).toBe(false);
    expect(tgpu.initFromDevice).toHaveBeenCalledOnce();
    dispose();
    expect(second.destroy).toHaveBeenCalledOnce();
    expect(gpu.device.destroy).toHaveBeenCalledOnce();
  });

  it('surfaces initialization errors, recovers from device loss, and surfaces repeated loss', async () => {
    vi.mocked(readGdoc).mockImplementation(() => okAsync(documentFixture()));
    const renderer = rendererFixture();
    vi.mocked(createGlyphRenderer)
      .mockResolvedValueOnce(err(gpuError('adapter', 'No WebGPU adapter')))
      .mockResolvedValue(ok(renderer));
    const { viewer, setCanvas, setSession } = setup();
    setCanvas(makeCanvas());
    await settle();
    expect(viewer.state()).toMatchObject({ phase: 'error', error: { kind: 'gpu', code: 'adapter' } });
    expect(frames.size).toBe(0);
    setSession({});
    await settle();
    await tick();
    const gpu = vi.mocked(createGlyphRenderer).mock.calls[1]![0]!;
    loseDevice.get(gpu.device)!({ message: 'Device lost', reason: 'unknown' });
    await settle();
    expect(tgpu.initFromDevice).toHaveBeenCalledTimes(2);

    for (let loss = 0; loss < maxDeviceRecoveries; loss++) {
      [...loseDevice.values()].at(-1)!({ message: 'Device lost', reason: 'unknown' });
      await settle();
    }

    expect(viewer.state()).toMatchObject({ phase: 'error', error: { kind: 'gpu', code: 'lost' } });
    expect(renderer.destroy).toHaveBeenCalledTimes(maxDeviceRecoveries + 1);
    viewer.setGrids(true);
    flush();
    expect(frames.size).toBe(0);
  });
});

function setup(padding = { top: 44, right: 24, bottom: 84, left: 24 }) {
  const result = createRoot((disposeState) => {
    const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
    const [session, setSession] = createSignal<{ file?: File }>({});
    const documentSource = createDocumentSource(() => session().file);
    const currentDocument = () => documentSource.prepared()?.data;
    const viewport = createViewport(canvas, { maxDpr: 2 });
    const camera = createDocumentCamera({
      pageAspect: () => pageAspectOf(currentDocument()),
      resetOn: currentDocument
    });
    const { status: state, reportGpuError, reportReady, reportResourceUsage } = createViewerStatus(documentSource);
    const [dragging, setDragging] = createSignal(false, { ownedWrite: true });
    const [autoZoom, setAutoZoom] = createSignal(false, { ownedWrite: true });
    const [vectorOnly, setVectorOnly] = createSignal(false);
    const [grids, setGrids] = createSignal(false);
    const viewer = {
      state,
      dragging,
      setDragging,
      autoZoom,
      setAutoZoom,
      vectorOnly,
      setVectorOnly,
      grids,
      setGrids,
      showOverview() {
        const pages = currentDocument()?.pages;

        if (pages) {
          setAutoZoom(false);
          camera.fitToPages(pages, viewport.size().css, padding);
        }
      }
    };
    const host = document.createElement('div');
    const disposeView = render(
      () => (
        <TypeGPURootProvider requiredBufferBytes={256 * 1024 * 1024} error={reportGpuError}>
          <Show when={documentSource.prepared()} keyed>
            {({ data, fail }) => (
              <DocumentRenderer
                document={data}
                initialView={{ camera, viewport }}
                onReady={reportReady}
                onResourceUsage={reportResourceUsage}
                onError={fail}
              >
                <GpuCanvasProvider canvas={canvas()} error={reportGpuError}>
                  <FrameLoop viewport={viewport} onError={fail}>
                    <CameraControls
                      camera={camera}
                      onInteraction={() => viewer.setAutoZoom(false)}
                      onDraggingChange={viewer.setDragging}
                    />
                    <CameraTour camera={camera} document={data} enabled={viewer.autoZoom()} />
                    <GlyphText camera={camera} vectorOnly={viewer.vectorOnly()} grids={viewer.grids()} />
                  </FrameLoop>
                </GpuCanvasProvider>
              </DocumentRenderer>
            )}
          </Show>
        </TypeGPURootProvider>
      ),
      host
    );
    const dispose = () => {
      disposeView();
      disposeState();
    };
    cleanups.push(dispose);
    return { viewer, setCanvas, setSession, dispose };
  });
  flush();
  return result;
}

const loseDevice = new Map<GPUDevice, (info: Pick<GPUDeviceLostInfo, 'message' | 'reason'>) => void>();
function setupGpu() {
  loseDevice.clear();
  vi.mocked(tgpu.initFromDevice).mockImplementation(
    ({ device }) => ({ device, destroy: vi.fn() }) as unknown as ReturnType<typeof tgpu.initFromDevice>
  );
  const requestDevice = vi.fn(async () => {
    let lose!: (info: Pick<GPUDeviceLostInfo, 'message' | 'reason'>) => void;
    const device = Object.assign(new EventTarget(), {
      ...gpuFixture().gpu.device,
      destroy: vi.fn(),
      lost: new Promise<Pick<GPUDeviceLostInfo, 'message' | 'reason'>>((resolve) => {
        lose = resolve;
      })
    }) as unknown as GPUDevice;
    loseDevice.set(device, lose);
    return device;
  });
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter: async () => ({ limits: { maxBufferSize: 2 ** 30 }, requestDevice }),
      getPreferredCanvasFormat: () => 'bgra8unorm'
    }
  });
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    ...gpuFixture().gpu.context,
    canvas,
    configure: vi.fn(),
    unconfigure: vi.fn()
  } as unknown as GPUCanvasContext);
  const captures = new Set<number>();
  canvas.setPointerCapture = (id) => {
    captures.add(id);
  };
  canvas.hasPointerCapture = (id) => captures.has(id);
  canvas.releasePointerCapture = (id) => {
    captures.delete(id);
  };
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
  return canvas;
}

function documentFixture() {
  return {
    pages: [{ width: 612, height: 792, beginVertex: 0, endVertex: 6, x: 0, y: 0 }],
    kind: 'glyphs',
    glyphVertices: new ArrayBuffer(72),
    positions: { x: new Float32Array([0.5]), y: new Float32Array([0.5]) },
    atlas: { buf: new ArrayBuffer(4), width: 1, height: 1 },
    atlasVertices: { buf: new ArrayBuffer(72), width: 1, height: 1 }
  } satisfies TextDocument;
}

/** Destroyed views per renderer; fixture views draw through the renderer's `draw` mock. */
const viewDestroyed = new Map<TextRenderer, number>();

function rendererFixture(): TextRenderer {
  const renderer: TextRenderer = {
    createView: vi.fn(() => ({
      draw: (pass: GPURenderPassEncoder, frame: Parameters<TextRenderer['draw']>[1]) => renderer.draw(pass, frame),
      destroy: () => viewDestroyed.set(renderer, (viewDestroyed.get(renderer) ?? 0) + 1)
    })),
    draw: vi.fn(() => ok()),
    render: vi.fn(() => ok()),
    destroy: vi.fn(),
    settle: vi.fn(() => okAsync()),
    events: new EventTarget(),
    resourceBytes: 1024,
    refinement: undefined
  };
  return renderer;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle() {
  flush();
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
    flush();
  }
  flush();
}

async function tick() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(performance.now()));
  await settle();
}
