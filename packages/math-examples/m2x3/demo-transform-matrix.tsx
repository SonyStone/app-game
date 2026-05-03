import { GridSVG } from '@app-game/debug-layer/grid-svg';
import { useDebugLayer } from '@app-game/debug-layer/use-debug-layer';
import { Mat2x3 } from '@app-game/math/m2x3';
import { Transform } from '@app-game/math/transform';
import { Degrees } from '@app-game/math/types';
import { degToRad } from '@app-game/math/utils/trigonometry';
import { Vec2 } from '@app-game/math/v2';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, untrack } from 'solid-js';
import { useTransformHandler } from './use-transform-handler';

export function TestTransformMatrix(props: { debugLayer?: ReturnType<typeof useDebugLayer> }) {
  const [mat, setMat] = createSignal(Mat2x3.create().translate(Vec2.create(400, 100)), { equals: () => false });
  const transform = Transform.create();
  transform.position.set(0, 0);
  transform.scale.set(1);
  transform.rotation.set(degToRad(0 as Degrees));

  const [ref, setRef] = createSignal<SVGRectElement | undefined>();
  const [translation, setTranslation] = createSignal(transform.position, { equals: () => false });
  const [scale, setScale] = createSignal(transform.scale, { equals: () => false });
  const [rotation, setRotation] = createSignal(transform.rotation, { equals: () => false });

  const { handlePointerDown, handleWheel } = useTransformHandler({
    mat,
    setMat,
    debugLayer: props.debugLayer
  });

  createEffect(() => {
    mat().decompose(transform);
    setTranslation(untrack(translation));
    setScale(untrack(scale));
    setRotation(untrack(rotation));
  });

  createEffect(() => {
    createEventListener(ref(), 'wheel', handleWheel, { passive: false });
  });

  return (
    <>
      <g
        style={{
          transform: mat().toCssMatrix(),
          'transform-origin': '0 0'
        }}
      >
        <rect
          ref={setRef}
          x="0"
          y="0"
          width="100"
          height="100"
          fill="red"
          opacity={0.5}
          onPointerDown={handlePointerDown}
        />
        <GridSVG color="blue" />
        {/* Zoom in percent */}
        <text class="pointer-events-none select-none" x={50} y={50} dy={-10.1} dx={-30} font-size="8" fill="white">
          Zoom {Math.round(scale().val * 100)}%
        </text>
        <text class="pointer-events-none select-none" x={50} y={50} dy={-0.1} dx={-30.6} font-size="8" fill="white">
          Position {translation().toString()}
        </text>
        <text class="pointer-events-none select-none" x={50} y={50} dy={19.7} dx={-30.7} font-size="18" fill="white">
          Canvas
        </text>
      </g>
      <g id="transform-matrix-test" class="translate-x-400px translate-y-100px">
        <GridSVG />
      </g>
    </>
  );
}
