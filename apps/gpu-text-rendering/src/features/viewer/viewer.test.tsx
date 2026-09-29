import { render } from '@solidjs/web';
import { err, ok, okAsync, ResultAsync } from 'neverthrow';
import { createRoot, createSignal, flush, Loading, Show } from 'solid-js';
import tgpu from 'typegpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentSource } from '../../../tests/fixtures/DocumentSource';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import type { AbortedError, DocumentError } from '../../shared/errors';
import { gpuError } from '../../shared/errors';
import { maxDeviceRecoveries } from '../../shared/gpu/createGpuRoot';
import { GpuCanvasProvider } from '../../shared/gpu/GpuCanvasProvider';
import { TypeGPURootProvider } from '../../shared/gpu/TypeGPURootProvider';
import { runWorkerRequest } from '../../shared/worker/runWorkerRequest';
import { CameraControls } from '../camera/CameraControls';
import { CameraTour } from '../camera/CameraTour';
import { DocumentCamera } from '../camera/DocumentCamera';
import { OverviewCamera, type OverviewCameraRef } from '../camera/OverviewCamera';
import { DocumentSpace } from '../camera/SceneSpace';
import { createDocumentSource } from '../document/createDocumentSource';
import type { TextDocument } from '../document/document';
import type { DecodedDocument } from '../document/format/types';
import { readDocumentFile } from '../document/readDocumentFile';
import { createTypeGpuRenderer, type TextRenderer } from '../document/rendering/createTypeGpuRenderer';
import { DocumentLayer } from '../document/rendering/DocumentLayer';
import { DocumentRendererProvider } from '../document/rendering/DocumentRendererProvider';
import { FrameLoop } from '../scene/FrameLoop';
import { Viewport } from '../viewport/Viewport';
import { createViewerStatus } from './createViewerStatus';

vi.mock('typegpu', () => ({ default: { initFromDevice: vi.fn() } }));
vi.mock('../../shared/worker/runWorkerRequest', () => ({ runWorkerRequest: vi.fn() }));
vi.mock('../document/readDocumentFile', () => ({ readDocumentFile: vi.fn() }));
const readGdoc = vi.fn<(input: string | ArrayBuffer) => ResultAsync<DecodedDocument, DocumentError | AbortedError>>();
const cancellations: ReturnType<typeof vi.fn>[] = [];
let setProgress: (value: import('../document/documentProgress').DocumentProgress) => void;
vi.mock('../document/rendering/createTypeGpuRenderer', () => ({ createTypeGpuRenderer: vi.fn() }));

const cleanups: (() => void)[] = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const disconnect = vi.fn();

