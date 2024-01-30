import GridEngine, { Direction, GridEngineConfig } from 'grid-engine';
import Phaser, { Game, Scene } from 'phaser';
import { onCleanup } from 'solid-js';
import characters from './characters.png?url';
import cloudCityMap from './cloud-city-map.json?url';
import cloudCityTileset from './cloud_tileset/cloud_tileset.png?url';
import { CLOUD_CITY, CLOUD_CITY_TILED_JSON, CLOUD_CITY_TILESET_IMAGE, PLAYER } from './constants';

const LAYER = 'layer1';

export default function () {
  const canvas = (<canvas> </canvas>) as HTMLCanvasElement;
  document.body.style.overflow = 'hidden';

  const sceneConfig: Phaser.Types.Scenes.SettingsConfig = {
    active: false,
    visible: false,
    key: 'Game'
  };

  class GameScene extends Scene {
    // private gridControls!: GridControls;
    // private gridPhysics!: GridPhysics;
    private gridEngine!: GridEngine;

    constructor() {
      super(sceneConfig);
    }

    preload() {
      this.load.image(CLOUD_CITY_TILESET_IMAGE, cloudCityTileset);
      this.load.tilemapTiledJSON(CLOUD_CITY_TILED_JSON, cloudCityMap);

      // load player
      this.load.spritesheet(PLAYER, characters, {
        frameWidth: 26,
        frameHeight: 36
      });
    }

    tilemap!: Phaser.Tilemaps.Tilemap;
    marker!: Phaser.GameObjects.Graphics;

    create() {
      const cloudCityTilemap = this.make.tilemap({ key: CLOUD_CITY_TILED_JSON });
      const tiles = cloudCityTilemap.addTilesetImage(CLOUD_CITY, CLOUD_CITY_TILESET_IMAGE)!;
      for (let i = 0; i < cloudCityTilemap.layers.length; i++) {
        const layer = cloudCityTilemap.createLayer(i, CLOUD_CITY, 0, 0)!;
        layer.setDepth(i);
        layer.scale = 3;
      }
      this.tilemap = cloudCityTilemap;
      const layer = cloudCityTilemap.createBlankLayer(LAYER, tiles)!;
      layer.scale = 3;

      const playerSprite = this.add.sprite(0, 0, PLAYER);
      playerSprite.setDepth(2);
      playerSprite.scale = 3;
      this.cameras.main.startFollow(playerSprite);
      this.cameras.main.roundPixels = true;

      const gridEngineConfig: GridEngineConfig = {
        characters: [
          {
            id: PLAYER,
            sprite: playerSprite,
            walkingAnimationMapping: 6,
            startPosition: { x: 8, y: 8 }
          }
        ],
        numberOfDirections: 8
      };

      const marker = this.add.graphics();
      marker.lineStyle(2, 0x000000, 1);
      marker.strokeRect(0, 0, this.tilemap.tileWidth * layer.scaleX, this.tilemap.tileHeight * layer.scaleY);
      marker.visible = false;
      this.marker = marker;

      console.log(`forwardButtonDown`, this.input.activePointer.leftButtonDown());

      this.input.addListener('pointerdown', this.pointerdownHandler);

      this.gridEngine.create(cloudCityTilemap, gridEngineConfig);
    }

    pointerdownHandler = (event: Phaser.Input.Pointer) => {
      const tileXY = this.tilemap.worldToTileXY(event.worldX, event.worldY);
      if (tileXY) {
        const worldXY = this.tilemap.tileToWorldXY(tileXY.x, tileXY.y)!;
        this.marker.setPosition(worldXY.x, worldXY.y);
        this.marker.visible = true;
        this.gridEngine.moveTo(PLAYER, { x: tileXY.x, y: tileXY.y }, {});
      }
    };

    update(_time: number, delta: number) {
      const cursors = this.input.keyboard!.createCursorKeys();

      const keyBindings = {
        up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      };

      const isLeft = cursors.left.isDown || keyBindings.left.isDown;
      const isRight = cursors.right.isDown || keyBindings.right.isDown;
      const isUp = cursors.up.isDown || keyBindings.up.isDown;
      const isDown = cursors.down.isDown || keyBindings.down.isDown;

      const direction = getDirection(isUp, isRight, isDown, isLeft);

      this.gridEngine.move(PLAYER, direction);
    }

    destroy() {
      console.log(`destroy??`);
      this.input.removeListener('pointerdown', this.pointerdownHandler);
    }

    private createPlayerAnimation(name: string, startFrame: number, endFrame: number) {
      this.anims.create({
        key: name,
        frames: this.anims.generateFrameNumbers(PLAYER, {
          start: startFrame,
          end: endFrame
        }),
        frameRate: 10,
        repeat: -1,
        yoyo: true
      });
    }
  }

  const gameConfig: Phaser.Types.Core.GameConfig = {
    title: 'Sample',
    type: Phaser.WEBGL,
    canvas,
    render: {
      antialias: false
    },
    scene: GameScene,
    scale: {
      mode: Phaser.Scale.RESIZE
      // width: CANVAS_WIDTH,
      // height: CANVAS_HEIGHT,
      // autoCenter: Phaser.Scale.CENTER_BOTH
    },
    parent: 'game',
    backgroundColor: '#48C4F8',
    plugins: {
      scene: [
        {
          key: 'gridEngine',
          plugin: GridEngine,
          mapping: 'gridEngine'
        }
      ]
    }
  };

  const game = new Game(gameConfig);

  onCleanup(() => {
    (game.scene.keys.Game as GameScene).destroy();
    game.destroy(true);
    document.body.style.overflow = '';
  });

  return <>{canvas}</>;
}

/**
 * the order is the same as in css margin or padding
 * @param up
 * @param right
 * @param down
 * @param left
 * @returns
 */
function getDirection(up: boolean, right: boolean, down: boolean, left: boolean) {
  if (up && right) {
    return Direction.UP_RIGHT;
  } else if (right && down) {
    return Direction.DOWN_RIGHT;
  } else if (down && left) {
    return Direction.DOWN_LEFT;
  } else if (left && up) {
    return Direction.UP_LEFT;
  } else if (up) {
    return Direction.UP;
  } else if (right) {
    return Direction.RIGHT;
  } else if (down) {
    return Direction.DOWN;
  } else if (left) {
    return Direction.LEFT;
  }

  return Direction.NONE;
}
