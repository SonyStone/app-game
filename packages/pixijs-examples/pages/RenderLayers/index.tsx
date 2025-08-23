import { Container, RenderLayer, Sprite, TilingSprite, useAssets } from '@packages/solid-pixi';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { DisplacementFilter, Texture } from 'pixi.js';
import { createMemo, For } from 'solid-js';
import { useTick as useTicker } from '../../useTick';
import { Fish } from './Fish';

const NAMES = ['Alice', 'Bob', 'Caroline', 'David', 'Ellie', 'Frank', 'Gloria', 'Henry', 'Isabel', 'Jack'] as const;

const TEXTURES = [
  'https://pixijs.com/assets/pond/displacement_fish1.png',
  'https://pixijs.com/assets/pond/displacement_fish2.png'
];
const SIZE = { width: 630, height: 410 } as const;

export default function RenderLayers() {
  const [assets] = useAssets<Record<string, Texture>>([
    `https://pixijs.com/assets/pond/displacement_BG.jpg`,
    `https://pixijs.com/assets/pond/overlay.png`,
    `https://pixijs.com/assets/pond/displacement_map.png`,
    `https://pixijs.com/assets/pond/displacement_fish1.png`,
    `https://pixijs.com/assets/pond/displacement_fish2.png`
  ]);

  // displacementMap.source.wrapMode = 'repeat';
  const size = createWindowSize();

  const displacementSpriteTexture = createMemo(() => {
    const texture = assets()?.['https://pixijs.com/assets/pond/displacement_map.png'];
    if (!texture) return undefined;
    texture.source.addressMode = 'repeat';
    return texture;
  });

  const displacementSprite = (<Sprite texture={displacementSpriteTexture()} />) as ReturnType<typeof Sprite>;
  const displacementFilter = new DisplacementFilter({
    sprite: displacementSprite,
    scale: 40
  });

  const fishes = Array.from({ length: 10 }, () => ({ x: Math.random() * SIZE.width, y: Math.random() * SIZE.height }));

  const waterOverlay = (
    <TilingSprite
      texture={assets()?.['https://pixijs.com/assets/pond/overlay.png']}
      width={SIZE.width}
      height={SIZE.height}
    />
  ) as ReturnType<typeof TilingSprite>;

  // Animate the mask
  useTicker(() => {
    const _waterOverlay = waterOverlay;
    _waterOverlay.tilePosition.x += 0.5;
    _waterOverlay.tilePosition.y += 0.5;

    const _displacementSprite = displacementSprite;

    _displacementSprite.x += 0.5;
    _displacementSprite.y += 0.5;
  });

  const uiLayer = (<RenderLayer />) as ReturnType<typeof RenderLayer>;

  return (
    <Container>
      <Container pivot={{ x: 100 * 3, y: 100 * 3 }} x={size.width / 2} y={size.height / 2} filters={displacementFilter}>
        {/* background */}
        <Sprite texture={assets()?.['https://pixijs.com/assets/pond/displacement_BG.jpg']} />
        {displacementSprite}
        <For each={fishes}>
          {(fish, index) => (
            <Fish
              name={NAMES[index() % NAMES.length]}
              texture={assets()?.[TEXTURES[index() % TEXTURES.length]]}
              x={fish.x}
              y={fish.y}
              layer={uiLayer}
            />
          )}
        </For>
      </Container>
      {uiLayer}
    </Container>
  );
}
