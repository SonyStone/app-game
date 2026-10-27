import type { GpuContext } from '@app-game/solid-gpu/gpu';
import tgpu, { d, std } from 'typegpu';
import type { makeGpuCompositor } from '../gpu-composite/makeGpuCompositor';
import { viewerPerformance } from '../telemetry/performance';
import type { View } from '../viewport/view';
import { displayTileLevels, tileTextureUpload, type DisplayTile } from './displayTiles';
import { makeUploadStaging } from './makeUploadStaging';

/**
 * Displays authoritative straight RGBA8 bytes. No sRGB texture conversion is applied: filtering is explicitly
 * bilinear in premultiplied display-sRGB, with a one-source-texel halo. At >=1 physical pixel/source texel,
 * textureLoad preserves the original bytes. Coarse worker overviews remain point-sampled previews, not area mips.
 * First pixels and progressive worker regions have 2.5 ms; subsequent whole-image uploads stop after 1 ms.
 * Second-frame visible arrivals finish their bounded tile before optional coverage.
 * The 8 MiB staging pool bounds each frame independently. Reusable mapped 64 KiB staging buffers pack only source rows, then
 * one encoder copies strips and draws. GPU residency, including the 8 MiB staging pool, has a
 * separate 128 MiB LRU. Geometry and texture bindings are retained; camera gestures never process resident pixels.
 */
