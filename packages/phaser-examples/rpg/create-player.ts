import GridEngine, { GridEngineConfig } from 'grid-engine';
import characters from './characters.png?url';

const PLAYER = 'characters.png';

export const createPlayer = () => {
  const loadPlayer = (props: { load: Phaser.Loader.LoaderPlugin }) => {
    props.load.spritesheet(PLAYER, characters, {
      frameWidth: 26,
      frameHeight: 36
    });
  };

  let playerSprite: Phaser.GameObjects.Sprite;

  const create = (props: {
    tilemap: Phaser.Tilemaps.Tilemap;
    camera: Phaser.Cameras.Scene2D.Camera;
    add: Phaser.GameObjects.GameObjectFactory;
    gridEngine: GridEngine;
  }) => {
    playerSprite = props.add.sprite(0, 0, PLAYER);
    playerSprite.scale = 3;
    props.camera.startFollow(playerSprite);
    props.camera.setFollowOffset(-26, 0);
    props.camera.roundPixels = true;

    // Player Depth 8.0000048 (pixel depth) +- 48
    // 8.0000576
    const gridEngineConfig: GridEngineConfig = {
      characters: [
        {
          id: PLAYER,
          sprite: playerSprite,
          walkingAnimationMapping: 6,
          startPosition: { x: 8, y: 8 },
          charLayer: 'ground 1'
        }
      ],
      numberOfDirections: 8
    };

    props.gridEngine.create(props.tilemap, gridEngineConfig);
  };

  return {
    loadPlayer,
    create,
    charId: PLAYER,
    getDepth() {
      return playerSprite.depth;
    },
    setDepth(depth: number) {
      playerSprite.setDepth(depth);
    }
  };
};
