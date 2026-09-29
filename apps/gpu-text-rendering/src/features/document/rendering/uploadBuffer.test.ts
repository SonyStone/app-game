import { err, ok } from 'neverthrow';
import { beforeEach, expect, it, vi } from 'vitest';
import type { GpuContext } from '../../../shared/gpu/context';
import { uploadBuffer } from './uploadBuffer';
import { yieldToEventLoop } from './yieldToEventLoop';

vi.mock('./yieldToEventLoop', () => ({ yieldToEventLoop: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('yields between bounded writes and uploads the final partial chunk exactly once', async () => {
  const state = setup();
  const source = new ArrayBuffer(4 * 1024 * 1024 + 12);
  const pending = uploadBuffer(state.gpu, state.destination, source);
  expect(state.write).toHaveBeenCalledTimes(1);
  state.jobs.shift()!();
  await pending;
  expect(state.write.mock.calls.map((call) => call.slice(1))).toEqual([
    [0, source, 0, 4 * 1024 * 1024],
    [4 * 1024 * 1024, source, 4 * 1024 * 1024, 12]
  ]);
  expect(yieldToEventLoop).toHaveBeenCalledOnce();
});

it('uploads a source range without copying or reading neighboring records', async () => {
  const state = setup();
  const source = new ArrayBuffer(112);
  await uploadBuffer(state.gpu, state.destination, source, 28, 56);
  expect(state.write).toHaveBeenCalledExactlyOnceWith(state.destination, 0, source, 28, 56);
});

it('does not write to a destroyed renderer after yielding', async () => {
  const state = setup();
  const pending = uploadBuffer(state.gpu, state.destination, new ArrayBuffer(8 * 1024 * 1024));
  const rejected = expect(pending).rejects.toThrow('cancelled');
  state.active.mockReturnValue(err({ kind: 'gpu', code: 'destroyed', message: 'cancelled' }));
  state.jobs.shift()!();
  await rejected;
  expect(state.write).toHaveBeenCalledTimes(1);
});

function setup() {
  const jobs: (() => void)[] = [];
  vi.mocked(yieldToEventLoop).mockImplementation(() => new Promise<void>((resolve) => jobs.push(resolve)));
  const write = vi.fn();
  const active = vi.fn<GpuContext['checkActive']>(() => ok(undefined));
  const gpu = { device: { queue: { writeBuffer: write } }, checkActive: active } as unknown as GpuContext;
  return { jobs, write, active, gpu, destination: {} as GPUBuffer };
}
