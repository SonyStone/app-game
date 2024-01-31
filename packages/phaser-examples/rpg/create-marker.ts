import Phaser from 'phaser';

export function createMarker(props: {
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
  markerContainer.postFX.addBloom();
  markerContainer.blendMode = Phaser.BlendModes.ADD;

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
