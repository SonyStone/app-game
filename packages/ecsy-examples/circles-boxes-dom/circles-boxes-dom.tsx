import { Read, System, SystemData, World } from '@packages/ecsy';
import { onCleanup, onMount } from 'solid-js';
import { Vector2 } from '../utils';

const NUM_ELEMENTS = 500;
const SPEED_MULTIPLIER = 0.1;
const SHAPE_SIZE = 20;
const SHAPE_HALF_SIZE = SHAPE_SIZE / 2;

export function build(div: HTMLDivElement) {
  // ----------------------
  // Components
  // ----------------------

  // Velocity component
  class Velocity extends Vector2 {}

  // Position component
  class Position extends Vector2 {}

  class Element {
    element = document.createElement('div');

    reset() {
      this.element = document.createElement('div');
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

        if (position.x > div.offsetWidth + SHAPE_HALF_SIZE) {
          position.x = -SHAPE_HALF_SIZE;
        }
        if (position.x < -SHAPE_HALF_SIZE) {
          position.x = div.offsetWidth + SHAPE_HALF_SIZE;
        }
        if (position.y > div.offsetHeight + SHAPE_HALF_SIZE) {
          position.y = -SHAPE_HALF_SIZE;
        }
        if (position.y < -SHAPE_HALF_SIZE) {
          position.y = div.offsetHeight + SHAPE_HALF_SIZE;
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

        element.element.style.transform = `translate(${position.x}px, ${position.y}px)`;
        // console.log(`log`, `translate(${position.x}px, ${position.y}px);`);
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
      x: Math.random() * div.offsetWidth,
      y: Math.random() * div.offsetHeight
    };
  }

  function getRandomShape() {
    return {
      primitive: Math.random() >= 0.5 ? 'circle' : 'box'
    };
  }

  function getElement() {
    const element = document.createElement('div');
    element.style.height = `${SHAPE_SIZE}px`;
    element.style.width = `${SHAPE_SIZE}px`;
    element.style.backgroundColor = '#f28d89';
    element.style.border = `#800904 1px solid`;
    element.style.position = 'absolute';
    element.style.transform = `translate(0px, 0px)`;

    div.appendChild(element);

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
    // Compute delta and elapsed time
    const time = performance.now();
    performanceCompensation.delta = time - lastTime;

    // Run all the systems
    world.run();

    lastTime = time;
    id = requestAnimationFrame(run);
  }

  function stop() {
    world.stop();
    cancelAnimationFrame(id);
  }

  let lastTime = performance.now();
  run();

  return stop;
}

export default function CirclesBoxesDOM() {
  const div = (<div></div>) as HTMLDivElement;

  let canvasWidth = (div.style.width = `${window.innerWidth}px`);
  let canvasHeight = (div.style.height = `${window.innerHeight}px`);

  function resizeCanvas() {
    canvasWidth = div.style.width = `${window.innerWidth}px`;
    canvasHeight = div.style.height = `${window.innerHeight}px`;
  }

  window.addEventListener('resize', resizeCanvas, false);

  let destory: () => void;

  onMount(() => {
    destory = build(div);
  });

  onCleanup(() => {
    window.removeEventListener('resize', resizeCanvas);
    destory();
  });

  return div;
}
