import Phaser from 'phaser';
import bgCloud1 from './cloud_tileset/bg_cloud1.png';
import bgCloud2 from './cloud_tileset/bg_cloud2.png';

const BG_CLOUD1 = 'bg_cloud1';
const BG_CLOUD2 = 'bg_cloud2';

export function loadBGClouds(props: { load: Phaser.Loader.LoaderPlugin }) {
  props.load.image(BG_CLOUD1, bgCloud1);
  props.load.image(BG_CLOUD2, bgCloud2);
}

export function createBGClouds(props: {
  make: Phaser.GameObjects.GameObjectCreator;
  tweens: Phaser.Tweens.TweenManager;
}) {
  const bgClouds = [BG_CLOUD2, BG_CLOUD1];
  try {
    bgClouds.map((key, index) => {
      const tileSprite = props.make.tileSprite({
        x: 0,
        y: 800,
        width: 176 * 1000,
        height: 176,
        key: key
      });
      tileSprite.scale = 3;
      tileSprite.scrollFactorY = (index + 1) * 0.25;
      tileSprite.scrollFactorX = (index + 1) * 0.25;
      tileSprite.tilePositionX = 100;
      tileSprite.setDepth(-2);
      const tween = props.tweens.add({
        targets: tileSprite,
        tilePositionX: { from: 0, to: 176 },
        ease: 'liner',
        duration: 100000 + index * 5000,
        repeat: -1
      });
      return tileSprite;
    });
  } catch (e) {
    console.error(e);
  }
}
