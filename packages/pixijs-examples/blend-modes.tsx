import { Container, Sprite, useApplication, useAsset } from '@packages/solid-pixi';
import { BLEND_MODES, Ticker } from 'pixi.js';
import 'pixi.js/advanced-blend-modes';
import { For, Suspense } from 'solid-js';
import pandaUrl from './panda.png?url';
import rainbowGradientUrl from './rainbow-gradient.png?url';

export default function PixijsExamlesBlendModes() {
  const allBlendModes: BLEND_MODES[] = [
    'normal',
    'add',
    'screen',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'linear-burn',
    'linear-dodge',
    'linear-light',
    'hard-light',
    'soft-light',
    'pin-light',
    'difference',
    'exclusion',
    'overlay',
    'saturation',
    'color',
    'luminosity',
    'add-npm',
    'subtract',
    'divide',
    'vivid-light',
    'hard-mix',
    'negation'
  ];

  const size = 800 / 5;
  const app = useApplication();
  const [pandaTexture] = useAsset(pandaUrl);
  const [rainbowGradient] = useAsset(rainbowGradientUrl);

  const pandas = allBlendModes.map((blendMode) => ({
    blendMode
  }));

  return (
    <Suspense>
      <For each={pandas}>
        {(panda, index) => (
          <Container x={(index() % 5) * size} y={Math.floor(index() / 5) * size}>
            <Sprite
              ref={(panda) => {
                const handler = (delta: Ticker) => {
                  panda.rotation += 0.01 * (index() % 2 ? 1 : -1) * delta.deltaTime;
                };
                app.ticker.add(handler);
                return () => {
                  app.ticker.remove(handler);
                };
              }}
              texture={pandaTexture()}
              width={100}
              height={100}
              anchor={0.5}
              position={{ x: size / 2, y: size / 2 }}
            />
            <Sprite texture={rainbowGradient()} width={size} height={size} blendMode={panda.blendMode} />
          </Container>
        )}
      </For>
    </Suspense>
  );
}
