import { Container, Graphics, RenderLayer, Text } from '@app-game/solid-pixi';
import { ContainerOptions, Container as _Container } from 'pixi.js';
import { createEffect, onCleanup } from 'solid-js';

export function CharacterUI(
  props: Partial<{ name: string; layer: ReturnType<typeof RenderLayer> }> & ContainerOptions
) {
  const padding = 10;
  const label = (
    <Text text={props.name} resolution={2} style={{ fontSize: 16, fill: 0x000000 }} anchor={0.5} />
  ) as ReturnType<typeof Text>;

  return (
    <Container
      ref={(ref) => {
        useAttachToRenderLayer(ref, { layer: props.layer });
      }}
      {...props}
    >
      <Graphics
        ref={(bg) => {
          bg.roundRect(
            -label.width / 2 - padding,
            -label.height / 2 - padding,
            label.width + padding * 2,
            label.height + padding * 2,
            20
          ).fill({ color: 0xffff00, alpha: 1 });
        }}
      />
      {label}
    </Container>
  );
}

function useAttachToRenderLayer(container: _Container, props: { layer?: ReturnType<typeof RenderLayer> }) {
  createEffect(() => {
    props.layer?.attach(container);
  });

  onCleanup(() => {
    props.layer?.detach(container);
  });
}
