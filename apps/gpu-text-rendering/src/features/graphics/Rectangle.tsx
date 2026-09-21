import { makeEventListener } from '@solid-primitives/event-listener';
import { Result } from 'neverthrow';
import { createEffect, onCleanup } from 'solid-js';
import tgpu, { d } from 'typegpu';
import { errorMessage, gpuError } from '../../shared/errors';
import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import { createGpuResources } from '../../shared/gpu/resources';
import { useSceneSpace } from '../camera/SceneSpace';
import { useFrameLoop } from '../scene/FrameLoop';
import { RenderLayer } from '../scene/RenderLayer';

/** Draws a reactive rectangle in the nearest SceneSpace. Owns its uniform buffer until disposal. */
export function Rectangle(props: {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Straight RGBA components in the range 0–1. */
  color: readonly [number, number, number, number];
  /** Painter order, default 0. Use a larger value to draw over the document. */
  order?: number;
  /** Hides the rectangle while retaining its GPU resources. Default true. */
  visible?: boolean;
}) {
  const gpu = useGpuCanvas();
  const space = useSceneSpace();
  const loop = useFrameLoop();
  const resources = createGpuResources();

  onCleanup(resources.destroy);
  makeEventListener(gpu.signal, 'abort', resources.destroy, { once: true });

  const prepared = Result.fromThrowable(
    () => {
      const uniform = resources.keep(gpu.root.createBuffer(RectangleUniform).$usage('uniform'));
      const group = gpu.root.createBindGroup(rectangleLayout, { rectangle: uniform });
      const pipeline = gpu.root
        .createRenderPipeline({
          vertex: rectangleVertex,
          fragment: rectangleFragment,
          primitive: { topology: 'triangle-strip' },
          targets: {
            format: gpu.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }
        })
        .with(group);

      return { uniform, pipeline };
    },
    (cause) => gpuError('render', errorMessage(cause), cause)
  )();

  if (prepared.isErr()) {
    resources.destroy();
    loop.fail(prepared.error);
    return null;
  }

  const { uniform, pipeline } = prepared.value;

  createEffect(
    () => [props.x, props.y, props.width, props.height, ...props.color],
    () => loop.invalidate()
  );

  return (
    <RenderLayer
      order={props.order}
      visible={props.visible}
      draw={({ pass }) => {
        const origin = space.toClip({ x: props.x, y: props.y });
        const right = space.toClip({ x: props.x + props.width, y: props.y });
        const bottom = space.toClip({ x: props.x, y: props.y + props.height });
        uniform.write({
          origin: [origin.x, origin.y],
          axisX: [right.x - origin.x, right.y - origin.y],
          axisY: [bottom.x - origin.x, bottom.y - origin.y],
          color: [...props.color]
        });

        pipeline.with(pass).draw(4);
      }}
    />
  );
}

const RectangleUniform = d.struct({ origin: d.vec2f, axisX: d.vec2f, axisY: d.vec2f, color: d.vec4f });
const rectangleLayout = tgpu.bindGroupLayout({ rectangle: { uniform: RectangleUniform } });

const rectangleVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position }
})(({ index }) => {
  'use gpu';
  const rectangle = rectangleLayout.$.rectangle;
  const position = rectangle.origin
    .add(rectangle.axisX.mul(d.f32(index & 1)))
    .add(rectangle.axisY.mul(d.f32(index >> 1)));

  return { position: d.vec4f(position, 0, 1) };
});

const rectangleFragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
  'use gpu';
  return d.vec4f(rectangleLayout.$.rectangle.color);
});
