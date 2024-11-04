import { Application, Assets, Container, Sprite } from 'pixi.js';
import { onCleanup, onMount } from 'solid-js';

export default function BasicContainer() {
  const canvas = (<canvas class="touch-none" />) as HTMLCanvasElement;

  // Create a new application
  const app = new Application();

  onMount(async () => {
    // Initialize the application
    await app.init({ background: '#1099bb', resizeTo: window, canvas: canvas });

    const container = new Container();

    app.stage.addChild(container);

    const texture = await Assets.load('https://pixijs.com/assets/bunny.png');

    for (let i = 0; i < 25; i++) {
      const bunny = new Sprite(texture);

      bunny.x = (i % 5) * 40;
      bunny.y = Math.floor(i / 5) * 40;
      container.addChild(bunny);
    }

    container.x = app.screen.width / 2;
    container.y = app.screen.height / 2;

    container.pivot.x = container.width / 2;
    container.pivot.y = container.height / 2;

    app.ticker.add((time) => {
      container.rotation -= 0.01 * time.deltaTime;
    });
  });

  onCleanup(() => {
    app.destroy();
  });

  return <>{canvas}</>;
}
