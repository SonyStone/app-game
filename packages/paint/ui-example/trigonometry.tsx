import { DEG_TO_RAD } from '@packages/math';
import { distance } from '@packages/ogl/math/functions/vec-2-func';
import { numberPrecisionDragInput } from '@packages/ui-components-examples/breadcrumbs/number-precision-drag-input';
import { RAD_TO_DEG } from 'pixi.js';
import { ComponentProps, createMemo, createSignal, splitProps } from 'solid-js';

/**
 * ```
 * hypotenuse
 *       \      /|
 *            /  |
 *          /    |
 *        /      | opposite
 *      /________|
 *   /    adjacent
 * angle
 * ```
 * * hypotenuse = 1
 * * hypotenuse = √(opposite² + adjacent²)
 *
 * * opposite = √(1 - adjacent²)
 * * opposite = sin(angle)
 *
 * * adjacent = √(1 - opposite²)
 * * adjacent = cos(angle)
 *
 * * angle = asin(opposite)
 * * angle = acos(adjacent)
 */

export default function TrigonometryExample() {
  const [angle, setAngle] = createSignal(30);

  const [opposite, setOpposite] = createSignal(toFixed(calcOpposite(angle())));
  const [adjacent, setAdjacent] = createSignal(toFixed(calcAdjacent(angle())));

  return (
    <div class="flex h-full w-full place-content-center place-items-center">
      <div class="flex flex-col gap-4">
        <div class="flex gap-1">
          <label>Angle</label>
          <Input
            value={angle()}
            onChange={(value) => {
              setAngle(toFixed(value));
              setOpposite(toFixed(calcOpposite(value)));
              setAdjacent(toFixed(calcAdjacent(value)));
            }}
            max={360}
          />
        </div>
        <div class="flex gap-1">
          <label>Opposite</label>
          <Input
            value={opposite()}
            onChange={(value) => {
              setAngle(toFixed(calcAngleFromOpposite(value)));
              setOpposite(toFixed(value));
              setAdjacent(toFixed(calcAdjacentFromOpposite(value)));
            }}
            max={1}
            step={0.01}
          />
        </div>
        <div class="flex gap-1">
          <label>Adjacent</label>
          <Input
            value={adjacent()}
            onChange={(value) => {
              setAngle(toFixed(calcAngleFromAdjacent(value)));
              setAdjacent(toFixed(value));
              setOpposite(toFixed(calcOppositeFromAdjacent(value)));
            }}
            max={1}
            step={0.01}
          />
        </div>
      </div>

      <svg class="border" class="w-100 h-100" viewBox="0 0 2 2">
        <g transform="scale(1, -1) scale(0.9, 0.9) translate(1 1) " transform-origin="center">
          <circle
            cx="0"
            cy="0"
            r="1"
            stroke-width="0.01"
            class="fill-none stroke-red-400 transition-colors hover:stroke-red-300"
          />
          <line x1="-1" y1="0" x2="1" y2="0" stroke="black" stroke-width="0.005" />
          <line x1="0" y1="-1" x2="0" y2="1" stroke="black" stroke-width="0.005" />

          <Hypotenuse angle={angle()} />
        </g>
      </svg>
    </div>
  );
}

const Hypotenuse = (props: { angle: number }) => {
  const cos_x = createMemo(() => Math.cos(props.angle * DEG_TO_RAD));
  const sin_y = createMemo(() => Math.sin(props.angle * DEG_TO_RAD));

  return (
    <g>
      <Line x1={0} y1={0} x2={cos_x()} y2={sin_y()} />
      {/* <path fill="none" stroke="black" stroke-width="0.01" d={`M 1,0 A 1 1 0 0 1 ${cos_x},${sin_y}`}></path> */}
      <Arc x1={1} y1={0} x2={cos_x()} y2={sin_y()} />
      <Line x1={cos_x()} y1={0} x2={cos_x()} y2={sin_y()} />
      <Line x1={0} y1={0} x2={cos_x()} y2={0} />
      <Line x1={cos_x()} y1={0} x2={1} y2={0} />
      <Line x1={cos_x()} y1={sin_y()} x2={1} y2={0} />
      <Point x={cos_x()} y={sin_y()} />
    </g>
  );
};

