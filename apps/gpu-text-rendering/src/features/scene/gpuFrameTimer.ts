/**
 * The device's frame timer, shared by every canvas and renderer on it. It measures how long the GPU spends executing a
 * frame's render passes, with timestamp queries where the device has `timestamp-query`. The time from submission until
 * `onSubmittedWorkDone` is no substitute: it also waits for presentation, several milliseconds on any device and more
 * than a display interval on some, however little the frame drew.
 *
 * A frame loop brackets each frame with `begin` and `finish`; whatever records a render pass for that frame meanwhile,
 * such as an offscreen compositor, adds `pass()` to its descriptor to be counted. Frames are recorded synchronously and
 * one at a time, so one open measurement serves every canvas.
 */
export function gpuFrameTimer(device: GPUDevice) {
  let timer = timers.get(device);

  if (!timer) {
    timer = createTimer(device);
    timers.set(device, timer);
  }

  return timer;
}

const timers = new WeakMap<GPUDevice, ReturnType<typeof createTimer>>();

function createTimer(device: GPUDevice) {
  const supported = device.features.has('timestamp-query');
  let queries: { set: GPUQuerySet; resolved: GPUBuffer; idle: GPUBuffer[] } | undefined;
  /** Passes counted in the open measurement; undefined while none is open. */
  let passes: number | undefined;
  let sequence = 0;
  let beganAt = -Infinity;
  let cost: Promise<FrameCost | undefined> = Promise.resolve(undefined);
  let settle: (cost: FrameCost | undefined) => void = () => {};

  return {
    /** Whether frames are timed; without `timestamp-query` every cost resolves undefined. */
    supported,
    /**
     * Opens the measurement of a frame starting at `now` and returns how many frames the GPU drew back to back before
     * it: zero after a pause of {@link idleGapMs}, when mobile GPUs have lowered their clock and run several times
     * slower for the first frames. An unfinished earlier measurement is abandoned.
     */
    begin(now: number) {
      sequence = now - beganAt > idleGapMs ? 0 : sequence + 1;
      beganAt = now;
      settle(undefined);
      passes = 0;
      cost = new Promise((resolve) => {
        settle = resolve;
      });

      return sequence;
    },
    /**
     * Render pass descriptor fields that count the pass in the open measurement; empty when none is open, the device
     * cannot time passes, or the frame already has {@link maxPasses}.
     */
    pass(): Pick<GPURenderPassDescriptor, 'timestampWrites'> {
      if (!supported || passes === undefined || passes >= maxPasses) {
        return {};
      }

      const first = passes * 2;
      passes++;

      return {
        timestampWrites: { querySet: storage().set, beginningOfPassWriteIndex: first, endOfPassWriteIndex: first + 1 }
      };
    },
    /**
     * The open frame's cost, resolved after `finish` once the GPU has executed it: undefined when the device cannot
     * time passes or the frame is never finished. For renderers judging the frame they are drawing into.
     */
    cost: () => cost,
    /**
     * Closes the measurement by reading its queries back in `encoder`, which must be submitted after every counted
     * pass, and returns the frame's cost like {@link cost}.
     */
    finish(encoder: GPUCommandEncoder) {
      const counted = passes ?? 0;
      const resolve = settle;
      const result = cost;
      passes = undefined;
      settle = () => {};

      if (!supported || counted === 0) {
        resolve(undefined);
        return result;
      }

      const { set, resolved, idle } = storage();
      const bytes = counted * 16;
      const readback =
        idle.pop() ??
        device.createBuffer({ size: maxPasses * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      encoder.resolveQuerySet(set, 0, counted * 2, resolved, 0);
      encoder.copyBufferToBuffer(resolved, 0, readback, 0, bytes);
      const frame = { sequence };

      // Mapping resolves after the copy executed; a lost device rejects, which leaves the frame unmeasured.
      queueMicrotask(() => {
        readback.mapAsync(GPUMapMode.READ, 0, bytes).then(
          () => {
            const stamps = new BigInt64Array(readback.getMappedRange(0, bytes));
            const passMs = Array.from({ length: counted }, (_, index) =>
              Math.max(0, Number(stamps[index * 2 + 1]! - stamps[index * 2]!) / 1e6)
            );
            readback.unmap();
            idle.push(readback);
            resolve({ ...frame, passMs, ms: passMs.reduce((total, ms) => total + ms, 0) });
          },
          () => resolve(undefined)
        );
      });

      return result;
    }
  };

  function storage() {
    queries ??= {
      set: device.createQuerySet({ type: 'timestamp', count: maxPasses * 2 }),
      resolved: device.createBuffer({
        size: maxPasses * 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
      }),
      idle: []
    };

    return queries;
  }
}

/** GPU execution time of one frame's counted render passes. */
export type FrameCost = {
  /** Milliseconds summed over the counted passes. */
  ms: number;
  /** Milliseconds of each counted pass, in the order they were begun. */
  passMs: number[];
  /** Frames drawn back to back before this one, as returned by `begin`. */
  sequence: number;
};

/**
 * GPU time a frame may take for 60 frames per second: the rest of the interval belongs to the browser's compositor
 * and to variation between frames.
 */
export const gpuFrameBudgetMs = 13;

/**
 * Frames after idle whose cost says little about the device. A mobile GPU lowers its clock within a fraction of a
 * second without work, then raises it over about eight frames of full load, and more slowly under lighter load;
 * meanwhile the same frame costs up to three times more.
 */
export const warmupFrames = 12;

/** A pause after which the next frame counts as the first after idle. */
const idleGapMs = 100;
/** Most passes counted per frame; later ones go unmeasured. Heavy transparency pages take a few dozen. */
const maxPasses = 256;
