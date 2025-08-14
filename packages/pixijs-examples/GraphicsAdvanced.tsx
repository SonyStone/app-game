import { Container, Graphics, useAsset } from '@packages/solid-pixi';
import { ContainerOptions } from 'pixi.js';
import { Show } from 'solid-js';

export default function GraphicsAdvanced(props: Omit<ContainerOptions, 'children'>) {
  const [texture] = useAsset('https://pixijs.com/assets/bg_rotate.jpg');

  return (
    <Container {...props}>
      {/* BEZIER CURVE */}
      {/* information: https://en.wikipedia.org/wiki/Bézier_curve */}
      <Graphics
        ref={(realPath) => {
          realPath.moveTo(0, 0);
          realPath.lineTo(100, 200);
          realPath.lineTo(200, 200);
          realPath.lineTo(240, 100);
          realPath.stroke({ width: 2, color: 0xffffff });

          realPath.position.x = 50;
          realPath.position.y = 50;
        }}
      />
      <Graphics
        ref={(bezier) => {
          bezier.bezierCurveTo(100, 200, 200, 200, 240, 100);
          bezier.stroke({ width: 5, color: 0xaa0000 });

          bezier.position.x = 50;
          bezier.position.y = 50;
        }}
      />
      {/* BEZIER CURVE 2 */}
      <Graphics
        ref={(realPath2) => {
          realPath2.moveTo(0, 0);
          realPath2.lineTo(0, -100);
          realPath2.lineTo(150, 150);
          realPath2.lineTo(240, 100);
          realPath2.stroke({ width: 2, color: 0xffffff });

          realPath2.position.x = 320;
          realPath2.position.y = 150;
        }}
      />
      <Show when={texture()}>
        <Graphics
          ref={(bezier2) => {
            bezier2.bezierCurveTo(0, -100, 150, 150, 240, 100);
            bezier2.stroke({ width: 10, texture: texture() });

            bezier2.position.x = 320;
            bezier2.position.y = 150;
          }}
        />
      </Show>
      {/* ARC */}
      <Graphics
        ref={(arc) => {
          arc.arc(600, 100, 50, Math.PI, 2 * Math.PI);
          arc.stroke({ width: 5, color: 0xaa00bb });
        }}
      />
      {/* ARC 2 */}
      <Graphics
        ref={(arc2) => {
          arc2.arc(650, 270, 60, 2 * Math.PI, (3 * Math.PI) / 2);
          arc2.stroke({ width: 6, color: 0x3333dd });
        }}
      />
      {/* ARC 3 */}
      <Show when={texture()}>
        <Graphics
          ref={(arc3) => {
            arc3.arc(650, 420, 60, 2 * Math.PI, (2.5 * Math.PI) / 2);
            arc3.stroke({ width: 20, texture: texture() });
          }}
        />
      </Show>

      {/* Hole */}
      <Graphics
        ref={(rectAndHole) => {
          rectAndHole.rect(350, 350, 150, 150);
          rectAndHole.fill(0x00ff00);
          rectAndHole.circle(375, 375, 25);
          rectAndHole.circle(425, 425, 25);
          rectAndHole.circle(475, 475, 25);
          rectAndHole.cut();
        }}
      />

      {/* Line Texture Style */}
      <Show when={texture()}>
        <Graphics
          ref={(beatifulRect) => {
            beatifulRect.rect(80, 350, 150, 150);
            beatifulRect.fill(0xff0000);
            beatifulRect.stroke({ width: 20, texture: texture() });
          }}
        />
      </Show>
    </Container>
  );
}