export function makeGpuDisplay(
  gpu: Pick<GpuContext, 'root' | 'device' | 'format'>,
  gpuBudgetBytes = 128 * 1024 * 1024
) {
  if (!Number.isFinite(gpuBudgetBytes) || gpuBudgetBytes < 16 * 1024 * 1024) {
    throw new RangeError('GPU tile residency requires at least 16 MiB, including staging buffers.');
  }

  const initializing = performance.now();
  const { root, device, format } = gpu;
  const camera = root.createBuffer(Camera).$usage('uniform');
  const cameraGroup = root.createBindGroup(cameraLayout, { camera });
  const background = root.createRenderPipeline({
    vertex: backgroundVertex,
    fragment: backgroundFragment,
    targets: { format }
  });
  const pipeline = root.createRenderPipeline({
    vertex: tileVertex,
    fragment: tileFragment,
    targets: { format },
    primitive: { topology: 'triangle-strip' }
  });
  const resident = new Map<symbol, ReturnType<typeof allocate>>();
  const identities = new WeakMap<DisplayTile, symbol>();
  let tiles: readonly DisplayTile[] = [];
  let levels: ReturnType<typeof displayTileLevels> = [];
  let bytes = 0;
  let destroyed = false;
  let frameNumber = 0;
  let submittedPixels = false;
  const firstVisible = new Map<symbol, number>();
  const arrivals = new WeakSet<object>();
  const arrivalTargets = new WeakMap<object, DisplayTile>();
  const timer = makeTimer(device);
  const staging = makeUploadStaging(device);
  let compositor: ReturnType<typeof makeGpuCompositor> | undefined;
  let compositorFactory: typeof makeGpuCompositor | undefined;
  let compositorLoading: Promise<void> | undefined;
  // TypeGPU resolves shaders and creates native pipelines lazily. Compile once in backend initialization so tile
  // arrival frames only prepare their own resources; record the cold setup cost separately rather than hiding it.
  root.unwrap(background);
  root.unwrap(pipeline);
  root.unwrap(cameraGroup);
  viewerPerformance.record('gpu.initialize', initializing);

  return {
    /** Reconciles immutable identities without copying bytes; unchanged tiles keep their GPU residency. */
    setTiles(next: readonly DisplayTile[], step = 1) {
      if (!compositorLoading && next.some((tile) => tile.gpu)) {
        const start = performance.now();
        compositorLoading = import('../gpu-composite/makeGpuCompositor')
          .then((module) => {
            if (!destroyed) {
              compositorFactory = module.makeGpuCompositor;
              viewerPerformance.record('composite.module', start);
            }
          })
          .catch((error: unknown) => {
            for (const tile of next) {
              tile.gpu?.onFailure(String(error));
            }
          });
      }
      const active = new Set(next.map(identity));
      for (const [key, entry] of resident) {
        if (!entry.ready && !active.has(key)) {
          entry.destroy();
          resident.delete(key);
          bytes -= entry.bytes;
        }
      }

      for (const key of firstVisible.keys()) {
        if (!active.has(key)) {
          firstVisible.delete(key);
        }
      }

      tiles = next;
      levels = displayTileLevels(next, step);
      if (!next.length) {
        submittedPixels = false;
      }
    },
    /** Uploads a bounded batch, then renders once into an opaque viewport or an explicit readback target. */
    draw(view: View, width: number, height: number, dpr: number, target: GPUTextureView, raw = false) {
      const start = performance.now();
      frameNumber++;
      const uploadBudget = !submittedPixels || levels.some((group) => group.levels.length > 1) ? 2.5 : 1;
      for (const { coarse, requested } of levels) {
        if (
          requested.contentTile &&
          requested.arrival?.visible &&
          visible(requested, view, width / dpr, height / dpr)
        ) {
          if (!arrivals.has(requested.arrival)) {
            arrivals.add(requested.arrival);
            arrivalTargets.set(requested.arrival, requested);
          } else if (arrivalTargets.get(requested.arrival) !== requested) {
            // Changing demand before the first presentation ends that arrival's interest, rather than
            // charging a later cached refinement with all intervening camera frames.
            arrivalTargets.delete(requested.arrival);
          }
        }

        for (const tile of [coarse, requested]) {
          const key = identity(tile);
          if (!visible(tile, view, width / dpr, height / dpr)) {
            firstVisible.delete(key);
          } else if (!firstVisible.has(key) || resident.get(key)?.ready) {
            firstVisible.set(key, frameNumber);
          }
        }
      }

      let uploaded = 0;
      let blocked = false;
      const encoder = device.createCommandEncoder();
      // Fill holes before refinement. Old visible arrivals own the next frame's upload slot, so a cold
      // allocation or a short first-frame budget cannot defer them a third time.
      const uploads = [...new Set([...levels.map((group) => group.coarse), ...levels.map((group) => group.requested)])];
      uploads.sort(
        (a, b) => (firstVisible.get(identity(a)) ?? frameNumber) - (firstVisible.get(identity(b)) ?? frameNumber)
      );
      for (const tile of uploads) {
        if (tile.gpu && !compositorFactory) {
          continue;
        }
        if (!visible(tile, view, width / dpr, height / dpr)) {
          continue;
        }

        const key = identity(tile);
        const due =
          !!tile.contentTile &&
          !!tile.arrival?.visible &&
          !tile.arrival.presented &&
          frameNumber - (firstVisible.get(key) ?? frameNumber) >= 1;
        let entry = resident.get(key);
        if (!entry) {
          // Leave headroom for one native allocation; an individual GPU call cannot be time-sliced.
          if (!due && performance.now() - start >= uploadBudget - 0.4) {
            continue;
          }

          const upload = textureUpload(tile);
          const required = upload.width * upload.height * 4 + 32;
          const active = new Set(tiles.map(identity));
          for (const [old, resource] of resident) {
            if (bytes + required + staging.bytes + 32 + timer.bytes <= gpuBudgetBytes) {
              break;
            }

            if (!active.has(old)) {
              resource.destroy();
              resident.delete(old);
              bytes -= resource.bytes;
            }
          }

          if (bytes + required + staging.bytes + 32 + timer.bytes > gpuBudgetBytes) {
            break;
          }

          const allocating = performance.now();
          entry = allocate(tile);
          viewerPerformance.record('upload.allocate', allocating);
          resident.set(key, entry);
          bytes += entry.bytes;
        }

        while (!entry.ready) {
          const copied = entry.upload(encoder);
          if (!copied) {
            blocked = true;
            break;
          }

          uploaded += copied;
          if (!due && performance.now() - start >= uploadBudget) {
            break;
          }
        }

        if (blocked) {
          break;
        }
      }

      viewerPerformance.record('upload.prepare', start);
      const active = new Set(tiles.map(identity));
      for (const [tile, entry] of resident) {
        if (bytes + staging.bytes <= gpuBudgetBytes) {
          break;
        }

        if (!active.has(tile)) {
          entry.destroy();
          resident.delete(tile);
          bytes -= entry.bytes;
        }
      }

      const encoding = performance.now();
      camera.write({
        viewport: d.vec2f(width, height),
        translation: d.vec2f(view.x * dpr, view.y * dpr),
        scale: view.scale * dpr,
        dpr,
        raw: raw ? 1 : 0,
        padding: 0
      });
      const timing = timer.begin();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: raw ? 0 : 1 } }
        ],
        ...(timing ? { timestampWrites: timing } : {})
      });
      if (!raw) {
        background.with(pass).with(cameraGroup).draw(3);
      }

      let drawn = 0;
      for (const group of levels) {
        const tile =
          group.levels.find((tile) => tile.step <= group.requested.step && resident.get(identity(tile))?.ready) ??
          [...group.levels].reverse().find((tile) => resident.get(identity(tile))?.ready);
        if (!tile) {
          continue;
        }

        const entry = resident.get(identity(tile));
        if (entry?.ready && visible(tile, view, width / dpr, height / dpr)) {
          // Touch in draw order for LRU eviction; coarse ancestors draw before fine coverage.
          resident.delete(identity(tile));
          resident.set(identity(tile), entry);
          pipeline.with(pass).with(cameraGroup).with(entry.group).draw(4);
          const arrival = tile.arrival && arrivalTargets.get(tile.arrival) === tile;
          if (entry.present(frameNumber, firstVisible.get(identity(tile)), !!arrival) && arrival) {
            tile.arrival!.presented = true;
            arrivalTargets.delete(tile.arrival!);
          }
          drawn++;
        }
      }

      pass.end();
      timer.resolve(encoder, !!timing);
      viewerPerformance.record('frame.encode', encoding);
      const submitting = performance.now();
      device.queue.submit([encoder.finish()]);
      viewerPerformance.record('frame.submit', submitting);
      const mapping = performance.now();
      staging.submit();
      compositor?.submitted();
      viewerPerformance.record('upload.remapRequest', mapping);
      viewerPerformance.record('frame.prepare', start);
      if (drawn) {
        submittedPixels = true;
        viewerPerformance.record('frame.pixels', start, drawn);
      }
      viewerPerformance.record(
        'gpu.pending.bytes',
        performance.now(),
        [...resident.values()].filter((entry) => !entry.ready).reduce((sum, entry) => sum + entry.bytes, 0)
      );
      viewerPerformance.record(
        'upload.pending.cpu.bytes',
        performance.now(),
        [...resident.values()].reduce((sum, entry) => sum + entry.pendingSourceBytes, 0)
      );
      viewerPerformance.record('gpu.explicit.bytes', performance.now(), bytes + staging.bytes + 32 + timer.bytes);
      if (uploaded) {
        viewerPerformance.record('upload', start, uploaded);
      }

      timer.finish(start, () => destroyed);
      return levels.some(
        ({ requested: tile }) => !resident.get(identity(tile))?.ready && visible(tile, view, width / dpr, height / dpr)
      );
    },
    /** Releases textures, tile uniforms and timing buffers before the device scope closes. */
    destroy() {
      destroyed = true;
      for (const entry of resident.values()) {
        entry.destroy();
      }

      resident.clear();
      tiles = [];
      levels = [];
      firstVisible.clear();
      camera.destroy();
      timer.destroy();
      staging.destroy();
      compositor?.destroy();
    }
  };

  /** Weak identities let GPU residency outlive CPU eviction without retaining transferred pixel buffers. */
  function identity(tile: DisplayTile) {
    let key = identities.get(tile);
    if (!key) {
      key = Symbol();
      identities.set(tile, key);
    }

    return key;
  }

  function allocate(tile: DisplayTile) {
    const { clip, step, contentTile } = tile;
    let candidate = tile.gpu;
    const gpuCandidate = !!candidate;
    const upload = textureUpload(tile);
    const { width, height } = upload;
    const texture = root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('sampled');
    const region = root
      .createBuffer(Region, {
        clip: d.vec4f(clip.left, clip.top, clip.width, clip.height),
        origin: d.vec2f(upload.left, upload.top),
        step,
        padding: 0
      })
      .$usage('uniform');
    try {
      const group = root.createBindGroup(tileLayout, { source: texture.createView(), region });
      // Binding creation is lazy in TypeGPU. Materialize it inside upload admission, rather than charging
      // an uncapped first-draw allocation after the strip budget has already been exhausted.
      root.unwrap(group);
      const bytesPerRow = upload.bytesPerRow;
      let source: Uint8Array<ArrayBuffer> | undefined = upload.source;
      let sourceWords =
        source.byteOffset % 4 === 0
          ? new Uint32Array(source.buffer, source.byteOffset, source.byteLength / 4)
          : undefined;
      let row = 0;
      let presented = false;
      return {
        group,
        present(frame: number, firstFrame: number | undefined, arrival: boolean) {
          if (!presented) {
            if (gpuCandidate) {
              viewerPerformance.record('composite.preview.presented');
            }
            viewerPerformance.record(
              contentTile ? (arrival ? 'tile.visible.frames' : 'tile.refinement.frames') : 'imageChunk.visible.frames',
              performance.now(),
              frame - (firstFrame ?? frame) + 1
            );
            presented = true;
            return true;
          }

          return false;
        },
        bytes: width * height * 4 + 32,
        get pendingSourceBytes() {
          return source?.buffer.byteLength ?? 0;
        },
        get ready() {
          return row === height;
        },
        upload(encoder: GPUCommandEncoder) {
          if (candidate) {
            compositor ??= compositorFactory!(device);
            const work = candidate;
            candidate = undefined;
            const encoded = compositor.encode(work, encoder, root.unwrap(texture));
            // A refusal is replaced by the already pending strict worker; do not spin another compute each frame.
            row = height;
            source = undefined;
            sourceWords = undefined;
            return encoded ? width * height * 4 : 1;
          }
          const start = performance.now();
          const slot = staging.acquire();
          if (!slot) {
            return 0;
          }

          const stride = Math.ceil((width * 4) / 256) * 256;
          const rows = Math.min(height - row, Math.floor(staging.capacity / stride));
          // Per-row subarray views created enough garbage to stall inside the upload loop. Retain one aligned
          // word view for the source and each mapped slot, then copy without allocating a view for every row.
          if (sourceWords) {
            const input = sourceWords;
            const output = slot.words;
            for (let y = 0; y < rows; y++) {
              const from = ((row + y) * bytesPerRow) / 4;
              const to = (y * stride) / 4;
              for (let x = 0; x < width; x++) {
                output[to + x] = input[from + x];
              }
            }
          } else {
            for (let y = 0; y < rows; y++) {
              const from = (row + y) * bytesPerRow;
              const to = y * stride;
              for (let x = 0; x < width * 4; x++) {
                slot.view[to + x] = source![from + x];
              }
            }
          }

          slot.unmap();
          encoder.copyBufferToTexture(
            { buffer: slot.buffer, bytesPerRow: stride },
            { texture: root.unwrap(texture), origin: { y: row } },
            { width, height: rows }
          );
          row += rows;
          if (row === height) {
            // GPU residency must not keep an evicted CPU tile's transferred buffer alive.
            source = undefined;
            sourceWords = undefined;
          }

          viewerPerformance.record('upload.texture', start, width * rows * 4);
          viewerPerformance.record('upload.source.bytes', performance.now(), width * rows * 4);
          return width * rows * 4;
        },
        destroy() {
          candidate = undefined;
          source = undefined;
          sourceWords = undefined;
          texture.destroy();
          region.destroy();
        }
      };
    } catch (error) {
      texture.destroy();
      region.destroy();
      throw error;
    }
  }
}

