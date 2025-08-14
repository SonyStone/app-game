import { Container, Sprite, useApplication, useAsset } from '@packages/solid-pixi';
import { Ticker } from 'pixi.js';
import { For, onMount, Suspense } from 'solid-js';

export default function BasicContainer() {
  const app = useApplication();
  const [texture] = useAsset('https://pixijs.com/assets/bunny.png');

  const store = Array.from({ length: 50 }, () => ({ x: 0, y: 0 })).map((_, i) => ({
    x: (i % 5) * 40,
    y: Math.floor(i / 5) * 40
  }));

  return (
    <Suspense>
      text
      <Container
        ref={(container) => {
          onMount(() => {
            container.pivot.x = container.width / 2;
            container.pivot.y = container.height / 2;
          });
          const handler = (delta: Ticker) => {
            // Rotate the container
            container.rotation -= 0.01 * delta.deltaTime;
          };
          app.ticker.add(handler);
          return () => {
            app.ticker.remove(handler);
          };
        }}
        x={app.screen.width / 2}
        y={app.screen.height / 2}
      >
        <For each={store}>{(item) => <Sprite texture={texture()} x={item.x} y={item.y} />}</For>
      </Container>
    </Suspense>
  );
}
