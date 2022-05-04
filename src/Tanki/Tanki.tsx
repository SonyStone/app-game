import { destroyTextureCache } from '@pixi/utils';
import { Application, Container, Graphics, GraphicsGeometry } from 'pixi.js';
import { onCleanup } from 'solid-js';
import { useStats } from '../Stats.provider';
import { createBody } from './createBody';
import { createGun } from './createGun';

import Camera from './elements/camera';
import { Ellipse } from './elements/ellipse';
import { Tank } from './elements/tank';
import { Vec2 } from './math/vec2';
import { Vector2d } from './math/vector2d';
import { captureKeyboard } from './utils/capture-keyboard';
import { captureMouse } from './utils/capture-mouse';
import { addDrag } from './utils/drag';

const easing = 0.08;

export default function Tanki() {
  const app = new Application({
    antialias: true,
    backgroundColor: 0x1099bb,
  });

  function resize() {
    app.renderer.resize(
      window.document.body.clientWidth,
      window.document.body.clientHeight
    );
  }

  window.addEventListener('resize', resize);

  onCleanup(() => {
    app.stop();
    app.destroy();
    destroyTextureCache();
    window.removeEventListener('resize', resize);
  });

  resize();

  const keyboard = captureKeyboard(window);
  const mouse = captureMouse(app.renderer.view);
  const cam = new Camera();
  let camTarget = new Vector2d(app.renderer.width / 2, app.renderer.height / 2);
  const world = new Container();

  const tanks: Tank[] = [new Tank()];

  const stage = app.stage;
  const ticker = app.ticker;

  stage.addChild(world);

  const ellipse = new Ellipse(0, 0).ctx;

  GraphicsGeometry.BATCHABLE_SIZE = 1;

  const test = new Graphics()
    .beginFill(0xbf3030)
    .lineStyle(2, 0x191919, 1)
    .arc(0, 0, 30, 0, Math.PI / 2, false)
    // .drawCircle(0, 0, 15)
    .bezierCurveTo(-30, 30, -40, 0, -40, -80)
    .lineTo(30, -80)
    .closePath()
    .endFill();

  cam.focusing(app.renderer, camTarget);
  cam.translate(world);

  world.addChild(test);

  const body = createBody();
  body.addChild(createGun());
  world.addChild(body);

  addDrag(ellipse);

  // this.world.addChild(ellipse);

  tanks.forEach((tank) => {
    world.addChild(tank);
  });

  const stats = useStats();

  ticker.add(() => {
    stats.begin();
    tanks[0].player(keyboard, mouse, cam);

    cam.manipulation(keyboard, mouse);

    const v = Vec2.sub(tanks[0].position, camTarget).mult(easing);

    camTarget = camTarget.add(v);

    cam.focusing(app.renderer, camTarget);

    cam.translate(world);

    for (const tank of tanks) {
      tank.update();
    }

    app.renderer.render(world);
    stats.end();
  });

  return <>{app.view}</>;
}