/** CPU culling touches geometry only; no resident pixel work is performed during camera gestures. */
function visible(tile: DisplayTile, view: View, width: number, height: number) {
  const clip = tile.clip;
  return (
    (clip.left + clip.width) * view.scale + view.x > 0 &&
    clip.left * view.scale + view.x < width &&
    (clip.top + clip.height) * view.scale + view.y > 0 &&
    clip.top * view.scale + view.y < height
  );
}

const Camera = d.struct({
  viewport: d.vec2f,
  translation: d.vec2f,
  scale: d.f32,
  dpr: d.f32,
  raw: d.u32,
  padding: d.u32
});
const cameraLayout = tgpu.bindGroupLayout({ camera: { uniform: Camera } });
const Region = d.struct({ clip: d.vec4f, origin: d.vec2f, step: d.f32, padding: d.f32 });
const tileLayout = tgpu.bindGroupLayout({ source: { texture: d.texture2d(d.f32) }, region: { uniform: Region } });

const tileVertex = tgpu.vertexFn({ in: { index: d.builtin.vertexIndex }, out: { position: d.builtin.position } })((
  input
) => {
  'use gpu';
  const corner = d.vec2f(d.f32(input.index & 1), d.f32(input.index >> 1));
  const region = tileLayout.$.region;
  const camera = cameraLayout.$.camera;
  const document = std.add(region.clip.xy, std.mul(corner, region.clip.zw));
  const screen = std.add(std.mul(document, camera.scale), camera.translation);
  const ndc = std.sub(std.mul(std.div(screen, camera.viewport), 2), d.vec2f(1));
  return { position: d.vec4f(ndc.x, -ndc.y, 0, 1) };
});

