import { createEventSignal } from '@solid-primitives/event-listener';
import { Application, Container, GraphicsGeometry, Point, Transform, utils } from 'pixi.js';
import { createEffect, createMemo, onCleanup } from 'solid-js';
import { Key } from 'ts-keycode-enum';
import { World, hasSymbol, single, withSymbol } from './ecs';
import Camera from './elements/camera';
import { Ellipse, createCircle } from './elements/ellipse';
import { createLocator } from './elements/locator';
import { createPull, createTank } from './elements/tank';
import { Trail, createRope, createTrail, updateTrail } from './elements/trail';
import { captureKeyboard } from './utils/capture-keyboard';
import { captureMouse } from './utils/capture-mouse';

const easing = 0.08;

const CAMERA = Symbol('camera');
const KEYBOARD = Symbol('keyboard');
const WORLD = Symbol('world');
const TRAIL = Symbol('trail');

export default function Tanki() {
  const app = new Application({
    antialias: true,
    backgroundColor: 0x1099bb,
    resizeTo: window
  });
  // app.stage.addSystem(EventSystem, "events");

  onCleanup(() => {
    app.stop();
    app.destroy();
    utils.destroyTextureCache();
  });

  const cam = new Camera();

  const world = new Container();
  world.sortableChildren = true;

  const stage = app.stage;
  const ticker = app.ticker;

  stage.addChild(world);

  const ellipse = new Ellipse(0, 0).ctx;

  GraphicsGeometry.BATCHABLE_SIZE = 1;

  const camTarget = new Point(app.renderer.width / 2, app.renderer.height / 2);
  cam.position.copyFrom(camTarget);
  // cam.rotation = 30;

  // addDrag(ellipse);
  world.addChild(ellipse);

  // this.world.addChild(ellipse);

  const canvasElement = app.view as HTMLCanvasElement;
  const mouse = captureMouse(canvasElement);
  const keyboard = captureKeyboard(window);

  const lastEvent = createEventSignal(canvasElement, 'wheel');

  const deltaY = createMemo(() => lastEvent()?.deltaY ?? 0, 0, {
    equals: false
  });

  createEffect(() => {
    const zoom = 1.0 - deltaY() / 1000;
    cam.scale.x *= zoom;
    cam.scale.y *= zoom;
  });

  const rope = createRope();
  world.addChild(rope.obj);

  const pull = createPull();

  stage.on('click', () => {
    rope.reset();
  });

  const ecs = new World()
    .addSystem(updateCamera, [single(hasSymbol(CAMERA)), single(hasSymbol(KEYBOARD)), single(hasSymbol(WORLD))])
    .addSystem(
      (items: { transform: Transform }[], locator: { transform: Transform }, camera: Transform, keyboard: Set<Key>) => {
        pull.updatePull(locator.transform, keyboard, camera);
        for (const { transform } of items) {
          transform.position.copyFrom(locator.transform.position);
          transform.rotation = locator.transform.rotation;
        }
      },
      [
        (e: any) => e.tank && e.player,
        single((e: any) => e.pullLocator),
        single(hasSymbol(CAMERA)),
        single(hasSymbol(KEYBOARD))
      ]
    )
    .addSystem(() => {
      rope.update();
    }, [])
    .addSystem(
      (trail: Trail) => {
        updateTrail(trail);
      },
      [single(hasSymbol(TRAIL))]
    )
    .addEntity(
      (() => {
        const tank = createTank();
        tank.zIndex = 1;
        world.addChild(tank);

        return {
          player: true,
          tank: true,
          transform: tank.transform
        };
      })()
    )
    .addEntity(
      (() => {
        const tank = createTank();
        tank.zIndex = 1;
        world.addChild(tank);

        return {
          tank: true,
          transform: tank.transform
        };
      })()
    )
    .addEntity(
      (() => {
        const pullLocator = createLocator();
        pullLocator.scale.set(100, 100);
        world.addChild(pullLocator);

        return {
          pullLocator,
          transform: pullLocator.transform
        };
      })()
    )
    .addEntity(withSymbol(CAMERA, cam))
    .addEntity(withSymbol(WORLD, world))
    .addEntity(withSymbol(KEYBOARD, keyboard))
    .addEntity(withSymbol(TRAIL, createTrail(world, cam)));

  stage.on('click', () => {
    const circle = createCircle();
    circle.zIndex = 0;
    circle.position.set((Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000);
    world.addChild(circle);
    ecs.addEntity({
      cirle: circle,
      transform: circle.transform
    });
  });

  const skipper = createSkipper(5);
  ticker.add(() => {
    if (skipper.skip()) {
      return;
    }
    // tanks[0].player(keyboard, mouse, cam);

    // cam.focusing(app.renderer, camTarget);
    ecs.run();

    // const v = Vec2.sub(tanks[0].position, camTarget).mult(easing);

    // camTarget = camTarget.add(v);

    // for (const tank of tanks) {
    //   tank.update();
    // }

    app.renderer.render(world);
  });

  return <>{app.view}</>;
}

function createSkipper(howMuchToSkip: number) {
  let skip = 0;

  return {
    skip(): boolean {
      if (skip <= 0) {
        skip = howMuchToSkip;
        return false;
      } else {
        skip--;
        return true;
      }
    }
  };
}

function updateCamera(camera: Container, keyboard: Set<Key>, world: Container) {
  if (keyboard.has(Key.E)) {
    camera.rotation -= 0.1;
  }
  if (keyboard.has(Key.Q)) {
    camera.rotation += 0.1;
  }
  if (keyboard.has(Key.Add)) {
    camera.scale.x *= 1.1;
    camera.scale.y *= 1.1;
  }
  if (keyboard.has(Key.Subtract)) {
    camera.scale.x /= 1.1;
    camera.scale.y /= 1.1;
  }

  world.rotation = camera.rotation;
  world.position.x = camera.position.x;
  world.position.y = camera.position.y;
  world.scale.x = camera.scale.x;
  world.scale.y = camera.scale.y;
}
