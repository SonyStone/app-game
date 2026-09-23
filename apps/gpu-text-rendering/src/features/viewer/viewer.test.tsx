import { render } from '@solidjs/web';
import { err, ok, okAsync } from 'neverthrow';
import { createRoot, createSignal, flush, Show } from 'solid-js';
import tgpu from 'typegpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import { gpuError } from '../../shared/errors';
import { GpuCanvasProvider } from '../../shared/gpu/GpuCanvasProvider';
import { TypeGPURootProvider } from '../../shared/gpu/TypeGPURootProvider';
import { loadDocument, type TextDocument } from '../document/document';
import { createTypeGpuRenderer, type TextRenderer } from '../document/rendering/createTypeGpuRenderer';
import { createViewerState } from './createViewerState';
import { DocumentViewer } from './DocumentViewer';

vi.mock('typegpu', () => ({ default: { initFromDevice: vi.fn() } }));
vi.mock('../document/document', () => ({ loadDocument: vi.fn() }));
vi.mock('../document/rendering/createTypeGpuRenderer', () => ({ createTypeGpuRenderer: vi.fn() }));

const cleanups: (() => void)[] = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const disconnect = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  frames.clear();
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
  it('does not load without a canvas, aborts loading on disposal and closes late bitmaps', async () => {
    const pending = deferred<Awaited<ReturnType<typeof loadDocument>>>();
    vi.mocked(loadDocument).mockReturnValue(pending.promise);
    const { viewer, setCanvas, dispose } = setup();
    expect(loadDocument).not.toHaveBeenCalled();
    setCanvas(makeCanvas());
    await settle();
    const signal = vi.mocked(loadDocument).mock.calls[0]![0]!;
    const state = viewer.state();
    dispose();
    expect(signal.aborted).toBe(true);
    const { data, close } = documentFixture();
    pending.resolve(ok(data));
    await settle();
    expect(close).toHaveBeenCalledOnce();
    expect(createTypeGpuRenderer).not.toHaveBeenCalled();
    expect(viewer.state()).toEqual(state);
    expect(frames.size).toBe(0);
  });

  it('draws on demand, reacts to options and stops the tour on wheel input', async () => {
    const renderer = rendererFixture();
    vi.mocked(loadDocument).mockResolvedValue(ok(documentFixture().data));
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

  it('fits every mixed-size page and stops the tour without reloading', async () => {
    const renderer = rendererFixture();
    const { data } = documentFixture();
    data.pages.push({ ...data.pages[0]!, width: 1224, height: 1584, x: -3, y: 5 });
    vi.mocked(loadDocument).mockResolvedValue(ok(data));
    vi.mocked(createTypeGpuRenderer).mockResolvedValue(ok(renderer));
    const { viewer, setCanvas } = setup();
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
    for (const page of data.pages) {
      const left = (-page.x * frame.mul[0] + frame.add[0] + 1) * 400;
      const right = ((-page.x + page.width / 612) * frame.mul[0] + frame.add[0] + 1) * 400;
      const top = (1 - ((1 - page.y) * frame.mul[1] + frame.add[1])) * 300;
      const bottom = (1 - ((1 - page.y - page.height / 792) * frame.mul[1] + frame.add[1])) * 300;
      expect(left).toBeGreaterThanOrEqual(23.99);
      expect(right).toBeLessThanOrEqual(776.01);
      expect(top).toBeGreaterThanOrEqual(43.99);
      expect(bottom).toBeLessThanOrEqual(516.01);
    }
    expect(loadDocument).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });

  it('releases old targets, pointer captures and observers on replacement and removal', async () => {
    const first = rendererFixture();
    const second = rendererFixture();
    vi.mocked(loadDocument).mockImplementation(async () => ok(documentFixture().data));
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
    expect(vi.mocked(loadDocument).mock.calls[0]![0]!.aborted).toBe(true);
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
    vi.mocked(loadDocument).mockImplementation(async () => ok(documentFixture().data));
    vi.mocked(createTypeGpuRenderer).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(ok(current));
    const { viewer, setCanvas } = setup();
    setCanvas(makeCanvas());
    await settle();
    const oldGpu = vi.mocked(createTypeGpuRenderer).mock.calls[0]![0]!;
    setCanvas(makeCanvas());
    await settle();
    const state = viewer.state();
    expect(oldGpu.signal.aborted).toBe(true);
    pending.resolve(ok(late));
    await settle();
    expect(late.destroy).toHaveBeenCalledOnce();
    expect(current.destroy).not.toHaveBeenCalled();
    expect(viewer.state()).toEqual(state);
    await tick();
    expect(current.draw).toHaveBeenCalledOnce();
    expect(late.draw).not.toHaveBeenCalled();
  });

  it('reuses the device and canvas when replacing the document', async () => {
    const first = rendererFixture();
    const second = rendererFixture();
    vi.mocked(loadDocument).mockImplementation(async () => ok(documentFixture().data));
    vi.mocked(createTypeGpuRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));
    const { setCanvas, setSession, dispose } = setup();
    setCanvas(makeCanvas());
    await settle();
    const gpu = vi.mocked(createTypeGpuRenderer).mock.calls[0]![0]!;
    setSession({ file: new File(['pdf'], 'replacement.pdf') });
    await settle();
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(vi.mocked(loadDocument).mock.calls[0]![0]!.aborted).toBe(true);
    expect(vi.mocked(createTypeGpuRenderer).mock.calls[1]![0]).toBe(gpu);
    expect(gpu.signal.aborted).toBe(false);
    expect(tgpu.initFromDevice).toHaveBeenCalledOnce();
    dispose();
    expect(second.destroy).toHaveBeenCalledOnce();
    expect(gpu.device.destroy).toHaveBeenCalledOnce();
  });

  it('surfaces initialization errors and device loss while idle', async () => {
    vi.mocked(loadDocument).mockImplementation(async () => ok(documentFixture().data));
    const renderer = rendererFixture();
    vi.mocked(createTypeGpuRenderer)
      .mockResolvedValueOnce(err(gpuError('adapter', 'No WebGPU adapter')))
      .mockResolvedValueOnce(ok(renderer));
    const { viewer, setCanvas } = setup();
    setCanvas(makeCanvas());
    await settle();
    expect(viewer.state()).toMatchObject({ phase: 'error', error: { kind: 'gpu', code: 'adapter' } });
    expect(frames.size).toBe(0);
    setCanvas(makeCanvas());
    await settle();
    await tick();
    const gpu = vi.mocked(createTypeGpuRenderer).mock.calls[1]![0]!;
    loseDevice.get(gpu.device)!({ message: 'Device lost', reason: 'unknown' });
    await settle();
    expect(viewer.state()).toMatchObject({ phase: 'error', error: { kind: 'gpu', code: 'lost' } });
    expect(renderer.destroy).toHaveBeenCalledOnce();
    viewer.setGrids(true);
    flush();
    expect(frames.size).toBe(0);
  });
});