const backgroundVertex = tgpu.vertexFn({ in: { index: d.builtin.vertexIndex }, out: { position: d.builtin.position } })(
  (input) => {
    'use gpu';
    const corner = d.vec2f(d.f32((input.index << 1) & 2), d.f32(input.index & 2));
    return { position: d.vec4f(std.sub(std.mul(corner, 2), d.vec2f(1)), 0, 1) };
  }
);

const checker = (position: d.v2f) => {
  'use gpu';
  const cell = std.floor(std.div(position, 8 * cameraLayout.$.camera.dpr));
  return std.select(d.f32(48 / 255), d.f32(60 / 255), d.u32(cell.x + cell.y) % 2 === 0);
};
const backgroundFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  return d.vec4f(d.vec3f(checker(input.position.xy)), 1);
});

const load = (position: d.v2f) => {
  'use gpu';
  const dimensions = d.vec2i(std.textureDimensions(tileLayout.$.source));
  const coordinate = std.clamp(d.vec2i(std.floor(position)), d.vec2i(0), std.sub(dimensions, d.vec2i(1)));
  return std.textureLoad(tileLayout.$.source, coordinate, 0);
};
const premultiply = (color: d.v4f) => {
  'use gpu';
  return d.vec4f(std.mul(color.rgb, color.a), color.a);
};
const tileFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const camera = cameraLayout.$.camera;
  const region = tileLayout.$.region;
  const document = std.div(std.sub(input.position.xy, camera.translation), camera.scale);
  const pixel = std.div(std.sub(document, region.origin), region.step);
  const original = load(pixel);
  if (camera.raw === 1) {
    return d.vec4f(original);
  }

  let color = premultiply(original);
  if (camera.scale * region.step < 1) {
    const position = std.sub(pixel, d.vec2f(0.5));
    const base = std.floor(position);
    const fraction = std.fract(position);
    const a = premultiply(load(base));
    const b = premultiply(load(std.add(base, d.vec2f(1, 0))));
    const c = premultiply(load(std.add(base, d.vec2f(0, 1))));
    const e = premultiply(load(std.add(base, d.vec2f(1, 1))));
    color = std.mix(std.mix(a, b, fraction.x), std.mix(c, e, fraction.x), fraction.y);
  }

  return d.vec4f(std.add(color.rgb, d.vec3f(checker(input.position.xy) * (1 - color.a))), 1);
});

