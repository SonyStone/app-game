import { Container, HTMLText, Sprite, useApplication, useAsset } from '@packages/solid-pixi';
import { Ticker } from 'pixi.js';
import { Suspense } from 'solid-js';
import ParticleContainerExample from './ParticleContainerExample';
import { useTick } from './useTick';

export default function BasicExample() {
  const app = useApplication();
  const [texture] = useAsset('https://pixijs.com/assets/bunny.png');

  return (
    <Container>
      <Suspense>
        <ParticleContainerExample />
        <HTMLTextExample />
        <Sprite
          ref={(bunny) => {
            useTick((delta: Ticker) => {
              // Just for fun, let's rotate mr rabbit a little.
              // * Delta is 1 if running at 100% performance *
              // * Creates frame-independent transformation *
              bunny.rotation += 0.1 * delta.deltaTime;
            });
          }}
          texture={texture()}
          anchor={0.5}
          x={app.screen.width / 2}
          y={app.screen.height / 2}
        />
      </Suspense>
    </Container>
  );
}

function HTMLTextExample() {
  const app = useApplication();
  const html = (
    <div>
      <div class="title">Welcome</div>
      <div class="content">
        This text supports:
        <ul>
          <li>✨ Emojis</li>
          <li>🎨 Custom CSS</li>
          <li>📏 Auto-sizing</li>
        </ul>
      </div>
    </div>
  ) as HTMLDivElement;

  return (
    <HTMLText
      text={html.innerHTML}
      style={{
        fontSize: 24,
        fill: '#334455',
        cssOverrides: ['.title { font-size: 32px; color: red; }', '.content { line-height: 1.5; }'],
        wordWrap: true,
        wordWrapWidth: 300,
        align: 'center'
      }}
      anchor={{ x: 0.5, y: 0 }}
      x={app.screen.width / 2}
      y={app.screen.height / 2}
    />
  );
}
