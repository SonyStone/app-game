import { Container, Graphics, Text } from '@app-game/solid-pixi';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { useLocation, useNavigate } from '@solidjs/router';
import { Graphics as PixiGraphics, Rectangle, Text as PixiText, TextStyle } from 'pixi.js';
import { createEffect } from 'solid-js';

export default function StartMenuScene() {
  const size = createWindowSize();
  const location = useLocation();
  const navigate = useNavigate();

  let background!: PixiGraphics;
  let title!: PixiText;
  let subtitle!: PixiText;
  let button!: PixiGraphics;
  let buttonText!: PixiText;

  createEffect(() => {
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    const centerX = width / 2;
    const centerY = height / 2;
    const buttonWidth = Math.min(320, width - 48);
    const buttonHeight = 68;

    background
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: 0x07110d })
      .circle(centerX, height * 0.74, Math.min(width, height) * 0.24)
      .stroke({ color: 0x1f6b46, alpha: 0.28, width: 2 });

    title.x = centerX;
    title.y = Math.max(86, height * 0.22);
    subtitle.x = centerX;
    subtitle.y = title.y + 70;
    button.x = centerX - buttonWidth / 2;
    button.y = centerY + 44;
    button.clear().roundRect(0, 0, buttonWidth, buttonHeight, 8).fill({ color: 0x34d399 }).stroke({
      color: 0xd1fae5,
      alpha: 0.86,
      width: 2
    });
    buttonText.x = centerX;
    buttonText.y = button.y + buttonHeight / 2;
  });

  return (
    <Container
      eventMode="static"
      interactive
      hitArea={new Rectangle(0, 0, Math.max(1, size.width), Math.max(1, size.height))}
      onpointerdown={() => navigate(playPath(location.pathname))}
    >
      <Graphics
        ref={(graphics) => {
          background = graphics;
        }}
      />
      <Text
        ref={(text) => {
          title = text;
        }}
        text="Night Defense"
        anchor={0.5}
        style={
          new TextStyle({
            align: 'center',
            fill: '#ecfdf5',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 52,
            fontWeight: '900',
            letterSpacing: 0,
            stroke: { color: '#020403', width: 8 }
          })
        }
      />
      <Text
        ref={(text) => {
          subtitle = text;
        }}
        text={'Clear the night so the tower can see.\nSurvive until dawn.'}
        anchor={0.5}
        style={
          new TextStyle({
            align: 'center',
            fill: '#a7f3d0',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 21,
            fontWeight: '700',
            letterSpacing: 0,
            lineHeight: 30,
            stroke: { color: '#020403', width: 5 }
          })
        }
      />
      <Graphics
        ref={(graphics) => {
          button = graphics;
        }}
      />
      <Text
        ref={(text) => {
          buttonText = text;
        }}
        text="Start Night"
        anchor={0.5}
        style={
          new TextStyle({
            align: 'center',
            fill: '#03120b',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 23,
            fontWeight: '900',
            letterSpacing: 0
          })
        }
      />
    </Container>
  );
}

function playPath(pathname: string) {
  const base = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  return base.length === 0 ? '/play' : `${base}/play`;
}
