import { Not, Read, System, SystemData, World } from '@packages/ecsy';
import { components } from '@packages/ecsy/entity/entity';
import { archetypes } from '@packages/ecsy/utils/query-key';

// ----------------------
// Components
// ----------------------

export function build(ctx: CanvasRenderingContext2D) {
  class Vector2 {
    x = 0;
    y = 0;

    reset() {
      this.x = this.y = 0;
    }
  }

  // Velocity component
  class Velocity extends Vector2 {}

  // Position component
  class Position extends Vector2 {}

  // Position component
  class Acceleration extends Vector2 {}

  class PerformanceCompensation {
    delta = 0;
    time = 0;

    reset() {
      this.delta = this.time = 0;
    }
  }

  function movableSystem() {
    return {
      queries: [[Read(Position), Read(Velocity)], Read(PerformanceCompensation)],
      run(queries: [[Velocity, Position][], PerformanceCompensation[]]) {
        const movings = queries[0];
        const performance = queries[1];
        const delta = performance[0].delta;

        for (let i = 0; i < movings.length; i++) {
          const velocity = movings[i][0];
          const position = movings[i][1];
        }
      }
    };
  }

  // ----------------------
  // Systems
  // ----------------------

  // MovableSystem
  class MovableSystem implements System {
    // This method will get called on every frame by default
    run(entities: any[]) {
      console.log(`run MovableSystem`, performance, entities);
    }
  }

  SystemData(MovableSystem, Read(Position));

  class SystemTest implements System {
    run(entities: any[]) {
      console.log(`run SystemTest`, entities);
    }
  }

  SystemData(SystemTest, [Read(Position), Read(Velocity), Not(Acceleration)]);

  // Create world and register the systems on it
  const world = new World();

  const { queries, run: runF } = movableSystem();
  // world.systemManager.addSystem(queries, runF);

  // world
  // .registerSystem(MovableSystem)

  // world.createEntity()
  //   .addComponent(PerformanceCompensation);

  world.entityManager.createEntity().addComponent(Position).addComponent(Velocity);

  world.createEntity().addComponent(Velocity).addComponent(Position);

  world.createEntity().addComponent(Velocity).addComponent(Position).addComponent(Acceleration);

  world.createEntity().addComponent(Position).addComponent(Acceleration);

  world.registerSystem(SystemTest).registerSystem(MovableSystem);

  // const queries = world.systemManager.getSystems().get(SystemTest).queries;
  // console.log(`queries`, queries);

  let id: number;
  // Run!
  function run() {
    // Compute delta and elapsed time
    const time = performance.now();

    // Run all the systems
    world.run();

    console.log(`archetypes`, archetypes);
    console.log(`components`, components);

    lastTime = time;
    // id = requestAnimationFrame(run);
  }

  function stop() {
    world.stop();
    cancelAnimationFrame(id);
  }

  let lastTime = performance.now();
  run();

  console.log(`world`, world);

  return stop;
}
