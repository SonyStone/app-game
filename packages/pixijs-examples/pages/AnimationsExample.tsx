import {
  easeInBack,
  easeInCirc,
  easeInCubic,
  easeInElastic,
  easeInExpo,
  easeInOutBack,
  easeInOutCirc,
  easeInOutCubic,
  easeInOutElastic,
  easeInOutExpo,
  easeInOutQuad,
  easeInOutQuart,
  easeInOutQuint,
  easeInOutSine,
  easeInQuad,
  easeInQuart,
  easeInQuint,
  easeInSine,
  easeOutBack,
  easeOutCirc,
  easeOutCubic,
  easeOutElastic,
  easeOutExpo,
  easeOutQuad,
  easeOutQuart,
  easeOutQuint,
  easeOutSine,
  linear
} from '@packages/penner-easing-equations';
import { Container, Graphics, Sprite, Text, useApplication, useAsset } from '@packages/solid-pixi';
import { createMemo, For, onMount, Suspense } from 'solid-js';
import { createElapsedMS } from '../useTick';

const ANIMATION_EASING_FUNCTIONS = [
  linear,
  easeInSine,
  easeInQuad,
  easeInCubic,
  easeInQuart,
  easeInQuint,
  easeInExpo,
  easeInCirc,
  easeInElastic,
  easeInBack,
  easeOutSine,
  easeOutQuad,
  easeOutCubic,
  easeOutQuart,
  easeOutQuint,
  easeOutExpo,
  easeOutCirc,
  easeOutElastic,
  easeOutBack,
  easeInOutSine,
  easeInOutQuad,
  easeInOutCubic,
  easeInOutQuart,
  easeInOutQuint,
  easeInOutExpo,
  easeInOutCirc,
  easeInOutElastic,
  easeInOutBack
];

function getAnimation(index: number) {
  return ANIMATION_EASING_FUNCTIONS[index % ANIMATION_EASING_FUNCTIONS.length];
}

export default function AnimationsExample() {
  const app = useApplication();
  const [texture] = useAsset('https://pixijs.com/assets/bunny.png');

  const store = Array.from({ length: ANIMATION_EASING_FUNCTIONS.length }, () => ({ x: 0, y: 0 })).map((_, i) => ({
    x: (i % ANIMATION_EASING_FUNCTIONS.length) * 1,
    y: Math.floor(i / 1) * ANIMATION_EASING_FUNCTIONS.length
  }));

  const elapsedMS = createElapsedMS();
  const animationDuration = 1000;
  const pingPongTime = createMemo(() => {
    let time = elapsedMS() % (animationDuration * 2);
    time = time % (animationDuration * 2);
    return time <= animationDuration ? time : animationDuration * 2 - time;
  });

  // Portal return text element as an anchor, so we cannot use it inside Solid-Pixi components directly.
  // <Portal mount={document.body}>
  //   <div class="pointer-events-none absolute inset-x-0 top-0 z-50 flex place-content-center place-items-center p-4">
  //     <div class="pointer-events-auto">
  //       <pre>{pingPongTime().toFixed(0)}ms</pre>
  //     </div>
  //   </div>
  // </Portal>;

  return (
    <Container>
      <Suspense>
        <Container x={app.screen.width / 2} y={50}>
          <For each={store}>
            {(item, index) => {
              const easingFunction = getAnimation(index());
              const animationName = easingFunction.name;
              const startPosition = -200;
              const deltaPosition = 200;

              const drawSteps = 24;
              const drawHeight = 16;

              return (
                <Container x={item.x} y={item.y}>
                  <Text x={100} y={0} style={{ fontSize: 12, fill: 0xffffff }} text={animationName} />
                  <Graphics
                    ref={(g) => {
                      g.moveTo(startPosition, 0);
                      g.lineTo(0, 0);
                      g.stroke({ width: 0.6, color: 0xfeeb77 });
                      for (let i = 0; i <= drawSteps; i++) {
                        const x = easingFunction(i, startPosition, deltaPosition, drawSteps);
                        g.moveTo(x, -drawHeight / 2);
                        g.lineTo(x, drawHeight / 2);

                        if (i % 4 === 0) {
                          g.stroke({ width: 2, color: 0xfeeb77 });
                        } else {
                          g.stroke({ width: 0.6, color: 0xfeeb77 });
                        }
                      }
                    }}
                  />
                  <Sprite
                    ref={(container) => {
                      onMount(() => {
                        container.pivot.x = container.width / 2;
                        container.pivot.y = container.height / 2;
                      });
                    }}
                    texture={texture()}
                    x={easingFunction(pingPongTime(), startPosition, deltaPosition, animationDuration)}
                  />
                </Container>
              );
            }}
          </For>
        </Container>
      </Suspense>
    </Container>
  );
}
