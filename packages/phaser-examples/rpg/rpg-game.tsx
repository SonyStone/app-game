import GridEngine, { Direction, GridEngineConfig, MoveToResult, NoPathFoundStrategy } from 'grid-engine';
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
    private gridEngine!: GridEngine;
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

      // load player
      this.load.spritesheet(PLAYER, characters, {
        frameWidth: 26,
        frameHeight: 36
      });
    }

    tilemap!: Phaser.Tilemaps.Tilemap;
    marker!: {
      setPosition(x: number, y: number): void;
      remove(): void;
    };

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

      console.log(`cloudCityTilemap`, cloudCityTilemap);

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

      this.marker = createMarker({ ...this, layer });

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

      this.gridEngine.create(cloudCityTilemap, gridEngineConfig);
    }

    pointerdownHandler = (event: Phaser.Input.Pointer) => {
      const tileXY = this.tilemap.worldToTileXY(event.worldX, event.worldY);

      if (tileXY) {
        const worldXY = this.tilemap.tileToWorldXY(tileXY.x, tileXY.y)!;
        this.marker.setPosition(worldXY.x, worldXY.y);
        this.gridEngine
          .moveTo(
            PLAYER,
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
      this.gridEngine.move(PLAYER, direction);
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

function createMarker(props: {
  tweens: Phaser.Tweens.TweenManager;
  add: Phaser.GameObjects.GameObjectFactory;
  tilemap: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
}) {
  const markers = [0, 100, 200];
  const markerContainer = props.add.container();
  // const markerTweens: Phaser.Tweens.TweenChain[] = [];
  const markerTweens: Phaser.Tweens.Tween[] = [];
  for (const iterator of markers) {
    const marker = props.add.graphics();
    marker.lineStyle(3, 0xffffdd, 1);
    const width = props.tilemap.tileWidth * props.layer.scaleX;
    const height = props.tilemap.tileHeight * props.layer.scaleY;
    const x = width / 2;
    const y = height / 2;
    marker.strokeRect(-x, -y, width, height);
    marker.setPosition(x, y);

    marker.displayOriginX = 1000;
    marker.alpha = 0;
    marker.blendMode = Phaser.BlendModes.ADD;
    // marker.postFX.addBloom();
    markerContainer.add(marker);

    const markerTween = props.tweens.add({
      targets: marker,
      delay: iterator,
      paused: true,
      scale: { from: 1.2, to: 0.8 },
      y: { from: -20, to: y + 10 },
      alpha: { from: 0, to: 1 },
      ease: 'quad.out',
      duration: 550,
      repeat: -1
    });

    markerTweens.push(markerTween);
  }

  markerContainer.setVisible(false);
  markerContainer.setDepth(10);

  const show = props.tweens.add({
    targets: markerContainer,
    paused: true,
    alpha: { from: 0, to: 1 },
    onStart() {
      for (const tween of markerTweens) {
        tween.restart();
      }
    },
    ease: 'quad.out',
    duration: 250,
    persist: true
  });
  const hide = props.tweens.add({
    targets: markerContainer,
    paused: true,
    alpha: { from: 1, to: 0 },
    onComplete() {
      markerContainer.setVisible(false);
      for (const tween of markerTweens) {
        tween.pause();
      }
    },
    ease: 'quad.out',
    duration: 250,
    persist: true
  });

  return {
    setPosition(x: number, y: number) {
      markerContainer.setVisible(true);
      markerContainer.setPosition(x, y);

      show.restart();
    },
    remove() {
      hide.restart();
    }
  };
}