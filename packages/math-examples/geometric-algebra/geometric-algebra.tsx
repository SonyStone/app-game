import * as v3 from '@app-game/math/v3-builder';
import { animationFrameScheduler, interval, map, ObservableInput, of, from as rxFrom, switchMap, tap } from 'rxjs';
import { createMemo, createSignal, from, observable } from 'solid-js';

import { Vec2, Vec3 } from '@app-game/math';
import { TypedArray } from '@app-game/math/utils/typed-array';
import { ganja } from './align';

const p = (v: TypedArray | number[]) => v.join(',');
const j = (v: (number | string)[]) => v.join(' ');

const frameTimer = (start: number) => interval(0, animationFrameScheduler).pipe(map((v) => start + v));

const toggler = () => {
  let time = 0;

  return switchMap((toggle: boolean) => (toggle ? of(time) : frameTimer(time)).pipe(tap((v) => (time = v))));
};

export default function GeometricAlgebra() {
  const zero = [0, 0];

  const [toggle, setToggle] = createSignal<boolean>(false);

  const value = from(rxFrom<ObservableInput<boolean>>(observable(toggle)).pipe(toggler()));

  ganja();

  console.log('v3', v3);

  function Line1() {
    // looks ugly, but one buffer for all vectors
    const buffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 4);

    const v_1 = new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 0)).set(1, 0);
    const v_2 = new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 1)).set(0, 1);
    const v_3 = Vec3.create();

    const l = `cross product |e1 x e2| =${v_3.cross2(v_1.value, v_2.value).len()}`;

    return (
      <>
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round]"
          points={j([p(zero), v_1.toString()])}
        />
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round]"
          points={j([p(zero), v_2.toString()])}
        />

        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round] [stroke-dasharray:0.1_0.05]"
          points={j([
            v_1.toString(),
            new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 2))
              .addFrom(v_1, v_2)
              .toString()
          ])}
        />
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round] [stroke-dasharray:0.1_0.05]"
          points={j([
            v_2.toString(),
            new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 3))
              .addFrom(v_1, v_2)
              .toString()
          ])}
        />
        <text class="bg-white fill-current" x={v_1.x + 0.025} y={v_1.y - 0.025}>
          e1
        </text>
        <text class="bg-white fill-current" x={v_2.x + 0.025} y={v_2.y - 0.025}>
          e2
        </text>
        <text class="bg-white fill-current" x="1.05" y="0.25">
          outer product (e1 ∧ e2) = 1 (imaginary term)
        </text>
        <text class="bg-white fill-current" x="1.05" y="0.1">
          {l}
        </text>
      </>
    );
  }

  function Line2() {
    // const a = 0.663325;
    // const b = 1.2;

    const v_1 = createMemo(() => {
      const a = Math.sin((value() ?? 0) / 60) / 8 + 0.5;
      const b = Math.cos((value() ?? 0) / 60) / 8 + 1.2;
      return new Vec2().set(a, b);
    });

    const v_2 = createMemo(() => {
      const b = Math.sin((value() ?? 0) / 60) / 8 + 0.5;
      const a = Math.cos((value() ?? 0) / 60) / 8 + 1.2;
      return new Vec2().set(a, b);
    });

    const text1 = createMemo(
      () => `cross product |a × b| = ${Vec3.create().cross2(v_1().value, v_2().value).len().toFixed(4)}`
    );
    const text2 = createMemo(
      () => `outer product a ∧ b = (${(v_1().x * v_2().y - v_1().x * v_2().y).toFixed(4)}) (e1 ∧ e2)`
    );

    return (
      <>
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round]"
          points={j([p(zero), v_1().toString()])}
        />
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round]"
          points={j([p(zero), v_2().toString()])}
        />

        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round] [stroke-dasharray:0.1_0.05]"
          points={j([v_1().toString(), new Vec2().addFrom(v_1(), v_2()).toString()])}
        />
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round] [stroke-dasharray:0.1_0.05]"
          points={j([v_2().toString(), new Vec2().addFrom(v_1(), v_2()).toString()])}
        />
        <text class="bg-white fill-current" x={v_1().x + 0.025} y={v_1().y - 0.025}>
          a
        </text>
        <text class="bg-white fill-current" x={v_2().x + 0.025} y={v_2().y - 0.025}>
          b
        </text>
        <text class="bg-white fill-current" x="1.6" y="1">
          {text1()}
        </text>
        <text class="bg-white fill-current" x="1.6" y="1.15">
          {text2()}
        </text>
      </>
    );
  }

  return (
    <div class="border">
      <button class="rounded border px-2" onClick={() => setToggle(!toggle())}>
        pause
      </button>
      <svg class="scale-80 origin-tl text-0.125px text-black" height={400} width={800} viewBox="0 0 4 1.8">
        <g class="origin-c color-red scale-90">
          <Line1 />
        </g>
        <g class="origin-c color-blue scale-90">
          <Line2 />
        </g>
      </svg>
    </div>
  );
}
