import * as m4 from '@packages/math/m4';
import { create, setFromSpherical, setFromVec3 } from '@packages/math/spherical';
import { clamp } from '@packages/math/utils/clamp';
import { For, createEffect, createMemo, createSignal } from 'solid-js';

import { round } from '@packages/gsap/core/utils';
import { FVec3 } from '@packages/math';
import { useCamera } from '@packages/three-examples/Camera.provider';
import s from './3dWireframe.module.scss';
import { Main } from './main';

export default function Wireframe() {
  const canvas = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  // canvas.style.imageRendering = 'pixelated';
  // canvas.imageSmoothingEnabled = false;

  function handleWindowResize(event: UIEvent) {
    canvas.width = document.documentElement.clientWidth;
    canvas.height = document.documentElement.clientHeight;
  }

  window.addEventListener('resize', handleWindowResize);

  const { cameraType } = useCamera();

  const [transition, setTransition] = createSignal(cameraType() === 'perspective' ? 1 : 0);

  createEffect(() => {
    setTransition(cameraType() === 'perspective' ? 1 : 0);
  });

  const [camera, setCamera] = createSignal(
    (() => {
      const c = {
        orthographicProjection: m4.identity(),
        perspectiveProjection: m4.identity(),
        projection: m4.identity(),
        // transform: m4.identity(),
        inversePosition: m4.identity(),
        target: FVec3.create(0, 0, 0),
        offset: FVec3.create(0.6, 1.8, 2.0),
        spherical: create()
      };

      setFromVec3(c.spherical, c.offset);

      return c;
    })(),

    { equals: false }
  );

  const context = {
    canvas,
    gl: canvas.getContext('webgl2')!,

    viewportWidth: 0,
    viewportHeight: 0,

    renderTime: 0,
    renderDeltaTime: 0,

    transition,

    camera,
    setCamera
  };

  return (
    <>
      {canvas} <Main ctx={context} />
      <div class={s.controls}>
        <input
          type="range"
          min={0}
          max={1.25}
          step={0.01}
          value={transition()}
          onInput={(e) => setTransition(parseFloat((e.target as any).value))}
          onwheel={(e) => {
            setTransition(clamp(transition() + (e.deltaY > 0 ? 0.1 : -0.1), 0, 1.25));
          }}
        />
        <For each={['x', 'y', 'z']}>
          {(coord, i) => {
            const value = createMemo(() => camera().offset[i()]);
            const setValue = (value: number) => {
              const c = camera();
              c.offset[i()] = value;
              setFromVec3(c.spherical, c.offset);
              setCamera(c);
            };
            return (
              <div>
                {coord + ': '}
                <input
                  size="4"
                  value={round(value())}
                  onChange={(e) => {
                    setValue(parseFloat((e.target as any).value));
                  }}
                  onwheel={(e) => {
                    setValue(value() + (e.deltaY > 0 ? 0.1 : -0.1));
                  }}
                ></input>
              </div>
            );
          }}
        </For>

        <For each={['radius', 'phi', 'theta']}>
          {(coord, i) => {
            const value = createMemo(() => (camera().spherical as any)[coord]);
            const setValue = (value: number) => {
              const c = camera();
              (c.spherical as any)[coord] = value;
              setFromSpherical(c.offset, c.spherical);
              setCamera(c);
            };
            return (
              <div>
                {coord + ': '}
                <input
                  size="4"
                  value={round(value())}
                  onChange={(e) => {
                    setValue(parseFloat((e.target as any).value));
                  }}
                  onwheel={(e) => {
                    setValue(value() + (e.deltaY > 0 ? 0.1 : -0.1));
                  }}
                ></input>
              </div>
            );
          }}
        </For>

        <For each={['x', 'y', 'z']}>
          {(coord, i) => {
            const value = createMemo(() => camera().target[i()]);
            const setValue = (value: number) => {
              const c = camera();
              c.target[i()] = value;
              // setFromSpherical(c.offset, c.spherical);
              c.offset.add(c.target);

              setCamera(c);
            };
            return (
              <div>
                {coord + ': '}
                <input
                  size="4"
                  value={round(value())}
                  onChange={(e) => {
                    setValue(parseFloat((e.target as any).value));
                  }}
                  onwheel={(e) => {
                    setValue(value() + (e.deltaY > 0 ? 0.1 : -0.1));
                  }}
                ></input>
              </div>
            );
          }}
        </For>
      </div>
    </>
  );
}
