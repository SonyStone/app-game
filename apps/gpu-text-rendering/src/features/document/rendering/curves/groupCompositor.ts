import tgpu, { common, d, std, type TgpuBindGroup } from 'typegpu';
import type { GpuContext } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import { blendColor } from './blendColor';
import type { PixelRect } from './paintBounds';
import type { PaintNode } from './paintTree';

/** Composes PDF transparency groups, including inherited backdrops, knockout shapes and soft masks. */
export function createGroupCompositor(gpu: GpuContext, keep: KeepGpuResource) {
  const { root, device, format } = gpu;
  const sampler = root.createSampler({ minFilter: 'nearest', magFilter: 'nearest' });
  let surfaces: ReturnType<typeof makeSurface>[] = [];
  const pools = new Map<string, ReturnType<typeof makeSurface>[]>();
  const outputParameters: ReturnType<typeof makeOutputParameters>[] = [];
  let pairs = new Map<string, TgpuBindGroup>();
  let combined: ReturnType<typeof makeSurface> | undefined;
  let nextSurfaceId = 0;
  let width = 0;
  let height = 0;
  let targetWidth = 0;
  let targetHeight = 0;
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
      pools.forEach((pool) => pool.forEach((surface) => surface.texture.destroy()));
      combined?.texture.destroy();
    }
  });

  return {
    get resourceBytes() {
      return (
        [...pools.values()].reduce((sum, pool) => sum + pool.reduce((bytes, surface) => bytes + surface.bytes, 0), 0) +
        (combined?.bytes ?? 0)
      );
    },
    /** Encodes independent offscreen work before the scene submits its shared output pass. */
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
      if (!combined || targetWidth !== size.width || targetHeight !== size.height) {
        combined?.texture.destroy();
        targetWidth = size.width;
        targetHeight = size.height;
        combined = makeSurface(targetWidth, targetHeight);
      }

      const encoder = device.createCommandEncoder();
      const full = { x: 0, y: 0, width: targetWidth, height: targetHeight };
      begin(combined, true, full).end();
      const used = new Set<string>();
      let originX = 0;
      let originY = 0;

      for (const [index, nodes] of pages.entries()) {
        originX = originY = 0;
        width = targetWidth;
        height = targetHeight;
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
        used.add(key);
        surfaces = pools.get(key) ?? [];
        pools.set(key, surfaces);
        preparePage(index, rect, width, height);
        const empty = surface(0);
        begin(empty, true, { x: 0, y: 0, width, height }).end();
        const output = render(nodes, 0);
        const settings = (outputParameters[index] ??= makeOutputParameters());
        settings.buffer.write([rect.x, rect.y]);
        const accumulation = begin(combined, false, rect);
        placedCopy.with(accumulation).with(output.sample).with(settings.group).draw(3);
        accumulation.end();
      }

      device.queue.submit([encoder.finish()]);
      background(pass);
      copy.with(pass).with(combined.sample).draw(3);

      for (const [key, pool] of pools) {
        if (!used.has(key)) {
          pool.forEach((surface) => surface.texture.destroy());
          pools.delete(key);
          pairs.clear();
        }
      }

      function render(
        items: PaintNode[],
        depth: number,
        backdrop?: ReturnType<typeof makeSurface>,
        knockout = false,
        shapeOnly = false
      ) {
        const empty = surface(0);
        const firstSurface = 1 + depth * 4;
        let target = surface(firstSurface);
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
          if (node.blend === 2 || node.blend === 3 || !localBounds(node)) {
            continue;
          }

          if (!knockout && !('children' in node) && node.blend === 0) {
            paint(outputPass, node);
            continue;
          }

          outputPass.end();
          const groupBackdrop = knockout ? (backdrop ?? empty) : target;
          const child =
            'children' in node
              ? render(node.children, depth + 1, node.isolated ? undefined : groupBackdrop, node.knockout)
              : render([{ ...node, blend: 0 }], depth + 1);
          const shape = knockout
            ? render('children' in node ? node.children : [node], depth + 2, undefined, false, true)
            : empty;
          const destination = surface(firstSurface + (target === surface(firstSurface) ? 1 : 0));
          const opacity = 'children' in node ? node.opacity : 1;
          const settings = settingsFor(opacity, node.blend, knockout ? 2 : 0);
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
          target = destination;
          outputPass = begin(target, false, rect);
        }

        outputPass.end();

        if (backdrop) {
          // Alpha accumulation is independent of RGB blend functions. Recover the group's
          // contribution before applying its own mask/opacity, without counting the backdrop twice.
          const alpha = render(
            items.filter((node) => node.blend !== 2 && node.blend !== 3),
            depth + 1,
            undefined,
            knockout
          );
          const extracted = surface(firstSurface + 3);
          const extractPass = begin(extracted, true, rect);
          composite
            .with(extractPass)
            .with(groupFor(target, backdrop, alpha, empty))
            .with(settingsFor(1, 0, 1))
            .draw(3);
          extractPass.end();
          target = extracted;
        }

        const mask = items.find((node) => node.blend === 2 || node.blend === 3);

        if (mask && 'children' in mask) {
          const maskSurface = render(mask.children, depth + 1);
          const destination = surface(firstSurface + 2);
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
          target = destination;
        }

        return target;
      }

      function paintShapes(items: PaintNode[], pass: GPURenderPassEncoder) {
        for (const node of items) {
          if (node.blend === 2 || node.blend === 3) {
            continue;
          }

          if ('children' in node) {
            paintShapes(node.children, pass);
          } else {
            paint(pass, node, true);
          }
        }
      }

      function begin(target: ReturnType<typeof makeSurface>, clear: boolean, rect: PixelRect) {
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

  function makeOutputParameters() {
    const buffer = keep(root.createBuffer(d.vec2f)).$usage('uniform');
    return { buffer, group: root.createBindGroup(placementLayout, { origin: buffer }) };
  }

  function settingsFor(opacity: number, blend: number, operation: number) {
    const key = `${opacity}:${blend}:${operation}`;
    let settings = parameters.get(key);

    if (!settings) {
      settings = makeParameters(opacity, blend, 0, undefined, operation);
      parameters.set(key, settings);
    }

    return settings;
  }

  function groupFor(
    source: ReturnType<typeof makeSurface>,
    backdrop: ReturnType<typeof makeSurface>,
    coverage: ReturnType<typeof makeSurface>,
    initial: ReturnType<typeof makeSurface>
  ) {
    const key = `${source.id}:${backdrop.id}:${coverage.id}:${initial.id}`;
    let group = pairs.get(key);

    if (!group) {
      group = root.createBindGroup(compositeLayout, {
        source: source.sampleView,
        backdrop: backdrop.sampleView,
        coverage: coverage.sampleView,
        initial: initial.sampleView,
        sampler
      });
      pairs.set(key, group);
    }

    return group;
  }

  function surface(index: number) {
    return surfaces[index] ?? (surfaces[index] = makeSurface());
  }

  function makeSurface(w = width, h = height) {
    const texture = root.createTexture({ size: [w, h], format }).$usage('sampled', 'render');
    const sampleView = texture.createView();
    return {
      id: nextSurfaceId++,
      bytes: w * h * 4,
      texture,
      sampleView,
      view: root.unwrap(texture).createView(),
      sample: root.createBindGroup(copyLayout, { source: sampleView, sampler })
    };
  }

  function makeParameters(opacity: number, blend: number, background = 0, transfer?: Float32Array, operation = 0) {
    const values = keep(root.createBuffer(d.vec4f, d.vec4f(opacity, blend, background, operation))).$usage('uniform');
    const samples = transfer
      ? keep(root.createBuffer(d.arrayOf(d.f32, 256), transfer)).$usage('storage')
      : identityTransfer;
    return root.createBindGroup(parameterLayout, { values, transfer: samples });
  }
}

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

  if (parameterLayout.$.values.w === 1) {
    return d.vec4f(
      std.clamp(std.sub(source.rgb, std.mul(backdrop.rgb, 1 - coverage)), d.vec3f(0), d.vec3f(coverage)),
      coverage
    );
  }

  if (parameterLayout.$.values.w === 2) {
    backdrop = d.vec4f(initial);
  }
  if (parameterLayout.$.values.y === 2) {
    return std.mul(source, maskValue(backdrop.a));
  }

  if (parameterLayout.$.values.y === 3) {
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

  if (parameterLayout.$.values.w === 2) {
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
