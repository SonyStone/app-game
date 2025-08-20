import { Color, DisplayMode, Engine, Loader, vec } from 'excalibur';
import { onCleanup } from 'solid-js';
import { Level } from './level';
import { Resources } from './resources';
import { initMuteButton } from './ui';

export default function FlappyBird() {
  const game = new Engine({
    width: 400,
    height: 500,
    backgroundColor: Color.fromHex('#54C0CA'),
    pixelArt: true,
    pixelRatio: 2,
    displayMode: DisplayMode.FitScreen,
    scenes: { Level }
  });

  const loader = new Loader(Object.values(Resources));
  game.start(loader).then(() => {
    game.goToScene('Level');
    positionUI(game);
    initMuteButton();
  });

  game.screen.events.on('resize', () => positionUI(game));

  onCleanup(() => {
    game.dispose();
  });

  return game.canvas as HTMLCanvasElement;
}

const positionUI = (game: Engine) => {
  const ui = document.getElementsByClassName('ui')[0] as HTMLElement;
  if (ui) {
    const topLeft = game.screen.screenToPageCoordinates(vec(10, 500 - 40));
    ui.style.visibility = 'visible';
    ui.style.left = topLeft.x + 'px';
    ui.style.top = topLeft.y + 'px';
  }
};
