import type { GpuContext } from '@app-game/solid-gpu/gpu';
import tgpu, { d, std } from 'typegpu';
import { viewerPerformance } from '../telemetry/performance';
import type { View } from '../viewport/view';
import { tileTextureUpload, type DisplayTile } from './displayTiles';

/**
 * Displays authoritative straight RGBA8 bytes. No sRGB texture conversion is applied: filtering is explicitly
 * bilinear in premultiplied display-sRGB, with a one-source-texel halo. At >=1 physical pixel/source texel,
 * textureLoad preserves the original bytes. Coarse worker overviews remain point-sampled previews, not area mips.
 * Uploads stop after 2 MiB/2 ms per frame, with <=256 KiB source strips allowing one strip of overshoot. GPU residency is a
 * separate 128 MiB LRU. Geometry and texture bindings are retained; camera gestures never process resident pixels.
 */
export function makeGpuDisplay(gpu: Pick<GpuContext, 'root' | 'device' | 'format'>) {
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
  let bytes = 0;
  let destroyed = false;
  const timer = makeTimer(device);

  return {
    /** Reconciles immutable identities without copying bytes; unchanged tiles keep their GPU residency. */
    setTiles(next: readonly DisplayTile[]) {
      tiles = next;
    },
    /** Uploads a bounded batch, then renders once into an opaque viewport or an explicit readback target. */
    draw(view: View, width: number, height: number, dpr: number, target: GPUTextureView, raw = false) {
      const start = performance.now();
      let uploaded = 0;
      for (const tile of tiles) {
        if (!visible(tile, view, width / dpr, height / dpr)) {
          continue;
        }

        const key = identity(tile);
        let entry = resident.get(key);
        if (!entry) {
          entry = allocate(tile);
          resident.set(key, entry);
          bytes += entry.bytes;
        }

        while (!entry.ready) {
          uploaded += entry.upload();
          if (uploaded >= 2 * 1024 * 1024 || performance.now() - start >= 2) {
            break;
          }
        }

        if (uploaded >= 2 * 1024 * 1024 || performance.now() - start >= 2) {
          break;
        }
      }

      const active = new Set(tiles.map(identity));
      for (const [tile, entry] of resident) {
        if (bytes <= gpuBudgetBytes) {
          break;
        }

        if (!active.has(tile)) {
          entry.destroy();
          resident.delete(tile);
          bytes -= entry.bytes;
        }
      }

      camera.write({
        viewport: d.vec2f(width, height),
        translation: d.vec2f(view.x * dpr, view.y * dpr),
        scale: view.scale * dpr,
        dpr,
        raw: raw ? 1 : 0,
        padding: 0
      });
      const encoder = device.createCommandEncoder();
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
      for (const tile of tiles) {
        const entry = resident.get(identity(tile));
        if (entry?.ready && visible(tile, view, width / dpr, height / dpr)) {
          // Touch in draw order for LRU eviction; coarse ancestors draw before fine coverage.
          resident.delete(identity(tile));
          resident.set(identity(tile), entry);
          pipeline.with(pass).with(cameraGroup).with(entry.group).draw(4);
          drawn++;
        }
      }

      pass.end();
      timer.resolve(encoder, !!timing);
      device.queue.submit([encoder.finish()]);
      viewerPerformance.record('frame.prepare', start);
      if (drawn) {
        viewerPerformance.record('frame.pixels', start, drawn);
      }
      viewerPerformance.record('gpu.explicit.bytes', performance.now(), bytes);
      if (uploaded) {
        viewerPerformance.record('upload', start, uploaded);
      }

      timer.finish(start, () => destroyed);
      return tiles.some(
        (tile) => !resident.get(identity(tile))?.ready && visible(tile, view, width / dpr, height / dpr)
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
      camera.destroy();
      timer.destroy();
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
    const { clip, step } = tile;
    const upload = tileTextureUpload(tile);
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
      const bytesPerRow = upload.bytesPerRow;
      let source: Uint8Array<ArrayBuffer> | undefined = upload.source;
      let row = 0;
      return {
        group,
        bytes: width * height * 4 + 32,
        get ready() {
          return row === height;
        },
        upload() {
          const start = performance.now();
          // Bound the BufferSource snapshot, including skipped row bytes, to 256 KiB. Long-stride whole renders
          // use fewer rows than tightly packed worker regions. A frame can stop between any two strips.
          const rows = Math.min(height - row, Math.max(1, Math.floor((256 * 1024 - width * 4) / bytesPerRow) + 1));
          const offset = row * bytesPerRow;
          const length = (rows - 1) * bytesPerRow + width * 4;
          const strip = source!.subarray(offset, offset + length);
          device.queue.writeTexture(
            { texture: root.unwrap(texture), origin: { y: row } },
            strip,
            { bytesPerRow },
            { width, height: rows }
          );
          row += rows;
          if (row === height) {
            // GPU residency must not keep an evicted CPU tile's transferred buffer alive.
            source = undefined;
          }

          viewerPerformance.record('upload.texture', start, width * rows * 4);
          viewerPerformance.record('upload.source.bytes', performance.now(), length);
          return width * rows * 4;
        },
        destroy() {
          source = undefined;
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

const gpuBudgetBytes = 128 * 1024 * 1024;
