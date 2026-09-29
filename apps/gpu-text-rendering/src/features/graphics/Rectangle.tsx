import tgpu, { d } from 'typegpu';
import { useGpuCanvas } from '../../shared/gpu/GpuCanvasProvider';
import type { Point } from '../camera/camera';
import { useSceneSpace } from '../camera/SceneSpace';
import { createUniform } from '../scene/createUniform';
import { RenderLayer, type ScenePointerEvent } from '../scene/RenderLayer';

/**
 * Draws a reactive rectangle in the nearest SceneSpace. Owns its uniform buffer until disposal.
 * With pointer handlers it also receives presses on its area; see ScenePointerHandlers for capture rules.
 */
export function Rectangle(props: {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Straight RGBA components in the range 0–1. */
  color: readonly [number, number, number, number];
  /** Painter order, default 0. Use a larger value to draw over the document. */
  order?: number;
  /** Hides the rectangle and ignores pointers while retaining its GPU resources. Default true. */
  visible?: boolean;
  /** Press on the rectangle's area. Providing it makes the rectangle block presses to layers and controls below. */
  onPointerDown?: (event: RectanglePointerEvent) => void;
  /** Moves of a pointer this rectangle captured on press. */
  onPointerMove?: (event: RectanglePointerEvent) => void;
  /** Release or cancellation of a pointer this rectangle captured on press. */
  onPointerUp?: (event: RectanglePointerEvent) => void;
}) {
  const { root, format } = useGpuCanvas();
  const space = useSceneSpace();

  const rectangle = createUniform(RectangleUniform, () => {
    const origin = space.toClip({ x: props.x, y: props.y });
    const right = space.toClip({ x: props.x + props.width, y: props.y });
    const bottom = space.toClip({ x: props.x, y: props.y + props.height });

    return {
      origin: d.vec2f(origin.x, origin.y),
      axisX: d.vec2f(right.x - origin.x, right.y - origin.y),
      axisY: d.vec2f(bottom.x - origin.x, bottom.y - origin.y),
      color: d.vec4f(...props.color)
    };
  });

  const pipeline = root
    .createRenderPipeline({
      vertex: rectangleVertex,
      fragment: rectangleFragment,
      primitive: { topology: 'triangle-strip' },
      targets: {
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        }
      }
    })
    .with(root.createBindGroup(rectangleLayout, { rectangle }));

  const local = (event: ScenePointerEvent): RectanglePointerEvent => ({
    ...event,
    point: space.fromScreen(event.screen)
  });

  return (
    <RenderLayer
      order={props.order}
      visible={props.visible}
      draw={({ pass }) => pipeline.with(pass).draw(4)}
      hitTest={(screen) => {
        const { x, y } = space.fromScreen(screen);
        const [left, right] = [props.x, props.x + props.width].sort((a, b) => a - b);
        const [top, bottom] = [props.y, props.y + props.height].sort((a, b) => a - b);

        return x >= left! && x <= right! && y >= top! && y <= bottom!;
      }}
      onPointerDown={props.onPointerDown && ((event) => props.onPointerDown?.(local(event)))}
      onPointerMove={(event) => props.onPointerMove?.(local(event))}
      onPointerUp={(event) => props.onPointerUp?.(local(event))}
    />
  );
}

/** A scene pointer event with its position in the rectangle's SceneSpace. */
export type RectanglePointerEvent = ScenePointerEvent & { point: Point };

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
