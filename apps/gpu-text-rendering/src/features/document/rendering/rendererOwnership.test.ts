import type { GpuContext } from '@app-game/solid-gpu/gpu';
import { err, ok } from 'neverthrow';
import { beforeEach, expect, it, vi } from 'vitest';
import { documentError } from '../../../shared/errors';
import type { TextDocument } from '../document';
import { createTypeGpuRenderer } from './createTypeGpuRenderer';
import { prepareCurveDocument } from './curves/prepareCurveDocument';
import type { DocumentWorkers } from './DocumentWorkers';
import { prepareGlyphDocument } from './prepareGlyphDocument';

vi.mock('./prepareGlyphDocument', () => ({ prepareGlyphDocument: vi.fn() }));
vi.mock('./curves/prepareCurveDocument', () => ({ prepareCurveDocument: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('releases document resources after failure while leaving the provider resources alive', async () => {
  const { gpu, resource, device, root } = fixture();
  vi.mocked(prepareCurveDocument).mockImplementationOnce(async (_gpu, _document, keep) => {
    keep(resource);
    return err(documentError('invalid-data', 'Malformed document'));
  });
  const result = await createTypeGpuRenderer(gpu, curves, { workers });
  expect(result._unsafeUnwrapErr()).toMatchObject({ kind: 'document' });
  expect(resource.destroy).toHaveBeenCalledOnce();
  expect(device.popErrorScope).toHaveBeenCalledOnce();
  expect(device.destroy).not.toHaveBeenCalled();
  expect(root.destroy).not.toHaveBeenCalled();
});

it('pops the validation scope and releases partial allocations when preparation rejects', async () => {
  const { gpu, resource, device } = fixture();
  vi.mocked(prepareGlyphDocument).mockImplementationOnce(async (_gpu, _document, keep) => {
    keep(resource);
    throw new Error('Pipeline compilation failed');
  });
  const result = await createTypeGpuRenderer(gpu, {} as TextDocument, { workers });
  expect(result._unsafeUnwrapErr()).toMatchObject({ code: 'device', message: 'Pipeline compilation failed' });
  expect(device.popErrorScope).toHaveBeenCalledOnce();
  expect(resource.destroy).toHaveBeenCalledOnce();
});

it('cancels an in-flight document without destroying its borrowed device', async () => {
  const { gpu, resource, device } = fixture();
  const abort = new AbortController();
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const late = { destroy: vi.fn() };
  vi.mocked(prepareCurveDocument).mockImplementationOnce(async (_gpu, _document, keep) => {
    keep(resource);
    await pending;
    keep(late);
    return err(documentError('invalid-data', 'Late result'));
  });
  const result = createTypeGpuRenderer(gpu, curves, { workers, signal: abort.signal });
  // safeTry advances an async generator before entering document preparation.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(prepareCurveDocument).toHaveBeenCalledOnce();
  abort.abort();
  expect(resource.destroy).toHaveBeenCalledOnce();
  resume();
  expect((await result)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
  expect(late.destroy).toHaveBeenCalledOnce();
  expect(device.destroy).not.toHaveBeenCalled();
});

it('destroys a successful document repeatedly without releasing the device or canvas', async () => {
  const { gpu, resource, device, root, context } = fixture();
  vi.mocked(prepareGlyphDocument).mockImplementationOnce(async (_gpu, _document, keep) => {
    keep(resource);
    return ok({ resourceBytes: 10 } as never);
  });
  const renderer = (await createTypeGpuRenderer(gpu, {} as TextDocument, { workers }))._unsafeUnwrap();
  renderer.destroy();
  renderer.destroy();
  expect(resource.destroy).toHaveBeenCalledOnce();
  expect((await renderer.settle())._unsafeUnwrapErr()).toMatchObject({ code: 'destroyed' });
  expect(device.destroy).not.toHaveBeenCalled();
  expect(root.destroy).not.toHaveBeenCalled();
  expect(context.unconfigure).not.toHaveBeenCalled();
});

it('keeps validation scopes paired with their own document during concurrent preparation', async () => {
  const { gpu, device } = fixture();
  const scopes: (GPUError | null)[] = [];
  device.pushErrorScope.mockImplementation(() => {
    scopes.push(null);
  });
  vi.mocked(gpu.device.popErrorScope).mockImplementation(async () => scopes.pop()!);
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  vi.mocked(prepareGlyphDocument)
    .mockImplementationOnce(async () => {
      await pending;
      return ok({ resourceBytes: 1 } as never);
    })
    .mockImplementationOnce(async () => {
      scopes[scopes.length - 1] = { message: 'Second document validation failed' };
      return ok({ resourceBytes: 2 } as never);
    });
  const first = createTypeGpuRenderer(gpu, {} as TextDocument, { workers });
  const second = createTypeGpuRenderer(gpu, {} as TextDocument, { workers });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(prepareGlyphDocument).toHaveBeenCalledOnce();
  expect(scopes).toHaveLength(1);
  resume();
  const [a, b] = await Promise.all([first, second]);
  expect(a.isOk()).toBe(true);
  expect(b._unsafeUnwrapErr()).toMatchObject({ code: 'validation', message: 'Second document validation failed' });
  expect(scopes).toHaveLength(0);
  a._unsafeUnwrap().destroy();
});

it('skips queued preparations cancelled before they acquire the device', async () => {
  const { gpu, device } = fixture();
  const abort = new AbortController();
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  vi.mocked(prepareGlyphDocument).mockImplementationOnce(async () => {
    await pending;
    throw new Error('First preparation failed');
  });
  const first = createTypeGpuRenderer(gpu, {} as TextDocument, { workers });
  const second = createTypeGpuRenderer(gpu, {} as TextDocument, { workers, signal: abort.signal });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  abort.abort();
  resume();
  expect((await first).isErr()).toBe(true);
  expect((await second)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
  expect(prepareGlyphDocument).toHaveBeenCalledOnce();
  expect(device.pushErrorScope).toHaveBeenCalledOnce();
  expect(device.popErrorScope).toHaveBeenCalledOnce();
});

function fixture() {
  const device = {
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(async () => null),
    destroy: vi.fn(),
    queue: { onSubmittedWorkDone: vi.fn(async () => {}) }
  };
  const root = { destroy: vi.fn() };
  const context = { unconfigure: vi.fn() };
  const gpu = {
    device,
    root,
    context,
    format: 'bgra8unorm',
    signal: new AbortController().signal,
    checkActive: () => ok()
  } as unknown as GpuContext;
  return { gpu, device, root, context, resource: { destroy: vi.fn() } };
}

const workers: DocumentWorkers = {
  coverage: vi.fn(),
  raster: { decode: vi.fn(), destroy: vi.fn() }
};

/** Dispatches to the (mocked) curve renderer, whose preparation can fail with document errors. */
const curves = { kind: 'curves' } as TextDocument;
