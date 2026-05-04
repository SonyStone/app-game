import { Application, Stage } from '@app-game/solid-pixi';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { A } from '@solidjs/router';
import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import { Graphics, VERSION } from 'pixi.js';
import { For, Show } from 'solid-js';
import { JSX } from 'solid-js/jsx-runtime';
import { OffscreenCanvas } from './OffscreenCanvas';
import { Transition } from './Transition';
import OffscreenCanvasWorker from './offscreen-canvas.worker?worker';
import { routes } from './routes';

export default function App(props: { children?: JSX.Element }) {
  const size = createWindowSize();
  const canvas = (<canvas class="touch-none" width={size.width} height={size.height} />) as HTMLCanvasElement;

  gsap.registerPlugin(PixiPlugin);
  PixiPlugin.registerPIXI({
    VERSION: VERSION,
    Graphics: Graphics
  });

  return (
    <>
      <div class="absolute left-0 top-0 z-10 flex flex-col gap-2 bg-white p-2">
        <For each={routes}>
          {(route) => (
            <A href={'.' + route.path} class="text-blue-500 hover:underline">
              {route.name}
            </A>
          )}
        </For>
      </div>
      <Show when={false}>
        <OffscreenCanvas worker={new OffscreenCanvasWorker()} width={size.width} height={size.height} />
      </Show>
      <Show when={true}>
        <Application resizeTo={window} canvas={canvas} background={'#1099bb'} useBackBuffer={true} antialias={true}>
          <Stage>
            <Transition
              onEnter={(el, done) => {
                gsap
                  .fromTo(
                    el,
                    {
                      pixi: {
                        x: size.width / 2,
                        y: size.height / 2,
                        rotation: 360,
                        pivotX: size.width / 2,
                        pivotY: size.height / 2,
                        scaleX: 0,
                        scaleY: 0
                      }
                    },
                    {
                      pixi: {
                        x: size.width / 2,
                        y: size.height / 2,
                        scaleX: 1,
                        scaleY: 1,
                        pivotX: size.width / 2,
                        pivotY: size.height / 2,
                        rotation: 0
                      },
                      duration: 0.3
                    }
                  )
                  .eventCallback('onComplete', () => {
                    done();
                  });
              }}
              onExit={(el, done) => {
                gsap
                  .to(el, {
                    pixi: { y: -size.height },
                    duration: 0.5
                  })
                  .eventCallback('onComplete', () => {
                    done();
                  });
              }}
            >
              {props.children}
            </Transition>
          </Stage>
        </Application>
      </Show>
    </>
  );
}
