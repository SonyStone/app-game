import { Read, System, SystemData, World } from '@packages/ecsy';
import { Application, Container, Graphics } from 'pixi.js';
import { onCleanup } from 'solid-js';
import { Vector2 } from '../utils';

const NUM_ELEMENTS = 500;
const SPEED_MULTIPLIER = 0.1;
const SHAPE_SIZE = 20;
const SHAPE_HALF_SIZE = SHAPE_SIZE / 2;

export function build(app: Application) {
  const container = new Container();

  app.stage.addChild(container);

  // ----------------------
  // Components
  // ----------------------

  // Velocity component
  class Velocity extends Vector2 {}

  // Position component
  class Position extends Vector2 {}

  class Element {
    element = new Graphics();

    reset() {
      this.element = new Graphics();
    }
  }

  // Shape component
  class Shape {
    primitive = 'box';

    reset() {
      this.primitive = 'box';
    }
  }

  // Renderable component
  class Renderable {
    reset() {}
  }

  class PerformanceCompensation {
    delta = 0;
    time = 0;

    reset() {
      this.delta = this.time = 0;
    }
  }

  // ----------------------
  // Systems
  // ----------------------

  // MovableSystem
  class MovableSystem extends System {
    // This method will get called on every frame by default
    run(movings: [Velocity, Position][], performance: PerformanceCompensation[]) {
      const delta = performance[0].delta;

      // Iterate through all the entities on the query
      for (let i = 0; i < movings.length; i++) {
        const velocity = movings[i][0];
        const position = movings[i][1];

        position.x += velocity.x * delta;
        position.y += velocity.y * delta;

        if (position.x > app.screen.width + SHAPE_HALF_SIZE) {
          position.x = -SHAPE_HALF_SIZE;
        }
        if (position.x < -SHAPE_HALF_SIZE) {
          position.x = app.screen.width + SHAPE_HALF_SIZE;
        }
        if (position.y > app.screen.height + SHAPE_HALF_SIZE) {
          position.y = -SHAPE_HALF_SIZE;
        }
        if (position.y < -SHAPE_HALF_SIZE) {
          position.y = app.screen.height + SHAPE_HALF_SIZE;
        }
      }
    }
  }

  SystemData(
    MovableSystem, // Define a query of entities that have "Velocity" and "Position" components
    [Read(Velocity), Read(Position)],
    Read(PerformanceCompensation)
  );

  class RendererSystem extends System {
    // This method will get called on every frame by default
    run(renderables: [Position, Element][]) {
      for (let i = 0; i < renderables.length; i++) {
        const position = renderables[i][0];
        const element = renderables[i][1];

        element.element.position.set(position.x, position.y);
      }
    }
  }

  SystemData(RendererSystem, [Read(Position), Read(Element)]);

  // Create world and register the systems on it
  const world = new World();
  world.registerSystem(MovableSystem).registerSystem(RendererSystem);

  // Used for singleton components
  const singletonEntity = world.createEntity().addComponent(PerformanceCompensation);

  // Some helper functions when creating the components
  function getRandomVelocity() {
    return {
      x: SPEED_MULTIPLIER * (2 * Math.random() - 1),
      y: SPEED_MULTIPLIER * (2 * Math.random() - 1)
    };
  }

  function getRandomPosition() {
    return {
      x: Math.random() * app.screen.width,
      y: Math.random() * app.screen.height
    };
  }

  function getRandomShape() {
    return {
      primitive: Math.random() >= 0.5 ? 'circle' : 'box'
    };
  }

  function getElement() {
    const element = new Graphics()
      .beginFill(0xf28d89)
      .lineStyle(1, 0x800904, 1)
      .drawRect(-SHAPE_HALF_SIZE, -SHAPE_HALF_SIZE, SHAPE_SIZE, SHAPE_SIZE)
      .closePath()
      .endFill();

    container.addChild(element);

    return {
      element
    };
  }

  for (let i = 0; i < NUM_ELEMENTS; i++) {
    world
      .createEntity()
      .addComponent(Element, getElement())
      .addComponent(Velocity, getRandomVelocity())
      .addComponent(Shape, getRandomShape())
      .addComponent(Position, getRandomPosition())
      .addComponent(Renderable);
  }

  const performanceCompensation = singletonEntity.getMutableComponent(PerformanceCompensation);

  let id: number;

  // Run!
  function run() {
    // console.log(1);
    // Compute delta and elapsed time
    const time = performance.now();
    performanceCompensation.delta = time - lastTime;

    // Run all the systems
    world.run();
    app.renderer.render(container);

    lastTime = time;
    // id = requestAnimationFrame(run);
  }

  app.ticker.add(run);

  function stop() {
    world.stop();
  }

  let lastTime = performance.now();
  run();

  return stop;
}

export default function CirclesBoxesPixijs() {
  const app = new Application({
    width: window.document.body.clientWidth,
    height: window.document.body.clientHeight,
    backgroundColor: 0xffffff,
    resolution: window.devicePixelRatio || 1,
    antialias: true
    // resolution: 1,
  });

  function resizeCanvas() {
    app.renderer.resize(window.document.body.clientWidth, window.document.body.clientHeight);
  }

  window.addEventListener('resize', resizeCanvas, false);

  const destory = build(app);

  onCleanup(() => {
    window.removeEventListener('resize', resizeCanvas);
    destory();
    app.stop();
    app.destroy();
  });

  return <>{app.view}</>;
}
