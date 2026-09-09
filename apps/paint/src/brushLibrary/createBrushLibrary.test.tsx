import { createRoot, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import type { PaintEndpoint } from '../mainThreadEndpoint';
import type { PaintCommand } from '../protocol';
import { createBrushLibrary } from './createBrushLibrary';
import type { BrushLibrary } from './decodeAbrLibrary';

it('waits for upload, reuses resident tips and restores selection on a replacement endpoint', async () => {
  const select = vi.fn();
  let dispose!: () => void;
  const library = createRoot((stop) => {
    dispose = stop;
    return createBrushLibrary({ select, canChange: () => true, load: async () => fixture() });
  });
  const first = endpoint();
  library.connect(first);
  try {
    const importing = library.importFile(new File(['x'], 'test.abr'));
    await vi.waitFor(() => expect(first.postMessage).toHaveBeenCalledOnce());
    expect(select).not.toHaveBeenCalled();
    expect(library.isBusy()).toBe(true);
    ack(library, first);
    await importing;
    flush();
    expect(library.selected()).toBe('first');
    expect(select).toHaveBeenLastCalledWith({ id: 'textured', settings: { tipId: 'tip' } });
    await library.choose(undefined);
    await library.choose('first');
    expect(first.postMessage).toHaveBeenCalledOnce();
    const second = endpoint();
    library.connect(second);
    const restored = library.restore();
    expect(second.postMessage).toHaveBeenCalledOnce();
    ack(library, second);
    await restored;
    expect(library.selected()).toBe('first');
  } finally {
    dispose();
  }
});

it('keeps the selected library after import/upload failure and cancels pending work on disposal', async () => {
  const load = vi.fn(async () => fixture());
  let dispose!: () => void;
  const library = createRoot((stop) => {
    dispose = stop;
    return createBrushLibrary({ select: vi.fn(), canChange: () => true, load });
  });
  const target = endpoint();
  library.connect(target);
  const first = library.importFile(new File(['x'], 'ok.abr'));
  await vi.waitFor(() => expect(target.postMessage).toHaveBeenCalledOnce());
  ack(library, target);
  await first;
  load.mockRejectedValueOnce(new Error('bad file'));
  await library.importFile(new File(['bad'], 'bad.abr'));
  flush();
  expect(library.library()?.name).toBe('test.abr');
  expect(library.selected()).toBe('first');
  expect(library.error()).toBe('bad file');
  library.connect(endpoint());
  const restoring = library.restore();
  const rejection = expect(restoring).rejects.toThrow('engine changed');
  dispose();
  await rejection;
});

it('reports typed upload errors without applying a missing tip', async () => {
  const select = vi.fn();
  let dispose!: () => void;
  const library = createRoot((stop) => {
    dispose = stop;
    return createBrushLibrary({ select, canChange: () => true, load: async () => fixture() });
  });
  const target = endpoint();
  library.connect(target);
  try {
    const work = library.importFile(new File(['x'], 'test.abr'));
    await vi.waitFor(() => expect(target.postMessage).toHaveBeenCalledOnce());
    const request = target.postMessage.mock.calls[0]![0];
    if (request.type !== 'brush-resources') throw new Error('Expected resource upload');
    library.receive({
      type: 'brush-resources',
      requestId: request.requestId,
      result: { ok: false, error: 'No space' }
    });
    await work;
    flush();
    expect(select).not.toHaveBeenCalled();
    expect(library.error()).toBe('No space');
    expect(library.isBusy()).toBe(false);
  } finally {
    dispose();
  }
});

it('tracks a late upload acknowledgement after timeout without submitting duplicate resource IDs', async () => {
  let dispose!: () => void;
  const library = createRoot((stop) => {
    dispose = stop;
    return createBrushLibrary({ select: vi.fn(), canChange: () => true, load: async () => fixture() });
  });
  try {
    const first = endpoint();
    library.connect(first);
    const importing = library.importFile(new File(['x'], 'test.abr'));
    await vi.waitFor(() => expect(first.postMessage).toHaveBeenCalledOnce());
    ack(library, first);
    await importing;
    const second = endpoint();
    library.connect(second);
    vi.useFakeTimers();
    const expired = expect(library.restore()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(30_000);
    await expired;
    await expect(library.restore()).rejects.toThrow('still finishing');
    expect(second.postMessage).toHaveBeenCalledOnce();
    ack(library, second);
    await library.restore();
    expect(second.postMessage).toHaveBeenCalledOnce();
  } finally {
    dispose();
    vi.useRealTimers();
  }
});

function fixture(): BrushLibrary {
  return {
    name: 'test.abr',
    brushes: [{ id: 'first', name: 'Ink', tipId: 'tip' }],
    tips: [{ id: 'tip', width: 1, height: 1, format: 'r8unorm', pixels: new Uint8Array([255]) }],
    skipped: 0,
    notices: 0
  };
}
function endpoint() {
  return {
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    postMessage: vi.fn<(command: PaintCommand) => void>()
  } satisfies PaintEndpoint;
}
function ack(library: ReturnType<typeof createBrushLibrary>, target: ReturnType<typeof endpoint>) {
  const request = target.postMessage.mock.calls.at(-1)![0];
  if (request.type !== 'brush-resources') throw new Error('Expected resource upload');
  library.receive({
    type: 'brush-resources',
    requestId: request.requestId,
    result: { ok: true, value: { evicted: [], stats: { bytes: 1, entries: 1, pinnedBytes: 0 } } }
  });
}
