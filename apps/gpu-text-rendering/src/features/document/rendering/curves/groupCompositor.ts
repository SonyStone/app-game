import tgpu, { common, d, std, type TgpuBindGroup } from 'typegpu';
import type { GpuContext } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import { blendColor } from './blendColor';
import type { PixelRect } from './paintBounds';
import { alphaMaskBlend, isMask, luminosityMaskBlend, type PaintNode } from './paintTree';

/**
 * Composes PDF transparency groups, including inherited backdrops, knockout shapes and soft masks.
 *
 * Scratch surfaces are recycled through a per-size free stack, so one page needs at most one surface per
 * active group nesting level plus five (the shared empty surface and one composite's operands). Pools of
 * other sizes survive short gaps and are destroyed after `idleFrames` draws or beyond `idlePoolLimit`.
 * Uniform buffers are kept until the owning document's GPU resources are destroyed.
 */
export function createGroupCompositor(gpu: GpuContext, keep: KeepGpuResource) {
  const { root, device, format } = gpu;
  const sampler = root.createSampler({ minFilter: 'nearest', magFilter: 'nearest' });
  type Surface = ReturnType<typeof makeSurface>;
  /** Scratch surfaces of one quantized size; `free` is a stack, so each frame reuses surfaces in the same order. */
  type Pool = { surfaces: Surface[]; free: Surface[]; empty: Surface; usedAt: number };
  const pools = new Map<string, Pool>();
  const outputs = new Map<string, { surface: Surface; usedAt: number }>();
  const outputParameters: ReturnType<typeof makeOutputParameters>[] = [];
  const pairs = new Map<string, { group: TgpuBindGroup; surfaces: number[] }>();
  let pool: Pool | undefined;
  let clock = 0;
  let nextSurfaceId = 0;
  let width = 0;
  let height = 0;
  const identityTransfer = keep(
    root.createBuffer(
      d.arrayOf(d.f32, 256),
      Float32Array.from({ length: 256 }, (_, index) => index / 255)
    )
  ).$usage('storage');
  const maskParameters = new WeakMap<PaintNode, ReturnType<typeof makeParameters>>();
  const parameters = new Map<string, ReturnType<typeof makeParameters>>();
  const composite = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: compositeFragment,
    targets: { format }
  });
  const placedCopy = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: placedCopyFragment,
    targets: {
      format,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      }
    }
  });
  const copy = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: copyFragment,
    targets: {
      format,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      }
    }
  });

  keep({
    destroy() {
      pools.forEach((pool) => [pool.empty, ...pool.surfaces].forEach((surface) => surface.texture.destroy()));
      outputs.forEach(({ surface }) => surface.texture.destroy());
    }
  });

  return {
    /** Bytes held by retained scratch and output surfaces; uniform buffers are excluded. */
    get resourceBytes() {
      let bytes = 0;
      pools.forEach((pool) => [pool.empty, ...pool.surfaces].forEach((surface) => (bytes += surface.bytes)));
      outputs.forEach(({ surface }) => (bytes += surface.bytes));
      return bytes;
    },
    /**
     * Encodes independent offscreen work before the scene submits its shared output pass.
     *
     * @param pass Scene pass that receives the background followed by the composed pages.
     * @param size Output size in physical pixels.
     * @param pages Paint trees of the pages to compose, in draw order.
     * @param bounds Screen-space bounds of a node, or `undefined` when it is not visible.
     * @param preparePage Called before a page renders with its page index, visible screen region and
     *   quantized scratch size; paint callbacks then draw relative to that region.
     * @param background Paints behind all composed pages into `pass`.
     * @param paint Draws one leaf into the given scratch pass; `shapeOnly` requests knockout shape coverage.
     */
    draw(
      pass: GPURenderPassEncoder,
      size: { width: number; height: number },
      pages: PaintNode[][],
      bounds: (node: PaintNode) => PixelRect | undefined,
      preparePage: (index: number, region: PixelRect, width: number, height: number) => void,
      background: (pass: GPURenderPassEncoder) => void,
      paint: (
        pass: GPURenderPassEncoder,
        node: Exclude<PaintNode, { children: PaintNode[] }>,
        shapeOnly?: boolean
      ) => void
    ) {
      clock++;
      const outputKey = `${size.width}:${size.height}`;
      const output = outputs.get(outputKey) ?? { surface: makeSurface(size.width, size.height), usedAt: clock };
      output.usedAt = clock;
      outputs.set(outputKey, output);
      const combined = output.surface;
      const encoder = device.createCommandEncoder();
      begin(combined, true, { x: 0, y: 0, width: size.width, height: size.height }).end();
      let originX = 0;
      let originY = 0;

      for (const [index, nodes] of pages.entries()) {
        originX = originY = 0;
        width = size.width;
        height = size.height;
        const rect = region(nodes);

        if (!rect) {
          continue;
        }

        // Quantized scratch sizes prevent allocation churn while keeping small pages small.
        width = Math.ceil(rect.width / 64) * 64;
        height = Math.ceil(rect.height / 64) * 64;
        originX = rect.x;
        originY = rect.y;
        const key = `${width}:${height}`;
        pool = pools.get(key) ?? makePool(width, height);
        pools.set(key, pool);
        pool.usedAt = clock;
        pool.free = pool.surfaces.slice().reverse();
        preparePage(index, rect, width, height);
        begin(pool.empty, true, { x: 0, y: 0, width, height }).end();
        const page = render(nodes);
        const settings = (outputParameters[index] ??= makeOutputParameters());
        settings.buffer.write([rect.x, rect.y]);
        const accumulation = begin(combined, false, rect);
        placedCopy.with(accumulation).with(page.sample).with(settings.group).draw(3);
        accumulation.end();
        release(page);
      }

      device.queue.submit([encoder.finish()]);
      background(pass);
      copy.with(pass).with(combined.sample).draw(3);
      evictIdle(pools, (pool) => [pool.empty, ...pool.surfaces]);
      evictIdle(outputs, ({ surface }) => [surface]);

      /**
       * Renders `items` into a newly acquired surface that the caller must release.
       * `backdrop` is borrowed; `alphaOnly` renders descendants as isolated because only alpha is consumed.
       */
      function render(
        items: PaintNode[],
        backdrop?: Surface,
        knockout = false,
        shapeOnly = false,
        alphaOnly = false
      ): Surface {
        const empty = pool!.empty;
        let target = acquire();
        const rect = region(items) ?? { x: 0, y: 0, width: 1, height: 1 };
        let outputPass = begin(target, true, rect);

        if (backdrop) {
          copy.with(outputPass).with(backdrop.sample).draw(3);
        }

        if (shapeOnly) {
          paintShapes(items, outputPass);
          outputPass.end();
          return target;
        }

        for (const node of items) {
          if (isMask(node) || !localBounds(node)) {
            continue;
          }

          if (!knockout && !('children' in node) && node.blend === 0) {
            paint(outputPass, node);
            continue;
          }

          outputPass.end();
          const groupBackdrop = knockout ? (backdrop ?? empty) : target;
          // A group's alpha does not depend on backdrop colour (PDF 11.3), so alpha passes skip
          // nested backdrop removal; otherwise every non-isolated level would double the work.
          const child =
            'children' in node
              ? render(
                  node.children,
                  node.isolated || alphaOnly ? undefined : groupBackdrop,
                  node.knockout,
                  false,
                  alphaOnly
                )
              : render([{ ...node, blend: 0 }]);
          const shape = knockout ? render('children' in node ? node.children : [node], undefined, false, true) : empty;
          const destination = acquire();
          const opacity = 'children' in node ? node.opacity : 1;
          const settings = settingsFor(opacity, node.blend, knockout ? knockoutOperation : blendOperation);
          const compositePass = begin(destination, true, rect);
          // Preserve the parent's pixels outside this group's affected region.
          copy.with(compositePass).with(target.sample).draw(3);
          const affected = localBounds(node)!;
          compositePass.setScissorRect(affected.x, affected.y, affected.width, affected.height);
          composite
            .with(compositePass)
            .with(groupFor(child, target, shape, groupBackdrop))
            .with(settings)
            .draw(3);
          compositePass.end();
          release(child);

          if (shape !== empty) {
            release(shape);
          }

          release(target);
          target = destination;
          outputPass = begin(target, false, rect);
        }

        outputPass.end();

        if (backdrop) {
          // Alpha accumulation is independent of RGB blend functions. Recover the group's
          // contribution before applying its own mask/opacity, without counting the backdrop twice.
          const alpha = render(
            items.filter((node) => !isMask(node)),
            undefined,
            knockout,
            false,
            true
          );
          const extracted = acquire();
          const extractPass = begin(extracted, true, rect);
          composite
            .with(extractPass)
            .with(groupFor(target, backdrop, alpha, empty))
            .with(settingsFor(1, 0, removeBackdropOperation))
            .draw(3);
          extractPass.end();
          release(alpha);
          release(target);
          target = extracted;
        }

        const mask = items.find(isMask);

        if (mask && 'children' in mask) {
          const maskSurface = render(mask.children);
          const destination = acquire();
          let settings = maskParameters.get(mask);

          if (!settings) {
            settings = makeParameters(1, mask.blend, mask.opacity, mask.transfer);
            maskParameters.set(mask, settings);
          }

          const maskedPass = begin(destination, true, rect);
          composite
            .with(maskedPass)
            .with(groupFor(target, maskSurface, empty, empty))
            .with(settings)
            .draw(3);
          maskedPass.end();
          release(maskSurface);
          release(target);
          target = destination;
        }

        return target;
      }

      function paintShapes(items: PaintNode[], pass: GPURenderPassEncoder) {
        for (const node of items) {
          if (isMask(node)) {
            continue;
          }

          if ('children' in node) {
            paintShapes(node.children, pass);
          } else {
            paint(pass, node, true);
          }
        }
      }

      function begin(target: Surface, clear: boolean, rect: PixelRect) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            { view: target.view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] }
          ]
        });
        pass.setScissorRect(rect.x, rect.y, rect.width, rect.height);
        return pass;
      }

      function localBounds(node: PaintNode): PixelRect | undefined {
        const value = bounds(node);

        if (!value) {
          return undefined;
        }

        const x = Math.max(0, value.x - originX);
        const y = Math.max(0, value.y - originY);
        const right = Math.min(width, value.x + value.width - originX);
        const bottom = Math.min(height, value.y + value.height - originY);
        return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
      }

      function region(items: PaintNode[]): PixelRect | undefined {
        let left = width;
        let top = height;
        let right = 0;
        let bottom = 0;

        for (const node of items) {
          const rect = localBounds(node);

          if (rect) {
            left = Math.min(left, rect.x);
            top = Math.min(top, rect.y);
            right = Math.max(right, rect.x + rect.width);
            bottom = Math.max(bottom, rect.y + rect.height);
          }
        }

        return right > left && bottom > top
          ? { x: left, y: top, width: right - left, height: bottom - top }
          : undefined;
      }
    }
  };

  /** Takes a scratch surface of the current page size; its contents are undefined until cleared. */
  function acquire() {
    const current = pool!;
    const reused = current.free.pop();

    if (reused) {
      return reused;
    }

    const surface = makeSurface(current.empty.width, current.empty.height);
    current.surfaces.push(surface);
    return surface;
  }

  /** Returns a surface for later passes of the same encoder; the caller must not sample it afterwards. */
  function release(surface: Surface) {
    pool!.free.push(surface);
  }

  function makePool(w: number, h: number): Pool {
    const empty = makeSurface(w, h);
    return { surfaces: [], free: [], empty, usedAt: clock };
  }

  /**
   * Destroys entries unused for `idleFrames` draws, or beyond the `idlePoolLimit` most recent idle ones,
   * and forgets only the bind groups that reference their surfaces.
   */
  function evictIdle<T extends { usedAt: number }>(entries: Map<string, T>, surfacesOf: (entry: T) => Surface[]) {
    const idle = [...entries].filter(([, entry]) => entry.usedAt !== clock).sort((a, b) => b[1].usedAt - a[1].usedAt);

    for (const [index, [key, entry]] of idle.entries()) {
      if (index < idlePoolLimit && clock - entry.usedAt <= idleFrames) {
        continue;
      }

      const destroyed = new Set<number>();

      for (const surface of surfacesOf(entry)) {
        surface.texture.destroy();
        destroyed.add(surface.id);
      }

      entries.delete(key);

      for (const [pairKey, pair] of pairs) {
        if (pair.surfaces.some((id) => destroyed.has(id))) {
          pairs.delete(pairKey);
        }
      }
    }
  }

  function makeOutputParameters() {
    const buffer = keep(root.createBuffer(d.vec2f)).$usage('uniform');
    return { buffer, group: root.createBindGroup(placementLayout, { origin: buffer }) };
  }

  /** Cached per distinct opacity/blend/operation; buffers live until the document's resources are destroyed. */
  function settingsFor(opacity: number, blend: number, operation: number) {
    const key = `${opacity}:${blend}:${operation}`;
    let settings = parameters.get(key);

    if (!settings) {
      settings = makeParameters(opacity, blend, 0, undefined, operation);
      parameters.set(key, settings);
    }

    return settings;
  }

  function groupFor(source: Surface, backdrop: Surface, coverage: Surface, initial: Surface) {
    const surfaces = [source.id, backdrop.id, coverage.id, initial.id];
    const key = surfaces.join(':');
    let pair = pairs.get(key);

    if (!pair) {
      pair = {
        surfaces,
        group: root.createBindGroup(compositeLayout, {
          source: source.sampleView,
          backdrop: backdrop.sampleView,
          coverage: coverage.sampleView,
          initial: initial.sampleView,
          sampler
        })
      };
      pairs.set(key, pair);
    }

    return pair.group;
  }

  function makeSurface(w: number, h: number) {
    const texture = root.createTexture({ size: [w, h], format }).$usage('sampled', 'render');
    const sampleView = texture.createView();
    return {
      id: nextSurfaceId++,
      width: w,
      height: h,
      bytes: w * h * 4,
      texture,
      sampleView,
      view: root.unwrap(texture).createView(),
      sample: root.createBindGroup(copyLayout, { source: sampleView, sampler })
    };
  }

  /**
   * Allocates composite settings. Mask nodes and setting keys are bounded by the document, so the
   * kept buffers are released with the compositor's owning document rather than per frame.
   */
  function makeParameters(
    opacity: number,
    blend: number,
    background = 0,
    transfer?: Float32Array,
    operation = blendOperation
  ) {
    const values = keep(root.createBuffer(d.vec4f, d.vec4f(opacity, blend, background, operation))).$usage('uniform');
    const samples = transfer
      ? keep(root.createBuffer(d.arrayOf(d.f32, 256), transfer)).$usage('storage')
      : identityTransfer;
    return root.createBindGroup(parameterLayout, { values, transfer: samples });
  }
}

