// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { PaintCanvas, type CanvasInput } from './PaintCanvas';

const input = vi.hoisted(() => ({ detach: vi.fn(), attach: vi.fn() }));
vi.mock('@app-game/paint-core/input', () => ({ attachInput: input.attach }));

it('connects after DOM insertion even when a sibling ref flushes effects, then detaches on disposal', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const disconnect = vi.fn();
  const connect = vi.fn((canvas: HTMLCanvasElement) => {
    expect(canvas.isConnected).toBe(true);
    expect(canvas.ownerDocument.defaultView).toBe(window);
    return disconnect;
  });
  input.attach.mockReturnValue(input.detach);
  const dispose = render(
    () => (
      <>
        <PaintCanvas connect={connect} input={{} as CanvasInput} crosshair={false} />
        <div ref={() => flush()} />
      </>
    ),
    host
  );
  expect(connect).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(connect).toHaveBeenCalledOnce();
  dispose();
  expect(input.detach).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledOnce();
  host.remove();
});

it('does not open a canvas disposed before the deferred connection', async () => {
  const host = document.createElement('div');
  const connect = vi.fn(() => vi.fn());
  const dispose = render(
    () => (
      <>
        <PaintCanvas connect={connect} input={{} as CanvasInput} crosshair={false} />
        <div ref={() => flush()} />
      </>
    ),
    host
  );
  flush();
  dispose();
  await Promise.resolve();
  expect(connect).not.toHaveBeenCalled();
});
