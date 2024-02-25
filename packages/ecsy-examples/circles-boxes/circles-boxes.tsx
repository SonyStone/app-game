import { Read, System, SystemData, World } from '@packages/ecsy';
import { onCleanup } from 'solid-js';
import { Vector2 } from '../utils';

const NUM_ELEMENTS = 500;
const SPEED_MULTIPLIER = 0.1;
const SHAPE_SIZE = 20;
const SHAPE_HALF_SIZE = SHAPE_SIZE / 2;

function build(ctx: CanvasRenderingContext2D) {
  const canvas = ctx.canvas;

  // ----------------------
  // Components
  // ----------------------

  // Velocity component
  class Velocity extends Vector2 {}

  // Position component
  class Position extends Vector2 {}

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

        if (position.x > canvas.width + SHAPE_HALF_SIZE) {
          position.x = -SHAPE_HALF_SIZE;
        }
        if (position.x < -SHAPE_HALF_SIZE) {
          position.x = canvas.width + SHAPE_HALF_SIZE;
        }
        if (position.y > canvas.height + SHAPE_HALF_SIZE) {
          position.y = -SHAPE_HALF_SIZE;
        }
        if (position.y < -SHAPE_HALF_SIZE) {
          position.y = canvas.height + SHAPE_HALF_SIZE;
        }
      }
    }
  }

  SystemData(MovableSystem, [Read(Velocity), Read(Position)], Read(PerformanceCompensation));

  // RendererSystem
  class RendererSystem extends System {
    // This method will get called on every frame by default
    run(renderables: [Position, Shape, Renderable][]) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // ctx.globalAlpha = 0.6;

      // Iterate through all the entities on the query
      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < renderables.length; i++) {
        const position = renderables[i][0];
        const shape = renderables[i][1];

        if (shape.primitive === 'box') {
          this.drawBox(position);
        } else {
          this.drawCircle(position);
        }
      }
    }

    drawCircle(position: Position) {
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.arc(position.x, position.y, SHAPE_HALF_SIZE, 0, 2 * Math.PI, false);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#222';
      ctx.stroke();
    }

    drawBox(position: Position) {
      ctx.beginPath();
      ctx.rect(position.x - SHAPE_HALF_SIZE, position.y - SHAPE_HALF_SIZE, SHAPE_SIZE, SHAPE_SIZE);
      ctx.fillStyle = '#f28d89';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#800904';
      ctx.stroke();
    }
  }

  SystemData(RendererSystem, [Read(Position), Read(Shape), Read(Renderable)]);

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
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height
    };
  }

  function getRandomShape() {
    return {
      primitive: Math.random() >= 0.5 ? 'circle' : 'box'
    };
  }

  for (let i = 0; i < NUM_ELEMENTS; i++) {
    world
      .createEntity()
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

export default function CirclesBoxes() {
  const canvas = (<canvas></canvas>) as HTMLCanvasElement;

  let canvasWidth = (canvas.width = window.innerWidth);
  let canvasHeight = (canvas.height = window.innerHeight);
  const ctx = canvas.getContext('2d')!;

  function resizeCanvas() {
    canvasWidth = canvas.width = window.innerWidth;
    canvasHeight = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resizeCanvas, false);

  const destory = build(ctx);

  onCleanup(() => {
    window.removeEventListener('resize', resizeCanvas);
    destory();
  });

  return canvas;
}
