import { err, ok } from 'neverthrow';
import { beforeEach, expect, it, vi } from 'vitest';
import { documentError } from '../../../shared/errors';
import type { GpuContext } from '../../../shared/gpu/context';
import type { TextDocument } from '../document';
import { createTypeGpuRenderer } from './createTypeGpuRenderer';
import { prepareDocument } from './prepareDocument';

vi.mock('./prepareDocument', () => ({ prepareDocument: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('releases document resources after failure while leaving the provider resources alive', async () => {
  const { gpu, resource, device, root } = fixture();
  vi.mocked(prepareDocument).mockImplementationOnce(async (_gpu, _document, keep) => {
    keep(resource);
    return err(documentError('invalid-data', 'Malformed document'));
  });
  const result = await createTypeGpuRenderer(gpu, {} as TextDocument);
  expect(result._unsafeUnwrapErr()).toMatchObject({ kind: 'document' });
  expect(resource.destroy).toHaveBeenCalledOnce();
  expect(device.popErrorScope).toHaveBeenCalledOnce();
  expect(device.destroy).not.toHaveBeenCalled();
  expect(root.destroy).not.toHaveBeenCalled();
});

it('pops the validation scope and releases partial allocations when preparation rejects', async () => {
  const { gpu, resource, device } = fixture();
  vi.mocked(prepareDocument).mockImplementationOnce(async (_gpu, _document, keep) => {
    keep(resource);
    throw new Error('Pipeline compilation failed');
  });
  const result = await createTypeGpuRenderer(gpu, {} as TextDocument);
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
  vi.mocked(prepareDocument).mockImplementationOnce(async (_gpu, _document, keep) => {
    keep(resource);
    await pending;
    keep(late);
    return err(documentError('invalid-data', 'Late result'));
  });
  const result = createTypeGpuRenderer(gpu, {} as TextDocument, abort.signal);
  // safeTry advances an async generator before entering document preparation.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(prepareDocument).toHaveBeenCalledOnce();
  abort.abort();
  expect(resource.destroy).toHaveBeenCalledOnce();
  resume();
  expect((await result)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
  expect(late.destroy).toHaveBeenCalledOnce();
  expect(device.destroy).not.toHaveBeenCalled();
});

it('destroys a successful document repeatedly without releasing the device or canvas', async () => {
  const { gpu, resource, device, root, context } = fixture();
  vi.mocked(prepareDocument).mockImplementationOnce(async (_gpu, _document, keep) => {
    keep(resource);
    return ok({ resourceBytes: 10 } as never);
  });
  const renderer = (await createTypeGpuRenderer(gpu, {} as TextDocument))._unsafeUnwrap();
  renderer.destroy();
  renderer.destroy();
  expect(resource.destroy).toHaveBeenCalledOnce();
  expect((await renderer.settle())._unsafeUnwrapErr()).toMatchObject({ code: 'destroyed' });
  expect(device.destroy).not.toHaveBeenCalled();
  expect(root.destroy).not.toHaveBeenCalled();
  expect(context.unconfigure).not.toHaveBeenCalled();
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
