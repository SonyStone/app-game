import { err, ok } from 'neverthrow';
import { expect, it, vi } from 'vitest';
import { gpuError } from '../../shared/errors';
import { makeGpuFrameGate } from './makeGpuFrameGate';

it('coalesces blocked frames and reads fresh state when the GPU finishes', async () => {
  const work = deferred();
  const invalidate = vi.fn();
  const gate = makeGpuFrameGate(() => work.promise, invalidate, vi.fn());
  let camera = 1;
  const submitted: number[] = [];
  const render = () => {
    submitted.push(camera);
    return ok();
  };

  gate.draw(render);
  camera = 2;
  gate.draw(render);
  camera = 3;
  gate.draw(render);
  expect(submitted).toEqual([1]);
  work.resolve();
  await vi.waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
  gate.draw(render);
  expect(submitted).toEqual([1, 3]);
  gate.destroy();
});

it('does not turn a completed demand-driven draw into an endless animation', async () => {
  const invalidate = vi.fn();
  const gate = makeGpuFrameGate(async () => {}, invalidate, vi.fn());
  gate.draw(() => ok());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(invalidate).not.toHaveBeenCalled();
  gate.destroy();
});

it('ignores completion after disposal, including queued redraw requests', async () => {
  const work = deferred();
  const invalidate = vi.fn();
  const gate = makeGpuFrameGate(() => work.promise, invalidate, vi.fn());
  const render = vi.fn(() => ok());
  gate.draw(render);
  gate.draw(render);
  gate.destroy();
  work.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  gate.draw(render);
  expect(invalidate).not.toHaveBeenCalled();
  expect(render).toHaveBeenCalledOnce();
});

it('reports a rejected GPU fence once and preserves typed draw failures', async () => {
  const failure = gpuError('render', 'bad draw');
  const complete = vi.fn(() => Promise.reject(new Error('lost device')));
  const fail = vi.fn();
  const gate = makeGpuFrameGate(complete, vi.fn(), fail);
  expect(gate.draw(() => err(failure))).toEqual(err(failure));
  expect(complete).not.toHaveBeenCalled();
  gate.draw(() => ok());
  await vi.waitFor(() => expect(fail).toHaveBeenCalledOnce());
  expect(fail).toHaveBeenCalledWith(expect.objectContaining({ code: 'render', message: 'lost device' }));
  gate.draw(() => ok());
  expect(complete).toHaveBeenCalledOnce();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
