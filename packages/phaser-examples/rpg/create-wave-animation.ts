import Phaser from 'phaser';

const ANIMATED_LAYER = 'clouds_1';
const ANIMATED_LAYER_2 = 'clouds_2';

export function createWaveAnimation(props: { tilemap: Phaser.Tilemaps.Tilemap; tweens: Phaser.Tweens.TweenManager }) {
  {
    const layers = [ANIMATED_LAYER, ANIMATED_LAYER_2].map((layerName) => props.tilemap.getLayer(layerName));

    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const data = layers[layerIndex]?.data!;

      for (let xIndex = 0; xIndex < data.length; xIndex++) {
        const row = data[xIndex];
        for (let yIndex = 0; yIndex < row.length; yIndex++) {
          const tile = row[yIndex];
          if (!tile) {
            continue;
          }
          const tween = props.tweens.add({
            targets: tile,
            pixelY: { from: tile.pixelY, to: tile.pixelY - 2 },
            ease: 'sine.inout',
            duration: 1000 * (3 + layerIndex),
            repeat: -1,
            yoyo: true,
            paused: true
          });
          tween.seek(yIndex * 1000 + layerIndex * 800);
          tween.play();
        }
      }
    }
  }
}
