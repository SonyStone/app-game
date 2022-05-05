import { AFFINE, Sprite2d } from 'pixi-projection';
import { Application, Container, Graphics, Texture } from 'pixi.js';
import { outlineFilterBlack } from './utils/outlineFilterBlack';

export function isoBasic(app: Application): Container {
  // === FIRST PART ===
  // just simple rotation
  const container = new Container();

  const sprite = createFlowerTop(app);

  let step = 0;

  app.ticker.add((delta) => {
    step += delta;
    sprite.rotation = step * 0.1;
  });

  // === SECOND PART ===
  // lets also add scaling container

  const scalingContainer = new Container();
  scalingContainer.scale.y = 0.3; // adjust scale by Y - that will change "perspective" a bit
  scalingContainer.position.set(
    (app.screen.width * 3) / 8,
    app.screen.height / 2
  );

  const sprite2 = createFlowerTop2();

  app.ticker.add(() => {
    sprite2.rotation = step * 0.1;
  });

  // === THIRD PART ===
  // Better isometry plane.
  // We can even rotate it if you want!

  const isometryPlane = drawGrid();
  const isoRotateContainer = new Container();
  isoRotateContainer.rotation = Math.PI / 4;
  const isoScalingContainer = new Container();
  isoScalingContainer.scale.y = 0.5;

  const sprite3 = createEggHeadSprite();
  sprite3.rotation = (Math.PI / 4) * 3;

  app.ticker.add(() => {
    const radius = 100;
    const speed = 0.005;

    sprite3.position.set(
      Math.cos(step * speed) * radius,
      Math.sin(step * speed) * radius
    );
  });

  // scalingContainer.addChild(sprite2);

  // isometryPlane.addChild(sprite3);

  isoRotateContainer.addChild(isometryPlane);
  isoScalingContainer.addChild(isoRotateContainer);

  container.addChild(isoScalingContainer);
  // container.addChild(sprite);
  container.addChild(scalingContainer);

  return container;
}

function drawGrid(): Graphics {
  const g = new Graphics();
  g.lineStyle(1, 0xffffff, 0.4);

  const length = Math.sqrt(32 * 32 + 32 * 32);
  g.position.set(length, 0);

  for (let i = 0; i <= 25; i++) {
    const step = i * length;
    g.moveTo(0, step);
    g.lineTo(length * 25, step);
    g.moveTo(step, 0);
    g.lineTo(step, length * 25);
  }

  // g.rotation = Math.PI / 4;

  return g;
}

function createEggHeadSprite(): Sprite2d {
  const sprite3 = new Sprite2d(Texture.from('./eggHead.png'));
  sprite3.anchor.set(0.5, 1.0);
  sprite3.proj.affine = AFFINE.AXIS_X;
  sprite3.scale.set(0.5, 0.5); // make it small but tall!
  // not-proportional scale can't work without special flag `scaleAfterAffine`
  // fortunately, its `true` by default

  sprite3.filters = [outlineFilterBlack];

  return sprite3;
}

function createFlowerTop2(): Sprite2d {
  const sprite2 = new Sprite2d(Texture.from('./flowerTop.png'));
  sprite2.anchor.set(0.5, 1.0);
  sprite2.proj.affine = AFFINE.AXIS_X;

  return sprite2;
}

function createFlowerTop(app: Application): Sprite2d {
  const sprite = new Sprite2d(Texture.from('./flowerTop.png'));
  sprite.anchor.set(0.5, 1.0);
  sprite.proj.affine = AFFINE.AXIS_X; // return to affine after rotating
  sprite.position.set((app.screen.width * 1) / 8, app.screen.height / 2);

  return sprite;
}