beforeEach(() => {
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
      unobserve() {}
      disconnect = disconnect;
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
    const { viewer, setCanvas, dispose } = setup();
    await settle();
    expect(readGdoc).toHaveBeenCalledOnce();
    expect(tgpu.initFromDevice).toHaveBeenCalledOnce();
    expect(createTypeGpuRenderer).not.toHaveBeenCalled();
    const state = viewer.state();
    dispose();
    expect(cancellations[0]).toHaveBeenCalled();
    const data = documentFixture();
    pending.resolve(ok(data));
    await settle();
    expect(createTypeGpuRenderer).not.toHaveBeenCalled();
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
    vi.mocked(createTypeGpuRenderer).mockResolvedValue(ok(renderer));
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
    vi.mocked(createTypeGpuRenderer).mockResolvedValue(ok(renderer));
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
    for (const page of vi.mocked(createTypeGpuRenderer).mock.calls[0]![1].pages) {
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
    vi.mocked(createTypeGpuRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));
    const { viewer, setCanvas } = setup();
    const oldCanvas = makeCanvas();
    setCanvas(oldCanvas);
    await settle();
    await tick();
    oldCanvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch' }));
    flush();
    expect(viewer.dragging()).toBe(true);
    setCanvas(makeCanvas());
    await settle();
    expect(viewer.dragging()).toBe(false);
    expect(oldCanvas.hasPointerCapture(1)).toBe(false);
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(cancellations[0]).not.toHaveBeenCalled();
    expect(readGdoc).toHaveBeenCalledOnce();
    await tick();
    oldCanvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    expect(frames.size).toBe(0);
    setCanvas(undefined);
    flush();
    expect(second.destroy).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
  });

  it('destroys a late GPU result without overwriting the replacement session', async () => {
    const pending = deferred<Awaited<ReturnType<typeof createTypeGpuRenderer>>>();
    const late = rendererFixture();
    const current = rendererFixture();
    vi.mocked(readGdoc).mockImplementation(() => okAsync(documentFixture()));
    vi.mocked(createTypeGpuRenderer).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(ok(current));
    const { viewer, setCanvas } = setup();
    setCanvas(makeCanvas());
    await settle();
    const oldGpu = vi.mocked(createTypeGpuRenderer).mock.calls[0]![0]!;
    setCanvas(makeCanvas());
    await settle();
    const state = viewer.state();
    expect(oldGpu.signal.aborted).toBe(true);
    expect(vi.mocked(createTypeGpuRenderer).mock.calls[1]![0].device).toBe(oldGpu.device);
    expect(oldGpu.device.destroy).not.toHaveBeenCalled();
    expect(tgpu.initFromDevice).toHaveBeenCalledOnce();
    pending.resolve(ok(late));
    await settle();
    expect(late.destroy).toHaveBeenCalledOnce();
    expect(current.destroy).not.toHaveBeenCalled();
    expect(viewer.state()).toEqual(state);
    await tick();
    expect(current.draw).toHaveBeenCalledOnce();
    expect(late.draw).not.toHaveBeenCalled();
  });

  it('reuses the device and canvas context while replacing the document and renderer', async () => {
    const first = rendererFixture();
    const second = rendererFixture();
    vi.mocked(readGdoc).mockImplementation(() => okAsync(documentFixture()));
    vi.mocked(createTypeGpuRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));
    const { setCanvas, setSession, dispose } = setup();
    setCanvas(makeCanvas());
    await settle();
    const gpu = vi.mocked(createTypeGpuRenderer).mock.calls[0]![0]!;
    setSession({ file: new File(['pdf'], 'replacement.pdf') });
    await settle();
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(cancellations[0]).toHaveBeenCalledOnce();
    expect(vi.mocked(createTypeGpuRenderer).mock.calls[1]![0]).toBe(gpu);
    expect(gpu.signal.aborted).toBe(false);
    expect(tgpu.initFromDevice).toHaveBeenCalledOnce();
    dispose();
    expect(second.destroy).toHaveBeenCalledOnce();
    expect(gpu.device.destroy).toHaveBeenCalledOnce();
  });

  it('surfaces initialization errors, recovers from device loss, and surfaces repeated loss', async () => {
    vi.mocked(readGdoc).mockImplementation(() => okAsync(documentFixture()));
    const renderer = rendererFixture();
    vi.mocked(createTypeGpuRenderer)
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
    const gpu = vi.mocked(createTypeGpuRenderer).mock.calls[1]![0]!;
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
    const { status: state, reportGpuError, rendererCallbacks } = createViewerStatus(documentSource, session);
    const [dragging, setDragging] = createSignal(false, { ownedWrite: true });
    const [autoZoom, setAutoZoom] = createSignal(false, { ownedWrite: true });
    const [vectorOnly, setVectorOnly] = createSignal(false);
    const [grids, setGrids] = createSignal(false);
    let overviewCamera: OverviewCameraRef | undefined;
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
      setOverviewCamera(ref?: OverviewCameraRef) {
        overviewCamera = ref;
      },
      showOverview() {
        setAutoZoom(false);
        overviewCamera?.fitToDocument();
      }
    };
    const host = document.createElement('div');
    const disposeView = render(
      () => (
        <>
          <TypeGPURootProvider requiredBufferBytes={256 * 1024 * 1024} error={reportGpuError}>
            <Show when={canvas()} keyed>
              {(target) => (
                <GpuCanvasProvider canvas={target} error={reportGpuError}>
                  <Show when={!documentSource.error()}>
                    <Loading on={session()}>
                      {documentSource.document()?.match(
                        ({ data, signal }) => (
                          <Viewport>
                            <FrameLoop onError={documentSource.fail}>
                              {(loop) => (
                                <DocumentCamera>
                                  <DocumentSpace pageAspect={data.pages[0]!.width / data.pages[0]!.height}>
                                    <CameraControls
                                      pageAspect={data.pages[0]!.width / data.pages[0]!.height}
                                      onInteraction={() => viewer.setAutoZoom(false)}
                                      onDraggingChange={viewer.setDragging}
                                    />

                                    <OverviewCamera document={data} ref={viewer.setOverviewCamera} padding={padding} />

                                    <CameraTour document={data} enabled={viewer.autoZoom()} />

                                    <DocumentRendererProvider
                                      document={data}
                                      initialFrame="viewport"
                                      {...rendererCallbacks(signal)}
                                      error={(error) => {
                                        loop.fail(error);
                                        return null;
                                      }}
                                    >
                                      <DocumentLayer vectorOnly={viewer.vectorOnly()} grids={viewer.grids()} />
                                    </DocumentRendererProvider>
                                  </DocumentSpace>
                                </DocumentCamera>
                              )}
                            </FrameLoop>
                          </Viewport>
                        ),
                        documentSource.fail
                      )}
                    </Loading>
                  </Show>
                </GpuCanvasProvider>
              )}
            </Show>
          </TypeGPURootProvider>
        </>
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

function rendererFixture(): TextRenderer {
  return {
    draw: vi.fn(() => ok()),
    render: vi.fn(() => ok()),
    destroy: vi.fn(),
    settle: vi.fn(() => okAsync()),
    events: new EventTarget(),
    resourceBytes: 1024,
    refinement: undefined
  };
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
