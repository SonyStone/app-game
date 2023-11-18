import { Game, GameObjects, Scene } from 'phaser';

import { World } from '@/ldtk-ts/index';
import cavernas from './Cavernas_by_Adam_Saltsman.png?url';
import incaBack2 from './Inca_back2_by_Kronbits.png?url';
import incaFront from './Inca_front_by_Kronbits-extended.png?url';
import basicLevel2 from './basic-level-2.ldtk?url';
import { createTilemap } from './create-tilemap';
import { createTileset } from './create-tileset';

class LDtkExample extends Scene {
  controls?: Phaser.Cameras.Controls.FixedKeyControl;

  constructor() {
    super();
  }

  preload() {
    this.load.image('cavernas', cavernas);
    this.load.image('incaBack2', incaBack2);
    this.load.image('incaFront', incaFront);
  }

  async create() {
    // this.add.image(400, 300, "bg");

    // You have access to the raw `LDtk` JSON file here
    const world = await World.loadRaw(basicLevel2);

    world.levels[0].layerInstances!;

    const map = createTilemap.call(this, world.levels[0]);

    const layer = map.createLayer('Walls', createTileset.call(this, world.defs.tilesets[0], 'incaFront'), 0, 0)!;

    const layer2 = map.createLayer('Background', createTileset.call(this, world.defs.tilesets[1], 'incaBack2'), 0, 0)!;

    console.log(`🟡 map`, map);
    console.log(`layer 1`, layer);
    console.log(`layer 2`, layer2);

    const sprites: GameObjects.Sprite[] = [];

    addControl.call(this);

    Phaser.Actions.GridAlign(sprites, {
      width: 12,
      cellWidth: 64,
      cellHeight: 120,
      x: 16,
      y: 4
    });
  }

  update(time: number, delta: number) {
    this.controls?.update(delta);
  }
}

function addControl(this: LDtkExample) {
  const cursors = this.input.keyboard!.createCursorKeys();
  const zoomIn = this.input.keyboard?.addKey('W');
  const zoomOut = this.input.keyboard?.addKey('S');
  const controlConfig: Phaser.Types.Cameras.Controls.FixedKeyControlConfig = {
    camera: this.cameras.main,
    left: cursors.left,
    right: cursors.right,
    up: cursors.up,
    down: cursors.down,
    zoomIn,
    zoomOut,
    speed: 0.5
  };

  this.controls = new Phaser.Cameras.Controls.FixedKeyControl(controlConfig);

  const help = this.add.text(16, 16, 'Arrows to scroll', {
    fontSize: '18px',
    padding: { x: 10, y: 5 },
    backgroundColor: '#000000',
    color: '#ffffff'
  });
  help.setScrollFactor(0);
}

function run() {
  return new Game({
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#2d2d2d',
    parent: 'phaser-example',
    pixelArt: true,
    scene: LDtkExample
  });
}

export default function App() {
  run();
  return <></>;
}
