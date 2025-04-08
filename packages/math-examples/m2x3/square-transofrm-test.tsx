import { useDebugLayer } from '@packages/debug-layer/use-debug-layer';
import { Mat2x3 } from '@packages/math/m2x3';
import { Vec2 } from '@packages/math/v2';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { usePanHandler } from './pan-handler';
import { useRotateHandler } from './rotate-handler';
import { useScaleHandler } from './scale-handler';
import { useTransformOriginHandler } from './transform-origin-handler';
import { useZoomHandler } from './zoom-handler';

export function SquareTransofrmTest(props: { debugLayer: ReturnType<typeof useDebugLayer> }) {
  // initial transform values
  const [translation, setTranslation] = createSignal<Vec2>(Vec2.create(0, 0));
  const [rotationMat, setRotationMat] = createSignal<Mat2x3>(new Mat2x3().identity());
  const [scale, setScale] = createSignal<Vec2>(Vec2.create(1, 1));
  const [origin, setOrigin] = createSignal<Vec2>(Vec2.create(0, 0));

  const [ref, setRef] = createSignal<HTMLDivElement | undefined>();

  const _mat = new Mat2x3().identity();
  const mat = createMemo(
    () => {
      // const mat = m2x3.compose(translation(), 0 as Radians, scale(), _mat);
      // return m2x3.multiply(rotationMat(), mat, _mat);
      return new Mat2x3().identity().multiply(rotationMat());
    },
    _mat,
    {
      equals: () => false
    }
  );

  const transform = createMemo(() => mat().toCssMatrix3d());

  const { handlePointerDown } = usePanHandler({
    translation,
    setTranslation
  });

  const { handleWheel } = useZoomHandler({
    scale,
    translation,
    ref,
    setScale,
    setTranslation
  });

  const { handleRotatePointerDown } = useRotateHandler({
    ref,
    origin,
    mat: rotationMat,
    setMat: setRotationMat,
    debugLayer: props.debugLayer
  });

  const { handleScalePointerDown } = useScaleHandler({
    ref,
    scale,
    setScale
  });

  const { handleOriginPointerDown } = useTransformOriginHandler({
    origin,
    setOrigin
  });

  createEffect(() => {
    createEventListener(ref(), 'wheel', handleWheel, { passive: false });
  });

  const refPosition = createMemo(() => ref()?.getBoundingClientRect());

  createEffect(() => {
    const _origin = origin();
    const _mat = mat();
    const { x, y, width, height } = refPosition() ?? { x: 0, y: 0, width: 0, height: 0 };
    const pos = Vec2.create(x, y);

    const positionMatrix = new Mat2x3().createTranslation(pos);
    const fullPositionMatrix = new Mat2x3().multiplyFrom(positionMatrix, _mat);

    const point0 = Vec2.create(0, 0);
    {
      fullPositionMatrix.transformPoint(point0);
      // debugLayer.updatePoint('translation', point0[0], point0[1], 'blue', 3);
    }

    {
      const point1 = Vec2.create(width, 0);
      fullPositionMatrix.transformPoint(point1);
      // debugLayer.updatePoint('point1', point1[0], point1[1], 'blue', 3);
      // debugLayer.updateLine('line1', point0[0], point0[1], point1[0], point1[1], 'blue', 2);
    }

    {
      const point2 = Vec2.create(0, height);
      fullPositionMatrix.transformPoint(point2);
      // debugLayer.updatePoint('point2', point2[0], point2[1], 'blue', 3);
      // debugLayer.updateLine('line2', point0[0], point0[1], point2[0], point2[1], 'blue', 2);
    }

    props.debugLayer.updateGroup('group', fullPositionMatrix);

    const newOrigin = new Vec2().copy(_origin);
    fullPositionMatrix.transformPoint(newOrigin);
    props.debugLayer.updatePoint('origin', newOrigin, 'red', 3);
    props.debugLayer.updateLine('line3', point0, newOrigin, 'blue', 2);
  });

  return (
    <div>
      <div>
        <p>
          • Drag the left button to move the red box.
          <br />
          • Scroll over the box to zoom relative to the pointer (using pivot from transform origin).
          <br />
          • Press and hold the ↺ button and move the pointer to rotate around the transform origin.
          <br />
          • Hold Shift while rotating to snap to 15° increments.
          <br />
          • Press and hold the ⇲ button to scale relative to the transform origin.
          <br />• Drag the ⦿ button to reposition the transform origin (pivot) for rotate and scale.
        </p>
        <br />
        <pre>transform:{transform()}</pre>
        <pre>origin:{origin().toString()}</pre>
      </div>
      <div
        ref={setRef}
        class="bg-red fixed h-32 w-32"
        style={{
          transform: transform(),
          'transform-origin': 'top left'
          // transition: 'transform 1s'
        }}
      >
        <button class="absolute start-1 top-1 h-8 w-8 bg-white" onPointerDown={handlePointerDown}>
          ↔
        </button>
        <button class="absolute end-1 top-1 h-8 w-8 bg-white" onPointerDown={handleRotatePointerDown}>
          ↺
        </button>
        <button class="absolute bottom-1 end-1 h-8 w-8 bg-white" onPointerDown={handleScalePointerDown}>
          ⇲
        </button>
        <button
          aria-label="Transform Origin Control Button"
          class="bg-blue absolute flex h-4 w-4 place-content-center place-items-center rounded-full pb-0.5"
          style={{
            // Position the pivot control button based on origin state.
            left: `${origin().x - 8}px`,
            top: `${origin().y - 8}px`,
            cursor: 'move'
          }}
          onPointerDown={handleOriginPointerDown}
        >
          ⦿
        </button>
      </div>
    </div>
  );
}
