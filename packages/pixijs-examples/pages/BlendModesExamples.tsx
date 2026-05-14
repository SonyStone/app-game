import { Container, Sprite, useApplication, useAsset } from '@app-game/solid-pixi';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { BLEND_MODES, Ticker } from 'pixi.js';
import 'pixi.js/advanced-blend-modes';
import { For, Suspense } from 'solid-js';
import pandaUrl from './panda.png?url';
import rainbowGradientUrl from './rainbow-gradient.png?url';

export default function PixijsBlendModesExamles() {
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

  const sizePerItem = 800 / 6;
  const app = useApplication();
  const size = createWindowSize();
  const [pandaTexture] = useAsset(pandaUrl);
  const [rainbowGradient] = useAsset(rainbowGradientUrl);

  const pandas = allBlendModes.map((blendMode) => ({
    blendMode
  }));

  return (
    <Container>
      <Suspense>
        <Container pivot={{ x: 100 * 3, y: 100 * 3 }} x={size.width / 2} y={size.height / 2}>
          <For each={pandas}>
            {(panda, index) => (
              <Container x={(index() % 5) * sizePerItem} y={Math.floor(index() / 5) * sizePerItem}>
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
                  position={{ x: sizePerItem / 2, y: sizePerItem / 2 }}
                />
                <Sprite
                  texture={rainbowGradient()}
                  width={sizePerItem}
                  height={sizePerItem}
                  blendMode={panda.blendMode}
                />
              </Container>
            )}
          </For>
        </Container>
      </Suspense>
    </Container>
  );
}
