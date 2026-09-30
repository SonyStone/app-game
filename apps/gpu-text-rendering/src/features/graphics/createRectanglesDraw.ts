import { createGpuResource, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { createMemo, type Accessor } from 'solid-js';
import tgpu, { d, type TgpuRoot } from 'typegpu';
import { createUniform } from '../scene/createUniform';
import { useFrame } from '../scene/FrameLoop';
import type { SceneDraw } from '../scene/renderScene';
import { useSceneSpace } from '../scene/SceneSpace';

/**
 * Owns an instanced draw of same-colored rectangles in the nearest SceneSpace beneath FrameLoop: a transform
 * uniform and an instance buffer, destroyed with the caller's owner, and a pipeline shared per root. Replaced items
 * upload in the render phase before layers draw; the instance buffer is reallocated only when the count changes.
 * Returns the draw for a RenderLayer.
 */
export function createRectanglesDraw(
  /** Rectangles in SceneSpace units. Width and height may be negative. */
  items: Accessor<readonly { x: number; y: number; width: number; height: number }[]>,
  /** Straight RGBA components in the range 0–1. */
  color: Accessor<readonly [number, number, number, number]>
): SceneDraw {
  const { root, format } = useGpuCanvas();
  const space = useSceneSpace();

  // SceneSpace projections are affine, so three projected points describe the whole transform.
  const transform = createUniform(RectanglesUniform, () => {
    const origin = space.toClip({ x: 0, y: 0 });
    const x = space.toClip({ x: 1, y: 0 });
    const y = space.toClip({ x: 0, y: 1 });

    return {
      origin: d.vec2f(origin.x, origin.y),
      axisX: d.vec2f(x.x - origin.x, x.y - origin.y),
      axisY: d.vec2f(y.x - origin.x, y.y - origin.y),
      color: d.vec4f(...color())
    };
  });

  const count = createMemo(() => items().length);
  const group = createMemo(() => {
    const instances = createGpuResource(() =>
      root.createBuffer(d.arrayOf(d.vec4f, Math.max(1, count()))).$usage('storage')
    );

    return { instances, bindGroup: root.createBindGroup(rectanglesLayout, { transform, instances }) };
  });

  const pipeline = rectanglesPipeline(root, format);
  let written: { items: readonly unknown[]; instances: unknown } | undefined;

  // Upload only after a replacement; reading items and group here requests the frame that uploads them.
  useFrame(() => {
    const current = items();
    const { instances } = group();

    if (current.length > 0 && (written?.items !== current || written.instances !== instances)) {
      instances.write(current.map(({ x, y, width, height }) => d.vec4f(x, y, width, height)));
      written = { items: current, instances };
    }
  });

  return ({ pass }) => {
    if (count() > 0) {
      pipeline.with(pass).with(group().bindGroup).draw(4, count());
    }
  };
}

/** Returns this root's rectangle pipeline for `format`, creating it on first use. */
function rectanglesPipeline(root: TgpuRoot, format: GPUTextureFormat) {
  const cache = pipelines.get(root) ?? new Map<GPUTextureFormat, ReturnType<typeof createRectanglesPipeline>>();
  const pipeline = cache.get(format) ?? createRectanglesPipeline(root, format);

  cache.set(format, pipeline);
  pipelines.set(root, cache);

  return pipeline;
}

function createRectanglesPipeline(root: TgpuRoot, format: GPUTextureFormat) {
  return root.createRenderPipeline({
    vertex: rectanglesVertex,
    fragment: rectanglesFragment,
    primitive: { topology: 'triangle-strip' },
    targets: {
      format,
      blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      }
    }
  });
}

/** Pipelines hold no destroyable resources and live as long as their root. */
const pipelines = new WeakMap<TgpuRoot, Map<GPUTextureFormat, ReturnType<typeof createRectanglesPipeline>>>();

const RectanglesUniform = d.struct({ origin: d.vec2f, axisX: d.vec2f, axisY: d.vec2f, color: d.vec4f });

const rectanglesLayout = tgpu.bindGroupLayout({
  transform: { uniform: RectanglesUniform },
  instances: { storage: d.arrayOf(d.vec4f), access: 'readonly' }
});

const rectanglesVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
  out: { position: d.builtin.position }
})(({ index, instance }) => {
  'use gpu';
  const transform = rectanglesLayout.$.transform;
  const rect = rectanglesLayout.$.instances[instance]!;
  const x = rect.x + rect.z * d.f32(index & 1);
  const y = rect.y + rect.w * d.f32(index >> 1);
  const position = transform.origin.add(transform.axisX.mul(x)).add(transform.axisY.mul(y));

  return { position: d.vec4f(position, 0, 1) };
});

const rectanglesFragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
  'use gpu';
  return d.vec4f(rectanglesLayout.$.transform.color);
});