const Input = (
  props: { value: number; onChange: (value: number) => void } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>
) => {
  const [local, others] = splitProps(props, ['value', 'onChange']);

  return (
    <input
      class="w-16"
      value={local.value}
      type="number"
      onInput={(e) => {
        const value = parseFloat(e.target.value);
        local.onChange(value);
      }}
      ref={(ref) => {
        numberPrecisionDragInput(ref, {
          value: local.value,
          onChange: local.onChange,
          step: '.01',
          max: '.1',
          min: '.001'
        });
      }}
      {...others}
    />
  );
};

const Point = (props: { x: number; y: number }) => (
  <g test-point={`[${props.x.toFixed(2)}, ${props.y.toFixed(2)}]`}>
    <circle
      cx={props.x}
      cy={props.y}
      r="0.04"
      class="peer fill-transparent"
      onPointerOver={(e) => console.log(props.x, props.y, e)}
    />
    <circle
      cx={props.x}
      cy={props.y}
      r="0.02"
      class="pointer-events-none fill-red-400 transition-colors peer-hover:fill-red-300"
      onPointerOver={(e) => console.log(props.x, props.y, e)}
    />
  </g>
);

const Line = (props: { x1: number; y1: number; x2: number; y2: number }) => (
  <g
    test-line={`[${props.x1.toFixed(2)}, ${props.y1.toFixed(2)}] [${props.x2.toFixed(2)}, ${props.y2.toFixed(2)}]`}
    test-length={`${distance([props.x1, props.y1], [props.x2, props.y2]).toFixed(2)}`}
  >
    <line
      x1={props.x1}
      y1={props.y1}
      x2={props.x2}
      y2={props.y2}
      stroke-width="0.1"
      stroke-linecap="round"
      class="peer stroke-transparent"
    />
    <line
      x1={props.x1}
      y1={props.y1}
      x2={props.x2}
      y2={props.y2}
      stroke-width="0.01"
      class="peer pointer-events-none stroke-black  transition-colors peer-hover:stroke-red-300"
    />
  </g>
);

const Arc = (props: { x1: number; y1: number; x2: number; y2: number }) => (
  <g test-arc>
    <path
      fill="none"
      stroke-width="0.1"
      stroke-linecap="round"
      class="peer stroke-transparent"
      d={`M ${props.x1},${props.y1} A 1 1 0 0 ${props.y1 > props.y2 ? 0 : 1} ${props.x2},${props.y2}`}
    ></path>
    <path
      fill="none"
      stroke-width="0.01"
      class="peer pointer-events-none stroke-black  transition-colors peer-hover:stroke-red-300"
      d={`M ${props.x1},${props.y1} A 1 1 0 0 ${props.y1 > props.y2 ? 0 : 1} ${props.x2},${props.y2}`}
    ></path>
  </g>
);

const calcOpposite = (angle: number) => Math.sin(angle * DEG_TO_RAD);
const calcAngleFromOpposite = (height: number) => {
  if (height > 1) {
    return 90;
  } else if (height < -1) {
    return -90;
  } else if (height === 0) {
    return 0;
  } else {
    return Math.asin(height) * RAD_TO_DEG;
  }
};

const calcAdjacent = (angle: number) => Math.cos(angle * DEG_TO_RAD);
const calcAngleFromAdjacent = (height: number) => {
  if (height > 1) {
    return 90;
  } else if (height < -1) {
    return -90;
  } else if (height === 0) {
    return 0;
  } else {
    return Math.acos(height) * RAD_TO_DEG;
  }
};

const calcOppositeFromAdjacent = (adjacent: number) => Math.sqrt(1 - adjacent * adjacent);
const calcAdjacentFromOpposite = (opposite: number) => Math.sqrt(1 - opposite * opposite);
const toFixed = (value: number) => +value.toFixed(2);
