import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { gpuFrameTimer } from './gpuFrameTimer';

// The test environment has no WebGPU constants.
beforeAll(() => {
  vi.stubGlobal('GPUBufferUsage', { QUERY_RESOLVE: 0x200, COPY_SRC: 4, COPY_DST: 8, MAP_READ: 1 });
  vi.stubGlobal('GPUMapMode', { READ: 1 });
});
afterAll(() => vi.unstubAllGlobals());

/** A device double whose readback buffers hold `stamps`, the nanosecond timestamps the next frame resolves. */
function timedDevice(features: string[] = ['timestamp-query']) {
  const stamps: bigint[] = [];
  const encoder = { resolveQuerySet: vi.fn(), copyBufferToBuffer: vi.fn() } as unknown as GPUCommandEncoder;
  const device = {
    features: new Set(features),
    createQuerySet: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({
      mapAsync: vi.fn(async () => {}),
      getMappedRange: () => new BigInt64Array(stamps).buffer,
      unmap: vi.fn()
    }))
  } as unknown as GPUDevice;

  return { device, encoder, stamps };
}

it('sums the durations of the passes counted between begin and finish', async () => {
  const { device, encoder, stamps } = timedDevice();
  const timer = gpuFrameTimer(device);

  expect(timer.supported).toBe(true);
  expect(timer.pass()).toEqual({});

  timer.begin(0);
  const first = timer.pass().timestampWrites!;
  const second = timer.pass().timestampWrites!;
  expect([first.beginningOfPassWriteIndex, first.endOfPassWriteIndex]).toEqual([0, 1]);
  expect([second.beginningOfPassWriteIndex, second.endOfPassWriteIndex]).toEqual([2, 3]);

  stamps.push(1_000_000n, 4_000_000n, 4_000_000n, 4_500_000n);
  const cost = timer.finish(encoder);

  expect(encoder.resolveQuerySet).toHaveBeenCalledWith(first.querySet, 0, 4, expect.anything(), 0);
  expect(await cost).toEqual({ ms: 3.5, passMs: [3, 0.5], sequence: 0 });
  expect(timer.pass()).toEqual({});
});

it('shares one timer per device and counts frames drawn back to back', async () => {
  const { device, encoder } = timedDevice();
  const timer = gpuFrameTimer(device);

  expect(gpuFrameTimer(device)).toBe(timer);
  expect(timer.begin(1000)).toBe(0);
  timer.finish(encoder);
  expect(timer.begin(1016)).toBe(1);
  expect(timer.begin(1033)).toBe(2);
  // A pause lets the GPU go idle: the next frame is the first again.
  expect(timer.begin(1300)).toBe(0);
});

it('resolves the cost of the frame being drawn to whoever asks during it', async () => {
  const { device, encoder, stamps } = timedDevice();
  const timer = gpuFrameTimer(device);

  timer.begin(0);
  timer.pass();
  const during = timer.cost();
  stamps.push(0n, 2_000_000n);
  timer.finish(encoder);

  expect(await during).toMatchObject({ ms: 2 });
  // Until the next frame begins, the latest frame's cost stays available.
  expect(await timer.cost()).toMatchObject({ ms: 2 });

  // A frame abandoned without finishing is never measured.
  timer.begin(16);
  const abandoned = timer.cost();
  timer.begin(32);
  expect(await abandoned).toBeUndefined();
});

it('measures nothing without timestamp queries or counted passes', async () => {
  const { device, encoder } = timedDevice([]);
  const timer = gpuFrameTimer(device);

  expect(timer.supported).toBe(false);
  expect(timer.begin(0)).toBe(0);
  expect(timer.pass()).toEqual({});
  expect(await timer.finish(encoder)).toBeUndefined();
  expect(device.createQuerySet).not.toHaveBeenCalled();

  const timed = timedDevice();
  const empty = gpuFrameTimer(timed.device);
  empty.begin(0);
  expect(await empty.finish(timed.encoder)).toBeUndefined();
  expect(timed.encoder.resolveQuerySet).not.toHaveBeenCalled();
});
