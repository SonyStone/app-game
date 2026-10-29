import type { PsdGpuLayers } from '@app-game/psd/gpu';
import { viewerPerformance } from '../telemetry/performance';
import shader from './composite.wgsl?raw';
import tables from './integerTables.json';
import textTables from './textTables.json';

/** One immutable tile/settings/revision/visibility identity. Readback is background verification, never display input. */
export type GpuTileWork = {
  identity: string;
  sourceKey: string;
  source: PsdGpuLayers;
  visibility: readonly (readonly [number, boolean])[];
  groupVisibility: ReadonlyMap<number, boolean>;
  linearBlending: boolean;
  /** Test-only fault injection, opt-in through the experimental renderer. */
  forceMismatch?: boolean;
  /** Called after the preview command buffer is submitted, before asynchronous verification. */
  onSubmitted?: () => void;
  onReadback: (pixels: Uint8Array) => void;
  onFailure: (reason: string) => void;
};

/**
 * Integer compute with a 64 MiB LRU, including tables, isolated-group canvases and in-flight verification buffers.
 * The display reserves the other 64 MiB of the shared 128 MiB GPU allowance. Each source entry is a bounded layer region;
 * visibility changes rewrite only small uniforms. Navigation over resident output dispatches no compute/readback.
 */
export function makeGpuCompositor(device: GPUDevice, budgetBytes = 64 * 1024 * 1024) {
  const initializing = performance.now();
  const module = device.createShaderModule({ code: shader, label: 'PSD exact RGB8 integer compositor' });
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const tableBuffer = device.createBuffer({
    size: (tables.values.length + textTables.values.length) * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(tableBuffer, 0, new Int32Array([...tables.values, ...textTables.values]));
  const sources = new Map<string, { buffer: GPUBuffer; bytes: number }>();
  const protectedSources = new Set<string>();
  let sourceBytes = tableBuffer.size;
  let transientBytes = 0;
  let destroyed = false;
  let submitted: (() => void)[] = [];
  const live = new Set<() => void>();
  viewerPerformance.record('composite.initialize', initializing);

  function account() {
    viewerPerformance.record('composite.gpu.source.bytes', performance.now(), sourceBytes);
    viewerPerformance.record('composite.gpu.pending.bytes', performance.now(), transientBytes);
    viewerPerformance.record('composite.gpu.bytes', performance.now(), sourceBytes + transientBytes);
  }

  return {
    /** Encodes directly into a display texture; a refused preparation leaves strict CPU publication in charge. */
    encode(work: GpuTileWork, encoder: GPUCommandEncoder, target: GPUTexture): boolean {
      // Background maps retain callbacks and small GPU buffers, never the raw source arrays in work.
      const { onReadback, onFailure, onSubmitted } = work;
      if (destroyed) {
        onFailure('GPU device scope was released.');
        return false;
      }
      const started = performance.now();
      const { rect } = work.source;
      const stride = Math.ceil(rect.width / 64) * 64;
      const size = stride * rect.height * 4;
      const shown = new Map(work.visibility);
      const layers = work.source.layers.filter(
        (layer) =>
          (shown.get(layer.index) ?? layer.visible) &&
          layer.ancestors.every((index) => shown.get(index) ?? work.groupVisibility.get(index) ?? true)
      );
      const isolated = layers.filter((layer) => layer.isolated);
      const groupIds = new Set(isolated.map((layer) => layer.index));
      const parent = (layer: (typeof layers)[number]) => layer.ancestors.findLast((index) => groupIds.has(index));
      const operations: { layer: (typeof layers)[number]; operation: number; target?: number; input?: number }[] = [];
      function append(nodes: typeof layers, target?: number) {
        for (const layer of nodes) {
          if (layer.clipBase !== undefined) {
            continue;
          }
          if (layer.isolated) {
            append(
              layers.filter((child) => parent(child) === layer.index),
              layer.index
            );
            operations.push({ layer, operation: 4, target, input: layer.index });
            continue;
          }
          const clips = nodes.filter((clip) => clip.clipBase === layer.index);
          operations.push({ layer, operation: layer.adjustment ? 5 : clips.length ? 1 : 0, target });
          operations.push(...clips.map((layer) => ({ layer, operation: 2, target })));
          if (clips.length) {
            operations.push({ layer, operation: 3, target });
          }
        }
      }
      append(layers.filter((layer) => parent(layer) === undefined));
      const clipping = operations.some((op) => op.operation === 1);
      const scratchBytes = clipping ? size * 2 : 8;
      const uniformBytes = Math.max(256, operations.length * 256);
      const required = size * (2 + isolated.length) + scratchBytes + uniformBytes + 36;
      const keys = layers.map((layer) => `${work.sourceKey}:${layer.index}`);
      const newBytes = layers.reduce((sum, layer, i) => sum + (sources.has(keys[i]) ? 0 : layer.samples.byteLength), 0);
      const needed = new Set(keys);
      for (const [key, source] of sources) {
        if (sourceBytes + transientBytes + required + newBytes <= budgetBytes) {
          break;
        }
        if (!protectedSources.has(key) && !needed.has(key)) {
          source.buffer.destroy();
          sources.delete(key);
          sourceBytes -= source.bytes;
        }
      }
      if (sourceBytes + transientBytes + required + newBytes > budgetBytes) {
        onFailure('GPU layer-region cache budget exhausted.');
        return false;
      }

      const output = device.createBuffer({
        size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
      });
      const groupBuffers = new Map(
        isolated.map((layer) => [
          layer.index,
          device.createBuffer({
            size,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
          })
        ])
      );
      const emptyGroup = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE });
      const scratch = device.createBuffer({
        size: scratchBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      const read = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const params = device.createBuffer({
        size: uniformBytes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      const query = device.features.has('timestamp-query')
        ? device.createQuerySet({ type: 'timestamp', count: 2 })
        : undefined;
      const resolve = query
        ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })
        : undefined;
      const timing = query
        ? device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
        : undefined;
      transientBytes += required;
      let released = false;
      const release = () => {
        if (released) {
          return;
        }
        released = true;
        output.destroy();
        scratch.destroy();
        emptyGroup.destroy();
        for (const buffer of groupBuffers.values()) {
          buffer.destroy();
        }
        read.destroy();
        params.destroy();
        query?.destroy();
        resolve?.destroy();
        timing?.destroy();
        transientBytes -= required;
        live.delete(release);
        account();
      };
      live.add(release);
      const uniforms = new Int32Array(uniformBytes / 4);
      for (const [i, { layer, operation }] of operations.entries()) {
        uniforms.set(
          [
            rect.width,
            rect.height,
            stride,
            layer.textGamma ? 2 : work.linearBlending ? 1 : 0,
            layer.bounds.left - rect.left,
            layer.bounds.top - rect.top,
            layer.bounds.width,
            layer.bounds.height,
            layer.mode,
            layer.opacity,
            layer.fill,
            layer.density,
            operation,
            layer.staged ? 1 : 0,
            layer.adjustment ?? 0,
            layer.threshold ?? 0
          ],
          i * 64
        );
      }
      for (const [i, layer] of layers.entries()) {
        let source = sources.get(keys[i]);
        if (!source) {
          const buffer = device.createBuffer({
            size: layer.samples.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
          });
          device.queue.writeBuffer(buffer, 0, layer.samples);
          source = { buffer, bytes: layer.samples.byteLength };
          sources.set(keys[i], source);
          sourceBytes += source.bytes;
          viewerPerformance.record('composite.source.upload.bytes', performance.now(), source.bytes);
        }
        sources.delete(keys[i]);
        sources.set(keys[i], source);
        protectedSources.add(keys[i]);
      }
      device.queue.writeBuffer(params, 0, uniforms);
      encoder.clearBuffer(output);
      encoder.clearBuffer(scratch);
      for (const buffer of groupBuffers.values()) {
        encoder.clearBuffer(buffer);
      }
      const pass = encoder.beginComputePass(
        query ? { timestampWrites: { querySet: query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}
      );
      pass.setPipeline(pipeline);
      for (const [i, { layer, target: targetGroup, input }] of operations.entries()) {
        pass.setBindGroup(
          0,
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: sources.get(`${work.sourceKey}:${layer.index}`)!.buffer } },
              { binding: 1, resource: { buffer: targetGroup === undefined ? output : groupBuffers.get(targetGroup)! } },
              { binding: 2, resource: { buffer: params, offset: i * 256, size: 64 } },
              { binding: 3, resource: { buffer: tableBuffer } },
              { binding: 4, resource: { buffer: scratch } },
              { binding: 5, resource: { buffer: input === undefined ? emptyGroup : groupBuffers.get(input)! } }
            ]
          })
        );
        pass.dispatchWorkgroups(Math.ceil(layer.bounds.width / 8), Math.ceil(layer.bounds.height / 8));
      }
      pass.end();
      if (work.forceMismatch) {
        encoder.clearBuffer(output, 0, 4);
      }
      encoder.copyBufferToTexture(
        { buffer: output, bytesPerRow: stride * 4 },
        { texture: target },
        { width: rect.width, height: rect.height }
      );
      encoder.copyBufferToBuffer(output, 0, read, 0, size);
      if (query) {
        encoder.resolveQuerySet(query, 0, 2, resolve!, 0);
        encoder.copyBufferToBuffer(resolve!, 0, timing!, 0, 16);
      }
      submitted.push(() => {
        onSubmitted?.();
        void (async () => {
          try {
            await read.mapAsync(GPUMapMode.READ);
            if (destroyed) {
              return;
            }
            const mapped = new Uint8Array(read.getMappedRange());
            const pixels = new Uint8Array(rect.width * rect.height * 4);
            for (let y = 0; y < rect.height; y++) {
              pixels.set(mapped.subarray(y * stride * 4, y * stride * 4 + rect.width * 4), y * rect.width * 4);
            }
            read.unmap();
            onReadback(pixels);
            viewerPerformance.record('composite.readback', started);
            if (timing) {
              await timing.mapAsync(GPUMapMode.READ);
              const stamps = new BigUint64Array(timing.getMappedRange());
              viewerPerformance.record(
                'composite.timestamp.ms',
                performance.now(),
                Number(stamps[1] - stamps[0]) / 1e6
              );
              timing.unmap();
            }
          } catch (error) {
            if (!destroyed) {
              onFailure(String(error));
            }
          } finally {
            release();
          }
        })();
      });
      viewerPerformance.record('composite.encode', started);
      account();
      return true;
    },
    /** Starts background maps only after the display command buffer has been submitted. */
    submitted() {
      const jobs = submitted;
      submitted = [];
      protectedSources.clear();
      for (const job of jobs) {
        job();
      }
    },
    /** Device loss discards every source buffer; strict CPU tiles survive in the tile store. */
    destroy() {
      destroyed = true;
      submitted = [];
      for (const release of live) {
        release();
      }
      for (const source of sources.values()) {
        source.buffer.destroy();
      }
      sources.clear();
      tableBuffer.destroy();
      sourceBytes = 0;
      account();
    }
  };
}