/** Timestamp queries and queue-completion latency are separate diagnostics; mapping never blocks rendering. */
function makeTimer(device: GPUDevice) {
  const supported = device.features.has('timestamp-query');
  const query = supported ? device.createQuerySet({ type: 'timestamp', count: 2 }) : undefined;
  const resolve = query
    ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })
    : undefined;
  const read = query
    ? device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    : undefined;
  let busy = false;
  let measuring = false;
  return {
    bytes: query ? 32 : 0,
    begin(): GPURenderPassTimestampWrites | undefined {
      measuring = !!query && !busy;
      return measuring ? { querySet: query!, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } : undefined;
    },
    resolve(encoder: GPUCommandEncoder, measured: boolean) {
      if (measured) {
        encoder.resolveQuerySet(query!, 0, 2, resolve!, 0);
        encoder.copyBufferToBuffer(resolve!, 0, read!, 0, 16);
      }
    },
    finish(start: number, destroyed: () => boolean) {
      if (busy) {
        return;
      }

      busy = true;
      const measured = measuring;
      void device.queue
        .onSubmittedWorkDone()
        .then(async () => {
          if (destroyed()) {
            return;
          }

          viewerPerformance.record('gpu.queueCompletion', start);
          if (measured) {
            await read!.mapAsync(GPUMapMode.READ);
            const values = new BigUint64Array(read!.getMappedRange());
            viewerPerformance.record('gpu.timestamp.ms', performance.now(), Number(values[1] - values[0]) / 1e6);
            read!.unmap();
          }
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    },
    destroy() {
      query?.destroy();
      resolve?.destroy();
      read?.destroy();
    }
  };
}

/** GPU candidates have no host composite pixels; their full bordered output is written by compute. */
function textureUpload(tile: DisplayTile) {
  if (tile.gpu) {
    return {
      source: new Uint8Array(0),
      bytesPerRow: tile.image.width * 4,
      width: tile.image.width,
      height: tile.image.height,
      left: tile.left,
      top: tile.top
    };
  }
  return tileTextureUpload(tile);
}
