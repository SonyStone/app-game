import { Container, RenderLayer, Sprite } from '@packages/solid-pixi';
import { ContainerOptions, Texture } from 'pixi.js';
import { splitProps } from 'solid-js';
import { useTick } from '../../useTick';
import { CharacterUI } from './CharacterUI';

export function Fish(
  props: Partial<{
    name: string;
    texture: Texture;
    layer: ReturnType<typeof RenderLayer>;
  }> &
    ContainerOptions
) {
  const [local, rest] = splitProps(props, ['name', 'texture', 'layer']);

  const ui = (<CharacterUI name={local.name ?? ''} y={0} layer={local.layer} />) as ReturnType<typeof CharacterUI>;
  const fishView = (<Sprite texture={local.texture} anchor={0.5} />) as ReturnType<typeof Sprite>;
  const container = (
    <Container cullable {...rest}>
      {fishView}
      {ui}
    </Container>
  ) as ReturnType<typeof Container>;

  const speed = 1 + Number(Math.random());
  let direction = Math.random() * Math.PI * 2;

  function update() {
    direction += 0.001;

    fishView.rotation = Math.PI - direction;
    container.x += speed * Math.cos(-direction);
    container.y += speed * Math.sin(-direction);

    // wrap around the screen
    const padding = 100;
    const width = 630;
    const height = 410;

    if (container.x > width + padding) container.x -= width + padding * 2;
    if (container.x < -padding) container.x += width + padding * 2;
    if (container.y > height + padding) container.y -= height + padding * 2;
    if (container.y < -padding) container.y += height + padding * 2;
  }

  useTick(update);

  return container;
}
