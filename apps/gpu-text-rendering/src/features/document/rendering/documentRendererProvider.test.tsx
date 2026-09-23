import { render } from '@solidjs/web';
import { ok, okAsync } from 'neverthrow';
import { createRoot, createSignal, flush, onCleanup } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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

it.each(['jsx', 'render'] as const)(
  'replaces %s children and releases the old renderer while retaining the GPU',
  async (mode) => {
    const first = rendererFixture();
    const second = rendererFixture();
    vi.mocked(createTypeGpuRenderer).mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));

    const mounted = mount(mode);
    await settle();
    expect(mounted.bindings.map((value) => value.renderer)).toEqual([first]);
    expect(mounted.initial.close).toHaveBeenCalledOnce();

    const next = documentFixture();
    mounted.setDocument(next.document);
    await settle();

    expect(first.destroy).toHaveBeenCalledOnce();
    expect(second.destroy).not.toHaveBeenCalled();
    expect(mounted.detached).toHaveBeenCalledOnce();
    expect(mounted.bindings[1]).toEqual({ document: next.document, renderer: second });
    expect(mounted.onReady).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createTypeGpuRenderer).mock.calls.every(([context]) => context === gpu)).toBe(true);
    expect(next.close).toHaveBeenCalledOnce();
  }
);

it.each(['jsx', 'render'] as const)('cancels preparation without mounting stale %s children', async (mode) => {
  let resolve!: (result: Awaited<ReturnType<typeof createTypeGpuRenderer>>) => void;
  const pending = new Promise<Awaited<ReturnType<typeof createTypeGpuRenderer>>>((done) => {
    resolve = done;
  });
  const late = rendererFixture();
  const current = rendererFixture();
  vi.mocked(createTypeGpuRenderer).mockReturnValueOnce(pending).mockResolvedValueOnce(ok(current));

  const mounted = mount(mode);
  await settle();
  const signal = vi.mocked(createTypeGpuRenderer).mock.calls[0]![2]!;
  expect(mounted.bindings).toEqual([]);

  mounted.setDocument(documentFixture().document);
  await settle();
  expect(signal.aborted).toBe(true);
  expect(mounted.initial.close).toHaveBeenCalledOnce();

  resolve(ok(late));
  await settle();

  expect(late.destroy).toHaveBeenCalledOnce();
  expect(mounted.bindings.map((value) => value.renderer)).toEqual([current]);
  expect(mounted.onReady).toHaveBeenCalledOnce();
  expect(mounted.onError).not.toHaveBeenCalled();
});

function mount(mode: 'jsx' | 'render') {
  const initial = documentFixture();
  const bindings: ReturnType<typeof useDocumentRenderer>[] = [];
  const detached = vi.fn();
  const onReady = vi.fn();
  const onError = vi.fn(() => null);

  function Consumer() {
    bindings.push(useDocumentRenderer());
    onCleanup(detached);
    return null;
  }

  const result = createRoot((disposeState) => {
    const [document, setDocument] = createSignal(initial.document);
    const host = globalThis.document.createElement('div');
    const disposeView = render(
      () => (
        <DocumentRendererProvider document={document()} error={onError} onReady={onReady}>
          {mode === 'render' ? (
            (value) => {
              expect(value).toBe(useDocumentRenderer());

              return <Consumer />;
            }
          ) : (
            <Consumer />
          )}
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

  return { ...result, initial, bindings, detached, onReady, onError };
}

function documentFixture() {
  const close = vi.fn();
  const document = { images: new Map([['image', { close }]]) } as unknown as TextDocument;

  return { document, close };
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
