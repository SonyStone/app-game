import { Application, Assets, Sprite } from 'pixi.js';
import { onCleanup, onMount } from 'solid-js';

export default function PixijsExamlesBasic() {
  const canvas = (<canvas class="touch-none" />) as HTMLCanvasElement;

  // Create a new application
  const app = new Application();

  onMount(async () => {
    // Initialize the application
    await app.init({ background: '#1099bb', resizeTo: window, canvas: canvas });

    // Create a bunny Sprite
    const bunny = new Sprite();
    // Load the bunny texture
    Assets.load('https://pixijs.com/assets/bunny.png').then((texture) => {
      bunny.texture = texture;
    });

    // Center the sprite's anchor point
    bunny.anchor.set(0.5);

    // Move the sprite to the center of the screen
    bunny.x = app.screen.width / 2;
    bunny.y = app.screen.height / 2;

    app.stage.addChild(bunny);

    // Listen for animate update
    app.ticker.add((time) => {
      // Just for fun, let's rotate mr rabbit a little.
      // * Delta is 1 if running at 100% performance *
      // * Creates frame-independent transformation *
      bunny.rotation += 0.1 * time.deltaTime;
    });
  });

  onCleanup(() => {
    app.destroy();
  });

  return <>{canvas}</>;
}
