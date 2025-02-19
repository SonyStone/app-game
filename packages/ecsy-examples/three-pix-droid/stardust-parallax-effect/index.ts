import './index.scss';

import { World } from '@packages/ecsy';

import { CanvasContext, CanvasData, CanvasSize } from '../../utils/canvas-data';
import { MouseData, MousePoint } from '../../utils/mouse-data';
import { Point } from '../../utils/point';
import { BackgroundColor, LineProperties } from '../particles-with-connection/components';
import { DrawBackgroundSystem, DrawLinesSystem } from '../particles-with-connection/systems';
import { Orb, P, PointData, Resize, RingsCount } from './components';
import { CenterUpdateSystem, DrawOrbsSystem, OrbPointSystem, RefreshSystem } from './systems';

const ORBS_COUNT = 200;
const MIN_VELOCITY = 0.2;
const RINGS_COUNT = 10;

// Setup World
{
  const world = new World();

  const canvas = new CanvasData(document.querySelector('canvas'));

  const singletonEntity = world
    .createEntity()
    .addComponent(CanvasSize, canvas.getSize())
    .addComponent(CanvasContext, canvas.getContext())
    .addComponent(Resize)
    .addComponent(P)
    .addComponent(MousePoint)
    .addComponent(BackgroundColor)
    .addComponent(LineProperties, {
      color: [40, 125, 255],
      length: 100
    })
    .addComponent(RingsCount, {
      ringsCount: RINGS_COUNT
    });
  {
    const mouse = new MouseData(canvas.canvas, window);

    const mousePoint = singletonEntity.getComponent(MousePoint);
    mouse.mouseMoveUpdater(mousePoint);
  }

  {
    const canvasSize = singletonEntity.getComponent(CanvasSize);
    canvas.resizeUpdater(canvasSize);
  }

  for (let i = 0; i < ORBS_COUNT; i++) {
    world
      .createEntity()
      .addComponent(Point)
      .addComponent(PointData)
      .addComponent(Orb, {
        size: Math.random() * 5 + 2,
        angle: Math.random() * 360,
        // tslint:disable-next-line:no-bitwise
        radius: (Math.random() * RINGS_COUNT) | 0,
        velocity: MIN_VELOCITY + Math.random() * MIN_VELOCITY
      });
  }

  world
    .registerSystem(CenterUpdateSystem)
    .registerSystem(DrawBackgroundSystem)
    // .registerSystem(DrawSunBackgroundSystem)
    .registerSystem(OrbPointSystem)
    .registerSystem(RefreshSystem)
    .registerSystem(DrawLinesSystem)
    .registerSystem(DrawOrbsSystem);

  const run = () => {
    // Run all the systems
    world.run();

    requestAnimationFrame(run);
  };

  run();
}
