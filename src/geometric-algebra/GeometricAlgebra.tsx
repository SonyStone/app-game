import * as v2 from '@webgl/math/v2';
import * as v3 from '@webgl/math/v3';
import {
  animationFrameScheduler,
  from as rxFrom,
  interval,
  map,
  ObservableInput,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { createMemo, createSignal, from, observable } from 'solid-js';

import { ganja } from './align';
import s from './GeometricAlgebra.module.scss';

const p = (v: number[] | Float32Array) => v.join(',');
const j = (v: any[]) => v.join(' ');

const frameTimer = (start: number) =>
  interval(0, animationFrameScheduler).pipe(map((v) => start + v));

const toggler = () => {
  let time = 0;

  return switchMap((toggle: boolean) =>
    (toggle ? of(time) : frameTimer(time)).pipe(tap((v) => (time = v)))
  );
};

export default function GeometricAlgebra() {
  const zero = [0, 0];

  const [toggle, setToggle] = createSignal<boolean>(false);

  const value = from(
    rxFrom<ObservableInput<boolean>>(observable(toggle)).pipe(toggler())
  );

  ganja();

  return (
    <>
      <div>
        <button onClick={() => setToggle(!toggle())}>pause</button>
        <svg class={s.wrapper} viewBox="0 0 5 5">
          <g class={j([s.example, s.red])}>
            {() => {
              const v_1 = v2.create(1, 0);
              const v_2 = v2.create(0, 1);

              return (
                <>
                  <polyline points={j([p(zero), p(v_1)])} />
                  <polyline points={j([p(zero), p(v_2)])} />

                  <polyline
                    class={s.dot}
                    points={j([p(v_1), p(v2.add(v_1, v_2))])}
                  />
                  <polyline
                    class={s.dot}
                    points={j([p(v_2), p(v2.add(v_1, v_2))])}
                  />
                  <text x={v_1[0] + 0.025} y={v_1[1] - 0.025}>
                    e1
                  </text>
                  <text x={v_2[0] + 0.025} y={v_2[1] - 0.025}>
                    e2
                  </text>
                  <text x="1.05" y="0.1">
                    cross product |e1 × e2| = {v3.length(v2.cross(v_1, v_2))}
                  </text>
                  <text x="1.05" y="0.25">
                    outer product (e1 ∧ e2) = 1 (imaginary term)
                  </text>
                </>
              );
            }}
          </g>
          <g class={j([s.example, s.blue])}>
            {() => {
              const a = 0.663325;
              const b = 1.2;

              const v_1 = createMemo(() => {
                const a = Math.sin(value() / 60) / 8 + 0.5;
                const b = Math.cos(value() / 60) / 8 + 1.2;
                return v2.create(a, b);
              });

              const v_2 = createMemo(() => {
                const b = Math.sin(value() / 60) / 8 + 0.5;
                const a = Math.cos(value() / 60) / 8 + 1.2;
                return v2.create(a, b);
              });

              return (
                <>
                  <polyline points={j([p(zero), p(v_1())])} />
                  <polyline points={j([p(zero), p(v_2())])} />

                  <polyline
                    class={s.dot}
                    points={j([p(v_1()), p(v2.add(v_1(), v_2()))])}
                  />
                  <polyline
                    class={s.dot}
                    points={j([p(v_2()), p(v2.add(v_1(), v_2()))])}
                  />
                  <text x={v_1()[0] + 0.025} y={v_1()[1] - 0.025}>
                    a
                  </text>
                  <text x={v_2()[0] + 0.025} y={v_2()[1] - 0.025}>
                    b
                  </text>
                  <text x="1.6" y="1">
                    cross product |a × b| ={' '}
                    {v3.length(v2.cross(v_1(), v_2())).toFixed(4)}{' '}
                  </text>
                  <text x="1.6" y="1.15">
                    outer product a ∧ b = (
                    {(v_1()[0] * v_2()[1] - v_1()[1] * v_2()[0]).toFixed(4)}){' '}
                    (e1 ∧ e2)
                  </text>
                </>
              );
            }}
          </g>
        </svg>
      </div>
    </>
  );
}
