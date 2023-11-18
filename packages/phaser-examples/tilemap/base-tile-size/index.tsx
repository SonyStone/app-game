import { Cameras, Game, Scene, WEBGL } from 'phaser';
import { onCleanup } from 'solid-js';
import walls_1x2 from './walls_1x2.png?url';

class Example extends Scene {
  controls!: Cameras.Controls.FixedKeyControl;

  preload() {
    this.load.image('walls_1x2', walls_1x2);
  }

  create() {
    // Load a blank map with a 32 x 32 px tile size. This is the base tile size. This means that
    // tiles in the map will be placed on a 32 x 32 px grid.
    const map = this.make.tilemap({
      width: 200,
      height: 200,
      tileWidth: 32,
      tileHeight: 32
    });

    // You can also change the base tile size of map like this:
    // map.setBaseTileSize(32, 32);

    // Load a 32 x 64 px tileset. This tileset was designed to allow tiles to overlap vertically, so
    // placing them on a 32 x 32 grid is exactly what we want.
    const tiles = map.addTilesetImage('walls_1x2', undefined, 32, 64)!;

    // Create a layer filled with random trees
    const layer = map.createBlankLayer('layer1', tiles)!;

    layer.randomize(0, 0, map.width, map.height, [0, 1, 2, 3, 4, 5, 6, 7]);

    console.log(layer);
    console.log(layer.layer);

    const cursors = this.input.keyboard!.createCursorKeys();
    const controlConfig = {
      camera: this.cameras.main,
      left: cursors.left,
      right: cursors.right,
      up: cursors.up,
      down: cursors.down,
      speed: 0.5
    };
    this.controls = new Cameras.Controls.FixedKeyControl(controlConfig);

    const help = this.add.text(16, 16, 'Arrows to scroll', {
      fontSize: '18px',
      padding: { x: 10, y: 5 },
      backgroundColor: '#000000',
      color: '#ffffff'
    });
    help.setScrollFactor(0);
  }

  update(time: number, delta: number) {
    this.controls.update(delta);
  }
}

const config = {
  type: WEBGL,
  width: 800,
  height: 600,
  backgroundColor: '#ffffff',
  parent: 'phaser-example',
  pixelArt: true,
  scene: Example
};

export default function App() {
  const game = new Game(config);

  onCleanup(() => {
    game.destroy(true);
  });

  return <></>;
}
