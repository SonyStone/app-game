import { Scene } from 'phaser';

import { onCleanup } from 'solid-js';
import kenny_platformer_64x64 from './kenny_platformer_64x64.png?url';
import multipleLayersMap from './multiple-layers.json?url';

class Example extends Scene {
  tileInfoText!: Phaser.GameObjects.Text;
  stuffLayer!: Phaser.Tilemaps.TilemapLayer;
  platformLayer!: Phaser.Tilemaps.TilemapLayer;
  waterLayer!: Phaser.Tilemaps.TilemapLayer;
  rockLayer!: Phaser.Tilemaps.TilemapLayer;
  map!: Phaser.Tilemaps.Tilemap;
  controls!: Phaser.Cameras.Controls.FixedKeyControl;

  preload() {
    this.load.image('kenny_platformer_64x64', kenny_platformer_64x64);
    this.load.tilemapTiledJSON('multiple-layers-map', multipleLayersMap);
  }

  create() {
    this.map = this.make.tilemap({ key: 'multiple-layers-map' });
    const tiles = this.map.addTilesetImage('kenny_platformer_64x64')!;

    this.rockLayer = this.map.createLayer('Rock Layer', tiles, 0, 0)!;
    this.waterLayer = this.map.createLayer('Water Layer', tiles, 0, 0)!;
    this.platformLayer = this.map.createLayer('Platform Layer', tiles, 0, 0)!;
    this.stuffLayer = this.map.createLayer('Stuff Layer', tiles, 0, 0)!;

    console.log(`tiles`, tiles);
    console.log(`map`, this.map);
    console.log(`rockLayer`, this.rockLayer);
    console.log(`waterLayer`, this.waterLayer);

    // When you create a layer, that becomes the currently 'selected' layer within the map. That
    // means any tile operation on the map right now will be operating on 'Stuff Layer'.

    // Let's change that:
    this.selectLayer(this.platformLayer);

    setupInput.call(this);
  }

  update(time: number, delta: number) {
    this.controls.update(delta);

    const cam = this.cameras.main;
    const worldPoint = this.input.activePointer.positionToCamera(cam) as Phaser.Math.Vector2;

    const mapHasTile = this.map.hasTileAtWorldXY(worldPoint.x, worldPoint.y);
    const platformLayerHasTile = this.platformLayer.hasTileAtWorldXY(worldPoint.x, worldPoint.y);

    // If you want to use the map and be specific, the last parameter is a layer id. All of the
    // following are valid ways to get something from the rock layer:
    //  map.hasTileAtWorldXY(worldPoint.x, worldPoint.y, cam, rockLayer)
    //  map.hasTileAtWorldXY(worldPoint.x, worldPoint.y, cam, 'Rock Layer')
    //  map.hasTileAtWorldXY(worldPoint.x, worldPoint.y, cam, 0)

    this.tileInfoText.setText(
      `Press 1/2/3/4 to change the map's selected layer\nMap's selected layer: ${
        this.map.layer.name
      }\nMap hasTileAt pointer: ${mapHasTile ? 'yes' : 'no'}\nPlatform layer hasTileAt pointer: ${
        platformLayerHasTile ? 'yes' : 'no'
      }`
    );
  }

  selectLayer(layer: Phaser.Tilemaps.TilemapLayer) {
    // You can use map.setLayer(...) or map.layer. Either can be set using a layer name, layer
    // index, StaticTilemapLayer/DynamicTilemapLayer.
    this.map.setLayer(layer);

    this.rockLayer.alpha = 0.5;
    this.waterLayer.alpha = 0.5;
    this.platformLayer.alpha = 0.5;
    this.stuffLayer.alpha = 0.5;

    layer.alpha = 1;
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1b262c',
  parent: 'phaser-example',
  pixelArt: true,
  scene: Example
};

function setupInput(this: Example) {
  this.cameras.main.setScroll(0, 1000);

  this.input.keyboard!.on('keydown-ONE', () => {
    this.selectLayer(this.rockLayer);
  });

  this.input.keyboard!.on('keydown-TWO', () => {
    this.selectLayer(this.waterLayer);
  });

  this.input.keyboard!.on('keydown-THREE', () => {
    this.selectLayer(this.platformLayer);
  });

  this.input.keyboard!.on('keydown-FOUR', () => {
    this.selectLayer(this.stuffLayer);
  });

  this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

  this.tileInfoText = this.add.text(16, 16, '', {
    fontSize: '18px',
    padding: { x: 10, y: 5 },
    backgroundColor: '#000000',
    color: '#ffffff'
  });
  this.tileInfoText.setScrollFactor(0);

  const cursors = this.input.keyboard!.createCursorKeys();
  const controlConfig = {
    camera: this.cameras.main,
    left: cursors.left,
    right: cursors.right,
    up: cursors.up,
    down: cursors.down,
    speed: 0.5
  };
  this.controls = new Phaser.Cameras.Controls.FixedKeyControl(controlConfig);
}

export default function App() {
  const game = new Phaser.Game(config);

  onCleanup(() => {
    game.destroy(true);
  });

  return <></>;
}
