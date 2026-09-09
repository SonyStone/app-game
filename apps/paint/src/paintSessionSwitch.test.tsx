import { render } from '@solidjs/web';
import { flush, For, onSettled } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createPaintSession, type PaintSession } from './createPaintSession';
import type { RendererToolState } from './gpu/toolState';
import type { PaintEndpoint } from './mainThreadEndpoint';
import type { PaintCommand, PaintEvent } from './protocol';
import { defaultPaintSymmetry } from './symmetry';

const transports = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('./paint.worker?worker', () => ({
  default: class {
    constructor() {
      return transports.create();
    }
  }
}));
vi.mock('./mainThreadEndpoint', () => ({ createMainThreadEndpoint: () => transports.create() }));
vi.mock('./brushLibrary/importAbr', () => ({
  importAbr: async () => ({
    name: 'test.abr',
    brushes: [{ id: 'ink', name: 'Ink', tipId: 'ink-tip' }],
    tips: [{ id: 'ink-tip', width: 1, height: 1, format: 'r8unorm', pixels: new Uint8Array([255]) }],
    skipped: 0,
    notices: 0
  })
}));
let dispose: (() => void) | undefined;
const originalTransfer = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'transferControlToOffscreen');
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalTransfer)
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', originalTransfer);
  else Reflect.deleteProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen');
});

