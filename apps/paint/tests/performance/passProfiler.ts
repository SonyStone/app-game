/**
 * GPU time per render and compute pass, grouped by the source line that opened it, for engines running on this page's
 * thread. `installPassProfiler()` must run before the engine requests its device: it adds `timestamp-query` to every
 * device request, gives each pass `timestampWrites`, resolves the queries after each submission and sums the durations
 * per call site (the first stack frame in `packages/`, `apps/paint/src` or `tests/`). Copies and uploads are counted per
 * call site too, without timing. A measurement tool only: resolving queries adds submissions of its own, and browsers
 * may quantize timestamps (Chrome to 100 µs without its WebGPU developer features), so read sums over many passes.
 */
export function installPassProfiler() {
  const sites = new Map<string, { passes: number; gpuNs: number }>();
  const transfers = new Map<string, { count: number; bytes: number }>();
  /** Queries of passes encoded but not yet submitted, by the encoder or command buffer that holds them. */
  const pending = new WeakMap<object, Recorded[]>();
  let warning: string | undefined;
  /** Query sets ready for reuse, and how many exist. */
  const free: GPUQuerySet[] = [];
  let created = 0;

  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = function (descriptor?: GPUDeviceDescriptor) {
    if (!this.features.has('timestamp-query')) {
      warning = 'This adapter has no timestamp-query; passes are counted without GPU time.';
      return requestDevice.call(this, descriptor);
    }

    const requiredFeatures = [...(descriptor?.requiredFeatures ?? []), 'timestamp-query' as const];
    return requestDevice.call(this, { ...descriptor, requiredFeatures });
  };

  for (const kind of ['beginRenderPass', 'beginComputePass'] as const) {
    const begin = GPUCommandEncoder.prototype[kind] as (this: GPUCommandEncoder, descriptor?: object) => unknown;
    (GPUCommandEncoder.prototype as unknown as Record<string, unknown>)[kind] = function (
      this: GPUCommandEncoder,
      descriptor: { timestampWrites?: unknown } = {}
    ) {
      const device = devices.get(this);
      if (!device || descriptor.timestampWrites || !device.features.has('timestamp-query')) {
        count(caller(), sites, (entry) => entry.passes++);
        return begin.call(this, descriptor);
      }

      const recorded = record(device, this);
      if (!recorded) {
        count(caller(), sites, (entry) => entry.passes++);
        return begin.call(this, descriptor);
      }

      return begin.call(this, {
        ...descriptor,
        timestampWrites: {
          querySet: recorded.set,
          beginningOfPassWriteIndex: recorded.index,
          endOfPassWriteIndex: recorded.index + 1
        }
      });
    };
  }

  // Encoders do not expose their device, so remember it when they are created.
  const devices = new WeakMap<GPUCommandEncoder, GPUDevice>();
  const createCommandEncoder = GPUDevice.prototype.createCommandEncoder;
  GPUDevice.prototype.createCommandEncoder = function (descriptor?: GPUCommandEncoderDescriptor) {
    const encoder = createCommandEncoder.call(this, descriptor);
    devices.set(encoder, this);
    return encoder;
  };

  const finish = GPUCommandEncoder.prototype.finish;
  GPUCommandEncoder.prototype.finish = function (descriptor?: GPUCommandBufferDescriptor) {
    const buffer = finish.call(this, descriptor);
    const recorded = pending.get(this);
    if (recorded) {
      pending.delete(this);
      pending.set(buffer, recorded);
    }

    return buffer;
  };

  const submit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (buffers: Iterable<GPUCommandBuffer>) {
    const list = [...buffers];
    submit.call(this, list);
    const recorded = list.flatMap((buffer) => pending.get(buffer) ?? []);
    if (recorded.length) {
      resolve(this, recorded);
    }
  };

  for (const name of ['copyTextureToTexture', 'copyBufferToTexture', 'copyTextureToBuffer'] as const) {
    const copy = GPUCommandEncoder.prototype[name] as (this: GPUCommandEncoder, ...args: unknown[]) => void;
    (GPUCommandEncoder.prototype as unknown as Record<string, unknown>)[name] = function (
      this: GPUCommandEncoder,
      ...args: unknown[]
    ) {
      const size = args[2] as number[] | { width: number; height?: number };
      const pixels = Array.isArray(size) ? size[0]! * (size[1] ?? 1) : size.width * (size.height ?? 1);
      count(`${name} ${caller()}`, transfers, (entry) => {
        entry.count++;
        entry.bytes += pixels;
      });
      return copy.apply(this, args);
    };
  }

  const writeTexture = GPUQueue.prototype.writeTexture;
  GPUQueue.prototype.writeTexture = function (...args: Parameters<GPUQueue['writeTexture']>) {
    const size = args[3] as number[] | { width: number; height?: number };
    const pixels = Array.isArray(size) ? size[0]! * (size[1] ?? 1) : size.width * (size.height ?? 1);
    count(`writeTexture ${caller()}`, transfers, (entry) => {
      entry.count++;
      entry.bytes += pixels;
    });
    return writeTexture.apply(this, args);
  };

  return {
    /** Passes and GPU milliseconds per call site, and transfer counts, since installation or the last reset. */
    report() {
      return {
        warning,
        passes: Object.fromEntries(
          [...sites]
            .sort((a, b) => b[1].gpuNs - a[1].gpuNs)
            .map(([site, { passes, gpuNs }]) => [site, { passes, gpuMs: Math.round(gpuNs / 1e4) / 100 }])
        ),
        transfers: Object.fromEntries([...transfers].sort((a, b) => b[1].count - a[1].count))
      };
    },
    reset() {
      sites.clear();
      transfers.clear();
    },
    /** Waits for every submitted query to be read back. */
    settled: () => Promise.all([...reading])
  };

  /**
   * Reserves a query pair for a pass on `encoder`; each encoder fills query sets of its own, taken from a small pool
   * (Metal allows few). Returns `undefined`, so the pass is counted without time, while every set is in use.
   */
  function record(device: GPUDevice, encoder: GPUCommandEncoder) {
    let list = pending.get(encoder);
    if (!list) {
      list = [];
      pending.set(encoder, list);
    }

    const last = list.at(-1);
    let set = last && last.index + 2 < querySetSize ? last.set : undefined;
    if (!set) {
      set =
        free.pop() ??
        (created < querySets
          ? (created++, device.createQuerySet({ type: 'timestamp', count: querySetSize }))
          : undefined);
      if (!set) {
        return undefined;
      }
    }

    const index = last && set === last.set ? last.index + 2 : 0;
    const entry = { set, index, site: caller(), device };
    list.push(entry);
    return entry;
  }

  /** Copies the queries of submitted passes into a mappable buffer and adds their durations once it maps. */
  function resolve(queue: GPUQueue, recorded: Recorded[]) {
    const device = recorded[0]!.device;
    const groups = new Map<GPUQuerySet, Recorded[]>();
    for (const entry of recorded) {
      groups.set(entry.set, [...(groups.get(entry.set) ?? []), entry]);
    }

    for (const [set, entries] of groups) {
      const queries = entries.at(-1)!.index + 2;
      const resolved = device.createBuffer({
        size: queries * 8,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
      });
      const readable = device.createBuffer({
        size: queries * 8,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      });
      const encoder = createCommandEncoder.call(device);
      encoder.resolveQuerySet(set, 0, queries, resolved, 0);
      encoder.copyBufferToBuffer(resolved, 0, readable, 0, queries * 8);
      submit.call(queue, [finish.call(encoder)]);
      const read = readable
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const times = new BigUint64Array(readable.getMappedRange());
          for (const entry of entries) {
            const duration = Number(times[entry.index + 1]! - times[entry.index]!);
            count(entry.site, sites, (site) => {
              site.passes++;
              // Unwritten or reordered timestamps would be negative or absurd; count the pass without time.
              site.gpuNs += duration > 0 && duration < 1e9 ? duration : 0;
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          readable.destroy();
          resolved.destroy();
          free.push(set);
          reading.delete(read);
        });
      reading.add(read);
    }
  }
}

/** One pass's timestamp pair in a query set. */
type Recorded = { set: GPUQuerySet; index: number; site: string; device: GPUDevice };

/** Queries per set: 512 passes. */
const querySetSize = 1024;

/** Query sets per page. */
const querySets = 8;

const reading = new Set<Promise<unknown>>();

function count<T extends object>(key: string, map: Map<string, T>, update: (entry: T) => void, initial?: () => T) {
  let entry = map.get(key);
  if (!entry) {
    entry = initial?.() ?? ({ passes: 0, gpuNs: 0, count: 0, bytes: 0 } as unknown as T);
    map.set(key, entry);
  }

  update(entry);
}

/** `file:line` of the first stack frame in this repository's sources outside the profiler and TypeGPU. */
function caller() {
  const frames = (new Error().stack ?? '').split('\n').slice(2);
  for (const frame of frames) {
    const match = /\/((?:packages|apps\/paint\/src|tests)\/[^?:)]+)(?:\?[^:)]*)?:(\d+)/.exec(frame);
    if (match && !match[1]!.includes('passProfiler')) {
      return `${match[1]!.replace(/^packages\//, '')}:${match[2]}`;
    }
  }

  return 'other';
}
