import { render } from '@solidjs/web';
import { err, ok, okAsync } from 'neverthrow';
import { createRoot, createSignal, flush, onCleanup } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gpuError } from '../../../shared/errors';
import type { GpuContext } from '../../../shared/gpu/context';
import type { TextDocument } from '../document';
import { DocumentRendererProvider, useDocumentRenderer } from './DocumentRendererProvider';
import { createTypeGpuRenderer, type TextRenderer } from './createTypeGpuRenderer';

vi.mock('../../../shared/gpu/GpuCanvasProvider', () => ({ useGpuCanvas: () => gpu }));
vi.mock('./createTypeGpuRenderer', () => ({ createTypeGpuRenderer: vi.fn() }));

let gpu: GpuContext;
const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  gpu = { signal: new AbortController().signal } as GpuContext;
});

afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
});

it('replaces children and releases the old renderer while retaining the GPU', async () => {
  const first = rendererFixture();
  const second = rendererFixture();
  vi.mocked(createTypeGpuRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));

  const mounted = mount();
  await settle();
  expect(mounted.bindings.map((value) => value.renderer)).toEqual([first]);

  const next = documentFixture();
  mounted.setDocument(next);
  await settle();

  expect(first.destroy).toHaveBeenCalledOnce();
  expect(second.destroy).not.toHaveBeenCalled();
  expect(mounted.detached).toHaveBeenCalledOnce();
  expect(mounted.bindings[1]).toEqual({ document: next, renderer: second });
  expect(mounted.onReady).toHaveBeenCalledTimes(2);
  expect(vi.mocked(createTypeGpuRenderer).mock.calls.every(([context]) => context === gpu)).toBe(true);
});

it('cancels preparation without mounting stale children, leaving a late renderer to release itself', async () => {
  let resolve!: (result: Awaited<ReturnType<typeof createTypeGpuRenderer>>) => void;
  const pending = new Promise<Awaited<ReturnType<typeof createTypeGpuRenderer>>>((done) => {
    resolve = done;
  });
  const late = rendererFixture();
  const current = rendererFixture();
  // Like the real renderer, the late one destroys itself when its preparation signal aborts.
  vi.mocked(createTypeGpuRenderer)
    .mockImplementationOnce((_gpu, _document, { signal }) => {
      signal!.addEventListener('abort', late.destroy, { once: true });
      return pending;
    })
    .mockResolvedValueOnce(ok(current));

  const mounted = mount();
  await settle();
  const signal = vi.mocked(createTypeGpuRenderer).mock.calls[0]![2].signal!;
  expect(mounted.bindings).toEqual([]);

  mounted.setDocument(documentFixture());
  await settle();
  expect(signal.aborted).toBe(true);

  resolve(ok(late));
  await settle();

  expect(late.destroy).toHaveBeenCalledOnce();
  expect(mounted.bindings.map((value) => value.renderer)).toEqual([current]);
  expect(mounted.onReady).toHaveBeenCalledOnce();
  expect(mounted.onError).not.toHaveBeenCalled();
});

it('observes only the current renderer and detaches residency listeners on GPU abort', async () => {
  const abort = new AbortController();
  gpu = { signal: abort.signal } as GpuContext;
  const first = rendererFixture();
  const second = rendererFixture();
  vi.mocked(createTypeGpuRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));
  const mounted = mount();
  await settle();
  first.events.dispatchEvent(new Event('change'));
  expect(mounted.onResourceUsage).toHaveBeenCalledWith(1024);
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

it('replaces loading with a failure without mounting the ready branch', async () => {
  let finish!: (result: Awaited<ReturnType<typeof createTypeGpuRenderer>>) => void;
  vi.mocked(createTypeGpuRenderer).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const host = document.createElement('div');
  const onError = vi.fn(() => null);
  const ready = vi.fn();

  function Ready() {
    ready();
    return <span>Ready</span>;
  }

  cleanups.push(
    render(
      () => (
        <DocumentRendererProvider document={documentFixture()} loading="Preparing" error={onError}>
          <Ready />
        </DocumentRendererProvider>
      ),
      host
    )
  );
  expect(host.textContent).toBe('Preparing');

  const failure = gpuError('device', 'Preparation failed');
  finish(err(failure));
  await settle();
  expect(host.textContent).toBe('');
  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(ready).not.toHaveBeenCalled();
});

function mount() {
  const bindings: ReturnType<typeof useDocumentRenderer>[] = [];
  const detached = vi.fn();
  const onReady = vi.fn();
  const onResourceUsage = vi.fn();
  const onError = vi.fn(() => null);

  function Consumer() {
    bindings.push(useDocumentRenderer());
    onCleanup(detached);
    return null;
  }

  const result = createRoot((disposeState) => {
    const [document, setDocument] = createSignal(documentFixture());
    const host = globalThis.document.createElement('div');
    const disposeView = render(
      () => (
        <DocumentRendererProvider
          document={document()}
          error={onError}
          onReady={onReady}
          onResourceUsage={onResourceUsage}
        >
          <Consumer />
        </DocumentRendererProvider>
      ),
      host
    );

    cleanups.push(() => {
      disposeView();
      disposeState();
    });

    return { setDocument };
  });

  return { ...result, bindings, detached, onReady, onError, onResourceUsage };
}

function documentFixture() {
  return {} as TextDocument;
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

async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    flush();
  }
}