/** Idle draws before an unused scratch-size pool or output surface is destroyed. */
const idleFrames = 120;
/** Most recently used idle pools retained per map, bounding memory during continuous zoom. */
const idlePoolLimit = 2;

/** Compositor operations stored in the settings' `w` component. */
const blendOperation = 0;
/** Removes the inherited backdrop from a non-isolated group's result using its isolated alpha. */
const removeBackdropOperation = 1;
/** Replaces earlier knockout-group siblings under the new object's shape. */
const knockoutOperation = 2;

const copyLayout = tgpu.bindGroupLayout({ source: { texture: d.texture2d(d.f32) }, sampler: { sampler: 'filtering' } });
const compositeLayout = tgpu.bindGroupLayout({
  source: { texture: d.texture2d(d.f32) },
  backdrop: { texture: d.texture2d(d.f32) },
  coverage: { texture: d.texture2d(d.f32) },
  initial: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' }
});
const parameterLayout = tgpu.bindGroupLayout({
  values: { uniform: d.vec4f },
  transfer: { storage: d.arrayOf(d.f32, 256) }
});

const copyFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  return std.textureSample(copyLayout.$.source, copyLayout.$.sampler, input.uv);
});

const compositeFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  const source = std.mul(
    std.textureSample(compositeLayout.$.source, compositeLayout.$.sampler, input.uv),
    parameterLayout.$.values.x
  );
  let backdrop = std.textureSample(compositeLayout.$.backdrop, compositeLayout.$.sampler, input.uv);
  const coverage = std.textureSample(compositeLayout.$.coverage, compositeLayout.$.sampler, input.uv).a;
  const initial = std.textureSample(compositeLayout.$.initial, compositeLayout.$.sampler, input.uv);
  const previous = d.vec4f(backdrop);

  if (parameterLayout.$.values.w === removeBackdropOperation) {
    return d.vec4f(
      std.clamp(std.sub(source.rgb, std.mul(backdrop.rgb, 1 - coverage)), d.vec3f(0), d.vec3f(coverage)),
      coverage
    );
  }

  if (parameterLayout.$.values.w === knockoutOperation) {
    backdrop = d.vec4f(initial);
  }
  if (parameterLayout.$.values.y === alphaMaskBlend) {
    return std.mul(source, maskValue(backdrop.a));
  }

  if (parameterLayout.$.values.y === luminosityMaskBlend) {
    const luminosity = std.dot(backdrop.rgb, d.vec3f(0.3, 0.59, 0.11)) + parameterLayout.$.values.z * (1 - backdrop.a);
    return std.mul(source, maskValue(luminosity));
  }

  let color = std.add(source.rgb, std.mul(backdrop.rgb, 1 - source.a));

  if (parameterLayout.$.values.y !== 0) {
    const sourceColor = std.div(source.rgb, std.max(source.a, 0.000001));
    const backdropColor = std.div(backdrop.rgb, std.max(backdrop.a, 0.000001));
    color = std.add(
      std.mul(blendColor(backdropColor, sourceColor, parameterLayout.$.values.y), source.a * backdrop.a),
      std.add(std.mul(source.rgb, 1 - backdrop.a), std.mul(backdrop.rgb, 1 - source.a))
    );
  }

  let result = d.vec4f(color, source.a + backdrop.a * (1 - source.a));

  if (parameterLayout.$.values.w === knockoutOperation) {
    result = std.add(result, std.mul(std.sub(previous, initial), 1 - coverage));
  }

  return result;
});

/** Evaluates the retained transfer function after extracting mask alpha or luminosity. */
function maskValue(value: number) {
  'use gpu';
  const position = std.clamp(value, 0, 1) * 255;
  const index = d.u32(position);
  return std.mix(
    parameterLayout.$.transfer[index]!,
    parameterLayout.$.transfer[std.min(index + 1, 255)]!,
    std.fract(position)
  );
}

const placementLayout = tgpu.bindGroupLayout({ origin: { uniform: d.vec2f } });

/** Copies a cropped page back to its physical-pixel position without resampling. */
const placedCopyFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  return std.textureLoad(copyLayout.$.source, d.vec2i(std.sub(input.position.xy, placementLayout.$.origin)), 0);
});