it.each([false, true])(
  'preserves the document/settings and waits for a selected tip on switch (ABR: %s)',
  async (withTip) => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { gpu: {} });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {
      configurable: true,
      value: () => ({})
    });
    history.replaceState(null, '', '/');
    const endpoints: PaintEndpoint[] = [];
    transports.create.mockImplementation(() => {
      const endpoint: PaintEndpoint = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
      endpoints.push(endpoint);
      return endpoint;
    });
    let session!: PaintSession;
    function Editor() {
      let stage!: HTMLDivElement, canvas!: HTMLCanvasElement;
      session = createPaintSession({ stage: () => stage, canvas: () => canvas });
      function Surface() {
        let element!: HTMLCanvasElement;
        onSettled(() => {
          canvas = element;
          return session.attachCanvas(element);
        });
        return <canvas ref={element} />;
      }
      return (
        <div ref={stage}>
          <For each={[session.canvasVersion()]} keyed={(version) => version}>
            {() => <Surface />}
          </For>
        </div>
      );
    }
    dispose = render(() => <Editor />, document.body);
    flush();
    const originalCanvas = document.querySelector('canvas');
    const originalStage = originalCanvas!.parentElement;
    const reply = (endpoint: PaintEndpoint, event: PaintEvent) => {
      endpoint.onmessage?.(new MessageEvent('message', { data: event }));
      flush();
    };
    const first = endpoints[0]!;
    const symmetry = { ...defaultPaintSymmetry(), mode: 'mandala' as const, x: -51, segments: 7 };
    expect(session.updateSymmetry(symmetry)).toBe(false);
    expect(session.symmetry()).toEqual(defaultPaintSymmetry());
    reply(first, { type: 'ready' });
    expect(session.updateSymmetry(symmetry)).toBe(true);
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: 'symmetry', settings: symmetry });
    const uploaded = (endpoint: PaintEndpoint) =>
      vi
        .mocked(endpoint.postMessage)
        .mock.calls.map(([command]) => command as PaintCommand)
        .find((command) => command.type === 'brush-resources');
    const confirmUpload = (endpoint: PaintEndpoint) => {
      const request = uploaded(endpoint);
      if (!request || request.type !== 'brush-resources') throw new Error('Expected tip upload');
      reply(endpoint, {
        type: 'brush-resources',
        requestId: request.requestId,
        result: { ok: true, value: { evicted: [], stats: { bytes: 1, entries: 1, pinnedBytes: 0 } } }
      });
    };
    if (withTip) {
      const importing = session.brushLibrary.importFile(new File(['x'], 'test.abr'));
      await vi.waitFor(() => expect(uploaded(first)).toBeDefined());
      confirmUpload(first);
      await importing;
      flush();
      expect(session.brush().engine).toEqual({ id: 'textured', settings: { tipId: 'ink-tip' } });
    }
    session.updateBrush({ size: 123, color: '#123456', backgroundColor: '#abcdef' });
    flush();
    session.chooseTool('brush');
    flush();
    session.chooseTool(withTip ? 'abr-brush' : 'brush');
    flush();
    expect(session.brush()).toMatchObject({ color: '#123456', backgroundColor: '#abcdef' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    flush();
    expect(session.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', repeat: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', altKey: true }));
    flush();
    expect(session.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
    session.setLiveTail(false);
    session.setShowPenCursor(true);
    session.toggleDebug();
    flush();
    session.setWorkerEnabled(false);
    flush();
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: 'checkpoint', includeTools: true });
    expect(session.switchingRenderer()).toBe(true);
    expect(session.canUpdateSymmetry()).toBe(false);
    expect(session.updateSymmetry(defaultPaintSymmetry())).toBe(false);
    expect(session.symmetry()).toEqual(symmetry);
    reply(first, { type: 'error', recoverable: false, message: 'Storage is full' });
    expect(session.switchingRenderer()).toBe(false);
    expect(session.symmetry()).toEqual(symmetry);
    expect(session.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
    expect(document.querySelector('canvas')).toBe(originalCanvas);
    expect(endpoints).toHaveLength(1);
    expect(first.terminate).not.toHaveBeenCalled();

    session.setWorkerEnabled(false);
    flush();
    const tools: RendererToolState = {
      version: 1,
      mixer: withTip
        ? {
            key: 'previous-mixer',
            color: '#123456',
            remaining: 0.125,
            settings: { load: 0.75, autoFill: false, autoClean: false },
            pixels: new Uint8Array(3 * 256 * 256 * 8)
          }
        : undefined
    };
    const historySource = { id: 7, label: 'State 7', layers: [] };
    reply(first, { type: 'checkpointed', tools, historySource });
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: 'dispose' });
    expect(document.querySelector('canvas')).toBe(originalCanvas);
    const lateMessage = first.onmessage!;
    reply(first, { type: 'disposed' });
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(endpoints).toHaveLength(2);
    expect(document.querySelector('canvas')).not.toBe(originalCanvas);
    expect(document.querySelector('canvas')!.parentElement).toBe(originalStage);
    expect(session.switchingRenderer()).toBe(true);
    const second = endpoints[1]!;
    expect(second.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init', canvas: document.querySelector('canvas'), tools, historySource })
    );
    reply(second, { type: 'ready' });
    if (withTip) {
      expect(session.ready()).toBe(false);
      expect(session.switchingRenderer()).toBe(true);
      expect(session.brushLibrary.selected()).toBe('ink');
      confirmUpload(second);
      await vi.waitFor(() => {
        flush();
        expect(session.ready()).toBe(true);
      });
      expect(session.brush().engine).toEqual({ id: 'textured', settings: { tipId: 'ink-tip' } });
    }
    expect(session.switchingRenderer()).toBe(false);
    expect(session.workerEnabled()).toBe(false);
    expect(session.canUpdateSymmetry()).toBe(true);
    expect(session.symmetry()).toEqual(symmetry);
    expect(session.brush().size).toBe(123);
    expect(session.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
    if (withTip) {
      session.chooseTool('brush');
      flush();
      expect(session.brush().engine).toBeUndefined();
      expect(session.brush().size).toBe(32);
      session.chooseTool('abr-brush');
      flush();
      expect(session.brush().size).toBe(123);
      expect(session.brush().engine?.id).toBe('textured');
    }
    expect(session.showPenCursor()).toBe(true);
    expect(second.postMessage).toHaveBeenCalledWith({ type: 'live-tail', enabled: false });
    expect(second.postMessage).toHaveBeenCalledWith({ type: 'debug', enabled: true });
    lateMessage(
      new MessageEvent('message', { data: { type: 'error', message: 'Retired engine', recoverable: false } })
    );
    flush();
    expect(session.error()).toBeUndefined();
    dispose();
    dispose = undefined;
    expect(second.postMessage).toHaveBeenLastCalledWith({ type: 'dispose' });
    reply(second, { type: 'disposed' });
    expect(second.terminate).toHaveBeenCalledOnce();
  }
);
