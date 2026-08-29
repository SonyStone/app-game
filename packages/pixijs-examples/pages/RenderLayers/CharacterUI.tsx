import { Container, Graphics, RenderLayer, Text } from '@app-game/solid-pixi';
import { ContainerOptions, Container as _Container } from 'pixi.js';
import type { Accessor } from 'solid-js';
import { createSignal, createTrackedEffect, onCleanup } from 'solid-js';

export function CharacterUI(
  props: Partial<{ name: string; layer: ReturnType<typeof RenderLayer> }> & ContainerOptions
) {
  const padding = 10;
  const label = (
    <Text text={props.name} resolution={2} style={{ fontSize: 16, fill: 0x000000 }} anchor={0.5} />
  ) as ReturnType<typeof Text>;
  const [container, setContainer] = createSignal<_Container | undefined>(undefined, { ownedWrite: true });
  useAttachToRenderLayer(container, () => props.layer);

  return (
    <Container ref={setContainer} {...props}>
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

function useAttachToRenderLayer(
  container: Accessor<_Container | undefined>,
  layer: Accessor<ReturnType<typeof RenderLayer> | undefined>
) {
  let attachedLayer: ReturnType<typeof RenderLayer> | undefined;
  let attachedContainer: _Container | undefined;

  createTrackedEffect(() => {
    const nextContainer = container();
    const nextLayer = layer();

    if (nextContainer === attachedContainer && nextLayer === attachedLayer) {
      return;
    }

    if (attachedLayer && attachedContainer) {
      attachedLayer.detach(attachedContainer);
    }

    attachedContainer = nextContainer;
    attachedLayer = nextLayer;
    if (nextLayer && nextContainer) {
      nextLayer.attach(nextContainer);
    }
  });

  onCleanup(() => {
    if (attachedLayer && attachedContainer) {
      attachedLayer.detach(attachedContainer);
    }
  });
}
