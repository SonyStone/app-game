import { TiledResource } from '@excaliburjs/plugin-tiled';
import { Actor, EasingFunctions, Engine, Keys, Loader, PointerScope, vec, Vector } from 'excalibur';
import { onCleanup } from 'solid-js';
import tiledMapUrl from './isometric-infinite.tmx?url';
import tilesetUrl from './Isometric_MedievalFantasy_Tiles.png?url';

console.log('tilesetUrl', tilesetUrl);

class Player extends Actor {
  override onPostUpdate(game: Engine) {
    this.vel = vec(0, 0);
    const speed = 64;
    if (game.input.keyboard.isHeld(Keys.Right)) {
      this.vel.x = speed;
    }
    if (game.input.keyboard.isHeld(Keys.Left)) {
      this.vel.x = -speed;
    }
    if (game.input.keyboard.isHeld(Keys.Up)) {
      this.vel.y = -speed;
    }
    if (game.input.keyboard.isHeld(Keys.Down)) {
      this.vel.y = speed;
    }
  }
}

export default function IsometricTileMaps() {
  const game = new Engine({
    width: 800,
    height: 600,
    pointerScope: PointerScope.Canvas,
    antialiasing: false
  });
  game.toggleDebug();
  // game.debug.isometric.showGrid = true;

  const tiledMap = new TiledResource(tiledMapUrl, {
    useMapBackgroundColor: true
  });

  const loader = new Loader([tiledMap]);

  let currentPointer!: Vector;
  game.input.pointers.primary.on('down', (moveEvent) => {
    currentPointer = moveEvent.worldPos;
    game.currentScene.camera.move(currentPointer, 300, EasingFunctions.EaseInOutCubic);
  });

  game.input.pointers.primary.on('move', (moveEvent) => {
    const tile = tiledMap.getTileByPoint('ground', moveEvent.worldPos);
    if (tile) {
      console.log(tile);
    }
  });

  game.input.pointers.primary.on('wheel', (wheelEvent) => {
    // wheel up
    game.currentScene.camera.pos = currentPointer;
    if (wheelEvent.deltaY < 0) {
      game.currentScene.camera.zoom *= 1.2;
    } else {
      game.currentScene.camera.zoom /= 1.2;
    }
  });

  game.start(loader).then(() => {
    tiledMap.addToScene(game.currentScene);
    currentPointer = game.currentScene.camera.pos;

    (window as any).tiledMap = tiledMap;
  });

  onCleanup(() => {
    game.stop();
    game.dispose();
  });

  return game.canvas;
}
