import { createMemo } from 'solid-js';
import tgpu, { d } from 'typegpu';
import { createGpuResource } from '../../shared/gpu/createGpuResource';
import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import { useSceneSpace } from '../camera/SceneSpace';
import { createUniform } from '../scene/createUniform';
import { RenderLayer } from '../scene/RenderLayer';

/**
 * Draws many same-colored rectangles in the nearest SceneSpace with one instanced draw. Use it instead of
 * one Rectangle per item for large or data-driven sets. Replacing `items` rewrites the instance buffer,
 * reallocating it only when the count changes. Items do not receive pointer events.
 */
export function Rectangles(props: {
  /** Rectangles in SceneSpace units. Width and height may be negative. */
  items: readonly { x: number; y: number; width: number; height: number }[];
  /** Straight RGBA components in the range 0–1. */
  color: readonly [number, number, number, number];
  /** Painter order, default 0. */
  order?: number;
  /** Hides the rectangles while retaining their GPU resources. Default true. */
  visible?: boolean;
}) {
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
      color: d.vec4f(...props.color)
    };
  });

  const count = createMemo(() => props.items.length);
  const group = createMemo(() => {
    const instances = createGpuResource(() =>
      root.createBuffer(d.arrayOf(d.vec4f, Math.max(1, count()))).$usage('storage')
    );

    return { instances, bindGroup: root.createBindGroup(rectanglesLayout, { transform, instances }) };
  });

  const pipeline = root.createRenderPipeline({
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

  let written: { items: typeof props.items; buffer: unknown } | undefined;

  return (
    <RenderLayer
      order={props.order}
      visible={props.visible}
      draw={({ pass }) => {
        const { items } = props;
        const { instances, bindGroup } = group();

        if (items.length === 0) {
          return;
        }

        // Upload only after a replacement; the draw's reads of items and group request the frame that uploads.
        if (written?.items !== items || written.buffer !== instances) {
          instances.write(items.map(({ x, y, width, height }) => d.vec4f(x, y, width, height)));
          written = { items, buffer: instances };
        }

        pipeline.with(pass).with(bindGroup).draw(4, items.length);
      }}
    />
  );
}

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
