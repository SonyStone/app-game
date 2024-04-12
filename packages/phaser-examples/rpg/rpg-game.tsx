import GridEngine, { Direction, MoveToResult, NoPathFoundStrategy } from 'grid-engine';
import Phaser, { Game, Scene } from 'phaser';
import { onCleanup, onMount } from 'solid-js';

import cloudCityMap from './cloud-city-map.json?url';

import CaptureMenu from '@packages/spector/embedded-frontend-2/capture-menu';
import { Spector } from '@packages/spector/spector';
import { Title } from '@solidjs/meta';
import { Portal } from 'solid-js/web';
import cloudCityTileset from './cloud_tileset/cloud_tileset.png?url';
import { CLOUD_CITY, CLOUD_CITY_TILED_JSON, CLOUD_CITY_TILESET_IMAGE } from './constants';
import { createBGClouds, loadBGClouds } from './create-bg-clouds';
import { createMarker } from './create-marker';
import { createPlayer } from './create-player';
import { createWaveAnimation } from './create-wave-animation';

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
    gridEngine!: GridEngine;
    private keyboardKeys!: {
      up1: Phaser.Input.Keyboard.Key;
      up2: Phaser.Input.Keyboard.Key;
      down1: Phaser.Input.Keyboard.Key;
      down2: Phaser.Input.Keyboard.Key;
      left1: Phaser.Input.Keyboard.Key;
      left2: Phaser.Input.Keyboard.Key;
      right1: Phaser.Input.Keyboard.Key;
      right2: Phaser.Input.Keyboard.Key;
      space: Phaser.Input.Keyboard.Key;
      shift: Phaser.Input.Keyboard.Key;
    };

    constructor() {
      super(sceneConfig);
    }

    preload() {
      this.load.image(CLOUD_CITY_TILESET_IMAGE, cloudCityTileset);
      this.load.tilemapTiledJSON(CLOUD_CITY_TILED_JSON, cloudCityMap);

      loadBGClouds({ load: this.load });
      this.player.loadPlayer(this);
    }

    tilemap!: Phaser.Tilemaps.Tilemap;
    marker!: {
      setPosition(x: number, y: number): void;
      remove(): void;
    };
    player = createPlayer();

    create() {
      const cloudCityTilemap = this.make.tilemap({ key: CLOUD_CITY_TILED_JSON, insertNull: true });
      const tiles = cloudCityTilemap.addTilesetImage(CLOUD_CITY, CLOUD_CITY_TILESET_IMAGE)!;
      for (let layerIndex = 0; layerIndex < cloudCityTilemap.layers.length; layerIndex++) {
        const tilemapLayer = cloudCityTilemap.createLayer(layerIndex, CLOUD_CITY, 0, 0)!;
        tilemapLayer.setDepth(layerIndex);
        tilemapLayer.scale = 3;
      }
      this.tilemap = cloudCityTilemap;
      const layer = cloudCityTilemap.createBlankLayer(LAYER, tiles)!;
      layer.scale = 3;

      this.player.create({
        ...this,
        tilemap: cloudCityTilemap,
        camera: this.cameras.main
      });
      this.marker = createMarker({ ...this, layer });

      createBGClouds({
        make: this.make,
        tweens: this.tweens
      });

      createWaveAnimation({
        tweens: this.tweens,
        tilemap: cloudCityTilemap
      });

      {
        const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
        const keyboardKeys = this.input.keyboard!.addKeys({
          up1: KeyCodes.UP,
          up2: KeyCodes.W,
          down1: KeyCodes.DOWN,
          down2: KeyCodes.S,
          left1: KeyCodes.LEFT,
          left2: KeyCodes.A,
          right1: KeyCodes.RIGHT,
          right2: KeyCodes.D,
          space: KeyCodes.SPACE,
          shift: KeyCodes.SHIFT
        }) as any;
        this.keyboardKeys = keyboardKeys;
      }

      this.input.addListener('pointerdown', this.pointerdownHandler);
    }

    pointerdownHandler = (event: Phaser.Input.Pointer) => {
      const tileXY = this.tilemap.worldToTileXY(event.worldX, event.worldY);

      if (tileXY) {
        const worldXY = this.tilemap.tileToWorldXY(tileXY.x, tileXY.y)!;
        this.marker.setPosition(worldXY.x, worldXY.y);
        this.gridEngine
          .moveTo(
            this.player.charId,
            { x: tileXY.x, y: tileXY.y },
            {
              noPathFoundStrategy: NoPathFoundStrategy.CLOSEST_REACHABLE
            }
          )
          .subscribe((e) => {
            if (e.result === MoveToResult.SUCCESS) {
              this.marker.remove();
            }
          });
      }
    };

    update(_time: number, delta: number) {
      const left = this.keyboardKeys.left1.isDown || this.keyboardKeys.left2.isDown;
      const right = this.keyboardKeys.right1.isDown || this.keyboardKeys.right2.isDown;
      const up = this.keyboardKeys.up1.isDown || this.keyboardKeys.up2.isDown;
      const down = this.keyboardKeys.down1.isDown || this.keyboardKeys.down2.isDown;
      const direction = getDirection(up, right, down, left);
      this.gridEngine.move(this.player.charId, direction);
    }

    destroy() {
      this.input.removeListener('pointerdown', this.pointerdownHandler);
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

  onMount(() => {
    const spector = new Spector();
    spector.displayUI();
  });

  onCleanup(() => {
    (game.scene.keys.Game as GameScene).destroy();
    game.destroy(true);
    document.body.style.overflow = '';
  });

  return (
    <>
      <Title>Uniform Buffer Objects</Title>
      <Portal>
        <CaptureMenu />
      </Portal>
      {canvas}
    </>
  );
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
