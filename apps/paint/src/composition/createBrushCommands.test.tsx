import { createRoot, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { defaultBrush } from '../brush';
import type { PaintEndpoint } from '../mainThreadEndpoint';
import { createBrushCommands } from './createBrushCommands';

it('correlates results, rejects concurrent actions and disconnects pending work on replacement/disposal', async () => {
  let dispose!: () => void;
  let allowed = true;
  const commands = createRoot((stop) => {
    dispose = stop;
    return createBrushCommands(() => allowed);
  });
  const target = endpoint();
  commands.connect(target);
  try {
    const first = commands.run(defaultBrush(), 'load');
    flush();
    expect(commands.busy()).toBe(true);
    expect((await commands.run(defaultBrush(), 'clean')).ok).toBe(false);
    const request = target.postMessage.mock.calls[0]![0];
    if (request.type !== 'brush-command') throw new Error('Expected command');
    commands.receive({ type: 'brush-command', requestId: 'unrelated', result: { ok: true, value: undefined } });
    expect(commands.isBusy()).toBe(true);
    commands.receive({
      type: 'brush-command',
      requestId: request.requestId,
      result: { ok: false, error: 'Unsupported' }
    });
    expect(await first).toEqual({ ok: false, error: 'Unsupported' });
    allowed = false;
    expect((await commands.run(defaultBrush(), 'load')).ok).toBe(false);
    expect(target.postMessage).toHaveBeenCalledOnce();
    allowed = true;
    const second = commands.run(defaultBrush(), 'load');
    commands.connect(endpoint());
    expect((await second).ok).toBe(false);
    const third = commands.run(defaultBrush(), 'clean');
    dispose();
    expect((await third).ok).toBe(false);
    commands.connect(endpoint());
    expect((await commands.run(defaultBrush(), 'load')).ok).toBe(false);
  } finally {
    dispose();
  }
});

it('reports transport failures and permits retry after a settled acknowledgement', async () => {
  let dispose!: () => void;
  const commands = createRoot((stop) => {
    dispose = stop;
    return createBrushCommands(() => true);
  });
  const target = endpoint();
  commands.connect(target);
  try {
    target.postMessage.mockImplementationOnce(() => {
      throw new Error('Cannot clone command');
    });
    expect(await commands.run(defaultBrush(), 'load')).toEqual({ ok: false, error: 'Cannot clone command' });
    expect(commands.isBusy()).toBe(false);
    const work = commands.run(defaultBrush(), 'clean');
    const request = target.postMessage.mock.calls[1]![0];
    if (request.type !== 'brush-command') throw new Error('Expected command');
    commands.receive({ type: 'brush-command', requestId: request.requestId, result: { ok: true, value: undefined } });
    expect(await work).toEqual({ ok: true, value: undefined });
  } finally {
    dispose();
  }
});

function endpoint() {
  return {
    postMessage: vi.fn<(command: Parameters<PaintEndpoint['postMessage']>[0], transfer?: Transferable[]) => void>(),
    terminate() {},
    onmessage: null,
    onerror: null
  };
}
