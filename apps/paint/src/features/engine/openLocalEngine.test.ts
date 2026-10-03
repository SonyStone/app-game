import { afterEach, expect, it, vi } from 'vitest';
import { openLocalEngine } from './openLocalEngine';

const runtime = vi.hoisted(() => ({
  failStart: false,
  sent: [] as unknown[],
  terminate: vi.fn(),
  emit: undefined as ((event: unknown) => void) | undefined
}));
vi.mock('./StudioApplication', () => ({
  createStudioRuntime: (post: (event: unknown) => void) => {
    if (runtime.failStart) {
      throw new Error('No adapter');
    }

    runtime.emit = post;
    return { send: (command: unknown) => runtime.sent.push(command), terminate: runtime.terminate };
  }
}));

afterEach(() => {
  runtime.failStart = false;
  runtime.sent.length = 0;
  runtime.terminate.mockClear();
  runtime.emit = undefined;
});

it('queues commands, including init, until the engine module loads, and clones messages both ways', async () => {
  const handlers = { message: vi.fn(), error: vi.fn() };
  const canvas = {} as HTMLCanvasElement;
  const transport = openLocalEngine(canvas, { size: { width: 10, height: 10 }, dpr: 1 }, handlers);
  const command = { type: 'undo' } as const;
  transport.post(command);
  expect(runtime.sent).toEqual([]);

  await vi.waitFor(() => expect(runtime.sent).toHaveLength(2));
  expect(runtime.sent[0]).toMatchObject({ type: 'init', canvas });
  expect(runtime.sent[1]).toEqual(command);
  expect(runtime.sent[1]).not.toBe(command);

  const event = { type: 'ready' };
  runtime.emit!(event);
  expect(handlers.message).toHaveBeenCalledWith(event);
  expect(handlers.message.mock.calls[0]![0]).not.toBe(event);

  transport.close();
  expect(runtime.terminate).toHaveBeenCalledOnce();
  runtime.emit!(event);
  expect(handlers.message).toHaveBeenCalledOnce();
});

it('reports a runtime that throws while starting, but not after the transport closed', async () => {
  runtime.failStart = true;
  const handlers = { message: vi.fn(), error: vi.fn() };
  openLocalEngine({} as HTMLCanvasElement, { size: { width: 1, height: 1 }, dpr: 1 }, handlers);
  await vi.waitFor(() => expect(handlers.error).toHaveBeenCalledOnce());
  expect(handlers.error.mock.calls[0]![0]).toMatchObject({ kind: 'create', cause: expect.any(Error) });

  const closed = { message: vi.fn(), error: vi.fn() };
  openLocalEngine({} as HTMLCanvasElement, { size: { width: 1, height: 1 }, dpr: 1 }, closed).close();
  await new Promise((resolve) => setTimeout(resolve));
  expect(closed.error).not.toHaveBeenCalled();
});
