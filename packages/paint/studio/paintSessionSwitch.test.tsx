import { render } from '@solidjs/web';
import { flush, For, onSettled } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createPaintSession, type PaintSession } from './createPaintSession';
import type { PaintEndpoint } from './mainThreadEndpoint';
import type { PaintEvent } from './protocol';

const transports = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('./paint.worker?worker', () => ({
  default: class {
    constructor() {
      return transports.create();
    }
  }
}));
vi.mock('./mainThreadEndpoint', () => ({ createMainThreadEndpoint: () => transports.create() }));
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

it('keeps the old canvas on save failure and replaces only its scope after graceful disposal', () => {
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
  reply(first, { type: 'ready' });
  session.updateBrush({ size: 123 });
  session.setLiveTail(false);
  session.setShowPenCursor(true);
  session.toggleDebug();
  flush();
  session.setWorkerEnabled(false);
  flush();
  expect(first.postMessage).toHaveBeenLastCalledWith({ type: 'checkpoint' });
  expect(session.switchingRenderer()).toBe(true);
  reply(first, { type: 'error', recoverable: false, message: 'Storage is full' });
  expect(session.switchingRenderer()).toBe(false);
  expect(document.querySelector('canvas')).toBe(originalCanvas);
  expect(endpoints).toHaveLength(1);
  expect(first.terminate).not.toHaveBeenCalled();

  session.setWorkerEnabled(false);
  flush();
  reply(first, { type: 'checkpointed' });
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
    expect.objectContaining({ type: 'init', canvas: document.querySelector('canvas') })
  );
  reply(second, { type: 'ready' });
  expect(session.switchingRenderer()).toBe(false);
  expect(session.workerEnabled()).toBe(false);
  expect(session.brush().size).toBe(123);
  expect(session.showPenCursor()).toBe(true);
  expect(second.postMessage).toHaveBeenCalledWith({ type: 'live-tail', enabled: false });
  expect(second.postMessage).toHaveBeenCalledWith({ type: 'debug', enabled: true });
  lateMessage(new MessageEvent('message', { data: { type: 'error', message: 'Retired engine', recoverable: false } }));
  flush();
  expect(session.error()).toBeUndefined();
  dispose();
  dispose = undefined;
  expect(second.postMessage).toHaveBeenLastCalledWith({ type: 'dispose' });
  reply(second, { type: 'disposed' });
  expect(second.terminate).toHaveBeenCalledOnce();
});
