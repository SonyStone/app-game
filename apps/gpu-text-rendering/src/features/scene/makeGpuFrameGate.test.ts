import { gpuError } from '@app-game/solid-gpu/errors';
import { err, ok } from 'neverthrow';
import { expect, it, vi } from 'vitest';
import { makeGpuFrameGate } from './makeGpuFrameGate';

it('admits two unfinished frames, coalesces later requests and reads fresh state when a frame finishes', async () => {
  const first = deferred();
  const second = deferred();
  const invalidate = vi.fn();
  const complete = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const gate = makeGpuFrameGate(options({ complete, invalidate }));
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
  camera = 4;
  gate.draw(render);
  expect(submitted).toEqual([1, 2]);
  first.resolve();
  await vi.waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
  gate.draw(render);
  expect(submitted).toEqual([1, 2, 4]);
  gate.destroy();
});

it("follows the caller's limit of unfinished frames as it changes", async () => {
  const frames = [deferred(), deferred(), deferred()];
  const complete = vi.fn();
  frames.forEach((frame) => complete.mockReturnValueOnce(frame.promise));
  let limit = 3;
  const invalidate = vi.fn();
  const gate = makeGpuFrameGate(options({ complete, invalidate, maxUnfinished: () => limit }));
  const render = vi.fn(() => ok());

  gate.draw(render);
  gate.draw(render);
  gate.draw(render);
  gate.draw(render);
  expect(render).toHaveBeenCalledTimes(3);

  // With the limit lowered, one finished frame is not enough to admit the skipped request.
  limit = 2;
  frames[0]!.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(invalidate).not.toHaveBeenCalled();
  frames[1]!.resolve();
  await vi.waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
  gate.destroy();
});

it('admits a resized frame at the limit, but still waits for blocking work', async () => {
  const frames = [deferred(), deferred(), deferred()];
  const complete = vi.fn();
  frames.forEach((frame) => complete.mockReturnValueOnce(frame.promise));
  // No preparation blocks frames until the last check.
  let blocker: Promise<void> | undefined = undefined;
  const invalidate = vi.fn();
  const gate = makeGpuFrameGate(options({ complete, blocked: () => blocker, invalidate }));
  const render = vi.fn(() => ok());

  gate.draw(render);
  gate.draw(render);
  gate.draw(render, { resized: true });
  expect(render).toHaveBeenCalledTimes(3);

  // An ordinary frame waits until fewer than two frames are unfinished.
  gate.draw(render);
  frames[0]!.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(invalidate).not.toHaveBeenCalled();
  frames[1]!.resolve();
  await vi.waitFor(() => expect(invalidate).toHaveBeenCalledOnce());

  blocker = new Promise(() => {});
  gate.draw(render, { resized: true });
  expect(render).toHaveBeenCalledTimes(3);
  gate.destroy();
});

it('does not turn a completed demand-driven draw into an endless animation', async () => {
  const invalidate = vi.fn();
  const gate = makeGpuFrameGate(options({ invalidate }));
  gate.draw(() => ok());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(invalidate).not.toHaveBeenCalled();
  gate.destroy();
});

it('ignores completion after disposal, including queued redraw requests', async () => {
  const work = deferred();
  const invalidate = vi.fn();
  const gate = makeGpuFrameGate(options({ complete: () => work.promise, invalidate }));
  const render = vi.fn(() => ok());
  gate.draw(render);
  gate.draw(render);
  gate.draw(render);
  gate.destroy();
  work.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  gate.draw(render);
  expect(invalidate).not.toHaveBeenCalled();
  expect(render).toHaveBeenCalledTimes(2);
});

it('reports a rejected GPU fence once and preserves typed draw failures', async () => {
  const failure = gpuError('render', 'bad draw');
  const complete = vi.fn(() => Promise.reject(new Error('lost device')));
  const fail = vi.fn();
  const gate = makeGpuFrameGate(options({ complete, fail }));
  expect(gate.draw(() => err(failure))).toEqual(err(failure));
  expect(complete).not.toHaveBeenCalled();
  gate.draw(() => ok());
  await vi.waitFor(() => expect(fail).toHaveBeenCalledOnce());
  expect(fail).toHaveBeenCalledWith(expect.objectContaining({ code: 'render', message: 'lost device' }));
  gate.draw(() => ok());
  expect(complete).toHaveBeenCalledOnce();
});

it('skips frames while unrelated work blocks submission, then redraws once', async () => {
  const preparation = deferred();
  const invalidate = vi.fn();
  let blocked: Promise<void> | undefined = preparation.promise;
  const gate = makeGpuFrameGate(options({ blocked: () => blocked, invalidate }));
  const render = vi.fn(() => ok());

  gate.draw(render);
  gate.draw(render);
  expect(render).not.toHaveBeenCalled();
  blocked = undefined;
  preparation.resolve();
  await vi.waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
  gate.draw(render);
  expect(render).toHaveBeenCalledOnce();
  gate.destroy();
});

/** Gate options that complete at once, never block and ignore failures, overridden per test. */
function options(overrides: Partial<Parameters<typeof makeGpuFrameGate>[0]>): Parameters<typeof makeGpuFrameGate>[0] {
  return { complete: async () => {}, blocked: () => undefined, invalidate: vi.fn(), fail: vi.fn(), ...overrides };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
