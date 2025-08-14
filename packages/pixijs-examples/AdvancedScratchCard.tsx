import { Container, Sprite, useApplication, useAssets } from '@packages/solid-pixi';
import { FederatedPointerEvent, Graphics, Point, RenderTexture, Texture } from 'pixi.js';

export default function AdvancedScratchCard() {
  const app = useApplication();
  const [assets] = useAssets<Record<string, Texture>>([
    'https://pixijs.com/assets/bg_grass.jpg',
    'https://pixijs.com/assets/bg_rotate.jpg'
  ]);

  const { width, height } = app.screen;
  const stageSize = { width, height };

  const renderTexture = RenderTexture.create(stageSize);

  const brush = new Graphics().circle(0, 0, 50).fill({ color: 0xffffff });
  const line = new Graphics();
  let dragging = false;
  let lastDrawnPoint: Point | null = null;

  function pointerMove({ global: { x, y } }: FederatedPointerEvent) {
    if (dragging) {
      brush.position.set(x, y);
      app.renderer.render({
        container: brush,
        target: renderTexture,
        clear: false,
        skipUpdateTransform: false
      });
      // Smooth out the drawing a little bit to make it look nicer
      // this connects the previous drawn point to the current one
      // using a line
      if (lastDrawnPoint) {
        line.clear().moveTo(lastDrawnPoint.x, lastDrawnPoint.y).lineTo(x, y).stroke({ width: 100, color: 0xffffff });
        app.renderer.render({
          container: line,
          target: renderTexture,
          clear: false,
          skipUpdateTransform: false
        });
      }
      lastDrawnPoint = lastDrawnPoint || new Point();
      lastDrawnPoint.set(x, y);
    }
  }

  function pointerDown(event: FederatedPointerEvent) {
    dragging = true;
    pointerMove(event);
  }

  function pointerUp() {
    dragging = false;
    lastDrawnPoint = null;
  }

  const renderTextureSprite = (
    <Sprite
      texture={renderTexture}
      anchor={0.5}
      x={stageSize.width / 2}
      y={stageSize.height / 2}
      width={stageSize.width}
      height={stageSize.height}
    />
  ) as ReturnType<typeof Sprite>;

  return (
    <Container
      onpointerdown={pointerDown}
      onpointerup={pointerUp}
      onpointermove={pointerMove}
      onpointerupoutside={pointerUp}
      eventMode="static"
      interactive
      // hitArea={app.screen}
    >
      {/* background */}
      <Sprite
        texture={assets()?.['https://pixijs.com/assets/bg_grass.jpg']}
        anchor={0.5}
        width={stageSize.width}
        height={stageSize.height}
        x={stageSize.width / 2}
        y={stageSize.height / 2}
      />
      {/* imageToReveal */}
      <Sprite
        texture={assets()?.['https://pixijs.com/assets/bg_rotate.jpg']}
        anchor={0.5}
        mask={renderTextureSprite}
        width={stageSize.width}
        height={stageSize.height}
        x={stageSize.width / 2}
        y={stageSize.height / 2}
      />
      {/* renderTextureSprite */}
      {renderTextureSprite}
    </Container>
  );
}