function setup() {
  const result = createRoot((disposeState) => {
    const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
    const viewer = createViewerState();
    const [session, setSession] = createSignal<{ file?: File }>({});
    const host = document.createElement('div');
    const disposeView = render(
      () => (
        <Show when={canvas()} keyed>
          {(target) => (
            <TypeGPURootProvider
              requiredBufferBytes={256 * 1024 * 1024}
              error={(error) => {
                viewer.setState({ phase: 'error', message: error.message, error });
                return null;
              }}
            >
              <GpuCanvasProvider canvas={target} error={() => null}>
                <Show when={session()} keyed>
                  {(current) => <DocumentViewer viewer={viewer} file={current.file} />}
                </Show>
              </GpuCanvasProvider>
            </TypeGPURootProvider>
          )}
        </Show>
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
  const close = vi.fn();
  const data: TextDocument = {
    pages: [{ width: 612, height: 792, beginVertex: 0, endVertex: 6, images: [], x: 0, y: 0 }],
    kind: 'glyphs',
    glyphVertices: new ArrayBuffer(72),
    positions: { x: new Float32Array([0.5]), y: new Float32Array([0.5]) },
    atlas: { buf: new ArrayBuffer(4), width: 1, height: 1 },
    atlasVertices: { buf: new ArrayBuffer(72), width: 1, height: 1 },
    imageVertices: new ArrayBuffer(0),
    images: new Map([['image', { width: 1, height: 1, close }]])
  };
  return { data, close };
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
