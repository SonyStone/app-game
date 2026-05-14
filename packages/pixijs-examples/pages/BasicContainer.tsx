import { Container, Sprite, useAsset } from '@app-game/solid-pixi';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { gsap } from 'gsap';
import { Ticker } from 'pixi.js';
import { createSignal, For, onMount, Suspense } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Transition } from '../Transition';
import { useTick } from '../useTick';

export default function BasicContainer() {
  const [texture] = useAsset('https://pixijs.com/assets/bunny.png');
  const [show, setShow] = createSignal(true);
  const size = createWindowSize();

  const store = Array.from({ length: 50 }, () => ({ x: 0, y: 0 })).map((_, i) => ({
    x: (i % 5) * 40,
    y: Math.floor(i / 5) * 40
  }));

  // Portal return text element as an anchor, so we cannot use it inside Solid-Pixi components directly.
  <Portal mount={document.body}>
    <div class="pointer-events-none absolute inset-x-0 top-0 z-50 flex place-content-center place-items-center p-4">
      <div class="pointer-events-auto">
        <button class="rounded-xl bg-blue-200 px-2" onClick={() => setShow((prev) => !prev)}>
          {show() ? 'Hide' : 'Show'} Container
        </button>
      </div>
    </div>
  </Portal>;

  return (
    <Container>
      <Suspense>
        <Transition
          onEnter={(el, done) => {
            gsap
              .fromTo(
                el,
                {
                  pixi: {
                    scaleX: 0,
                    scaleY: 0,
                    rotation: 360,
                    pivotX: el.width / 2,
                    pivotY: el.height / 2
                  }
                },
                {
                  pixi: { scaleX: 1, scaleY: 1, rotation: 0 },
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
                pixi: { x: '-=500', y: '-=500', rotation: '-=180', alpha: 0 },
                duration: 0.5
              })
              .eventCallback('onComplete', () => {
                done();
              });
          }}
        >
          {show() && (
            <Container
              ref={(container) => {
                onMount(() => {
                  container.pivot.x = container.width / 2;
                  container.pivot.y = container.height / 2;
                });
                useTick((delta: Ticker) => {
                  // Rotate the container
                  container.rotation -= 0.01 * delta.deltaTime;
                });
              }}
              x={size.width / 2}
              y={size.height / 2}
            >
              <For each={store}>{(item) => <Sprite texture={texture()} x={item.x} y={item.y} />}</For>
            </Container>
          )}
        </Transition>
      </Suspense>
    </Container>
  );
}
