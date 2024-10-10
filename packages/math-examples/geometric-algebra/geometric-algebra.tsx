import * as v3 from '@packages/math/v3-builder';
import { animationFrameScheduler, interval, map, ObservableInput, of, from as rxFrom, switchMap, tap } from 'rxjs';
import { createMemo, createSignal, from, observable } from 'solid-js';

import { FVec2, Vec3 } from '@packages/math';
import { ganja } from './align';

const p = (v: number[] | Float32Array) => v.join(',');
const j = (v: any[]) => v.join(' ');

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
    const v_1 = FVec2.create(1, 0);
    const v_2 = FVec2.create(0, 1);
    const v_3 = Vec3.create();

    const l = `cross product |e1 x e2| =${v_3.cross2(v_1, v_2).len()}`;

    return (
      <>
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round]"
          points={j([p(zero), p(v_1)])}
        />
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round]"
          points={j([p(zero), p(v_2)])}
        />

        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round] [stroke-dasharray:0.1_0.05]"
          points={j([p(v_1), p(FVec2.add(v_1, v_2))])}
        />
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round] [stroke-dasharray:0.1_0.05]"
          points={j([p(v_2), p(FVec2.add(v_1, v_2))])}
        />
        <text class="bg-white fill-current" x={v_1[0] + 0.025} y={v_1[1] - 0.025}>
          e1
        </text>
        <text class="bg-white fill-current" x={v_2[0] + 0.025} y={v_2[1] - 0.025}>
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
    const a = 0.663325;
    const b = 1.2;

    const v_1 = createMemo(() => {
      const a = Math.sin((value() ?? 0) / 60) / 8 + 0.5;
      const b = Math.cos((value() ?? 0) / 60) / 8 + 1.2;
      return FVec2.create(a, b);
    });

    const v_2 = createMemo(() => {
      const b = Math.sin((value() ?? 0) / 60) / 8 + 0.5;
      const a = Math.cos((value() ?? 0) / 60) / 8 + 1.2;
      return FVec2.create(a, b);
    });

    const text1 = createMemo(() => `cross product |a × b| = ${Vec3.create().cross2(v_1(), v_2()).len().toFixed(4)}`);
    const text2 = createMemo(
      () => `outer product a ∧ b = (${(v_1()[0] * v_2()[1] - v_1()[1] * v_2()[0]).toFixed(4)}) (e1 ∧ e2)`
    );

    return (
      <>
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round]"
          points={j([p(zero), p(v_1())])}
        />
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round]"
          points={j([p(zero), p(v_2())])}
        />

        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round] [stroke-dasharray:0.1_0.05]"
          points={j([p(v_1()), p(FVec2.add(v_1(), v_2()))])}
        />
        <polyline
          class="stroke-width-0.02px fill-none stroke-current [stroke-linecap:round] [stroke-dasharray:0.1_0.05]"
          points={j([p(v_2()), p(FVec2.add(v_1(), v_2()))])}
        />
        <text class="bg-white fill-current" x={v_1()[0] + 0.025} y={v_1()[1] - 0.025}>
          a
        </text>
        <text class="bg-white fill-current" x={v_2()[0] + 0.025} y={v_2()[1] - 0.025}>
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
