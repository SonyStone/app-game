import createRAF from '@solid-primitives/raf';
import { createStaticStore } from '@solid-primitives/static-store';
import createContextProvider from '@utils/createContextProvider';
import {
  addComponent,
  addEntity,
  createWorld,
  entityExists,
  getAllEntities,
  getEntityComponents,
  query,
  removeEntity
} from 'bitecs';
import { createSignal, For, JSX, onCleanup, onMount, Show } from 'solid-js';

const components = {
  // They can be any shape you want
  // SoA:
  Position: { x: [] as number[], y: [] as number[] },
  Velocity: { x: new Float32Array(1e1), y: new Float32Array(1e1) },
  // AoS:
  Player: [] as { level: number; experience: number; name: string }[],
  Health: [] as number[]
};

const Health = components.Health;

function worldBuilder() {
  const [store, setStore] = createStaticStore({
    components,
    time: {
      delta: 0,
      elapsed: 0,
      then: performance.now()
    }
  });
  const world = createWorld(store);

  type World = typeof world;

  const [WorldProvider, useWorldContext] = createContextProvider<World>();

  function World(props: Partial<{ children: JSX.Element }>) {
    return <WorldProvider value={world}>{props.children}</WorldProvider>;
  }

  return [World, useWorldContext] as const;
}

const [World, useWorldContext] = worldBuilder();

function Entity(props: { children?: JSX.Element; ref?: (eid: number) => void }) {
  const world = useWorldContext();
  const eid = addEntity(world);
  props.ref?.(eid);

  onCleanup(() => {
    console.log('Removing self entity');
    removeEntity(world, eid);
  });

  // return eid as unknown as JSX.Element;
  return <></>;
}

const [SystemsProvider, useSystemsContext] = createContextProvider<(() => void)[]>();

function Systems(props: { children?: JSX.Element }) {
  const systems = [] as (() => void)[];

  const update = () => {
    for (const run of systems) {
      run();
    }
  };

  const [, start] = createRAF(update);
  start();

  return <SystemsProvider value={systems}>{props.children}</SystemsProvider>;
}

function addSystem(system: () => void) {
  const systems = useSystemsContext();

  systems.push(system);
  onCleanup(() => {
    systems.splice(systems.indexOf(system), 1);
  });
}

function MovementSystem() {
  const world = useWorldContext();

  const movementSystem = () => {
    const { Position, Velocity } = world.components;

    for (const eid of query(world, [Position, Velocity])) {
      Position.x[eid] += Velocity.x[eid] * world.time.delta;
      Position.y[eid] += Velocity.y[eid] * world.time.delta;
    }
  };

  addSystem(movementSystem);

  return <></>;
}

function ExperienceSystem() {
  const world = useWorldContext();

  const experienceSystem = () => {
    const { Player } = world.components;

    for (const eid of query(world, [Player])) {
      Player[eid].experience += world.time.delta / 1000;
      if (Player[eid].experience >= 100) {
        Player[eid].level++;
        Player[eid].experience = 0;
      }
    }
  };

  addSystem(experienceSystem);

  return <></>;
}

function HealthSystem() {
  const world = useWorldContext();

  const healthSystem = () => {
    for (const eid of query(world, [Health])) {
      if (Health[eid] <= 0) {
        removeEntity(world, eid);
      }
      Health[eid] -= 1; // Lose 1 health per second
    }
  };

  addSystem(healthSystem);

  return <></>;
}

function TimeSystem() {
  const world = useWorldContext();

  const timeSystem = () => {
    const { time } = world;
    const now = performance.now();
    const delta = now - time.then;
    time.delta = delta;
    time.elapsed += delta;
    time.then = now;
  };

  addSystem(timeSystem);

  return <></>;
}

function DrawSystem() {
  const world = useWorldContext();

  const pre = (<pre>{JSON.stringify(world, null, 2)}</pre>) as HTMLPreElement;

  const drawSystem = () => {
    pre.innerText = JSON.stringify(world, null, 2);
  };

  addSystem(drawSystem);

  return <div>{pre}</div>;
}

function Toggle(props: { children?: JSX.Element; name?: string }) {
  const [isSystemOn, setIsSystemOn] = createSignal(true);
  return (
    <>
      <button class="place-self-start rounded bg-blue-100 p-2" onClick={() => setIsSystemOn((r) => !r)}>
        {props.name}: {isSystemOn() ? 'Stop' : 'Start'}
      </button>
      <Show when={isSystemOn()}>{props.children}</Show>
    </>
  );
}

function TestECS() {
  const [players, setPlayers] = createSignal([
    (props: { id: number }) => (
      <Toggle name={`Player_${props.id}`}>
        <Entity
          ref={(eid) => {
            const world = useWorldContext();
            const { Position, Velocity, Player } = world.components;
            addComponent(world, eid, Position);
            addComponent(world, eid, Velocity);
            addComponent(world, eid, Player);
            addComponent(world, eid, Health);

            Position.x[eid] = 0;
            Position.y[eid] = 0;
            Velocity.x[eid] = 1.23;
            Velocity.y[eid] = 1.23;
            Health[eid] = 100;

            Player[eid] = { level: 1, experience: 0, name: 'Hero' };
          }}
        />
      </Toggle>
    )
  ]);

  function addPlayer() {
    setPlayers((p) => [
      ...p,
      (props: { id: number }) => (
        <Toggle name={`Player_${props.id}`}>
          <Entity
            ref={(eid) => {
              const world = useWorldContext();
              const { Position, Velocity, Player } = world.components;
              addComponent(world, eid, Position);
              addComponent(world, eid, Velocity);
              addComponent(world, eid, Player);
              addComponent(world, eid, Health);

              Position.x[eid] = 0;
              Position.y[eid] = 0;
              Velocity.x[eid] = 1.23;
              Velocity.y[eid] = 1.23;
              Health[eid] = 100;

              Player[eid] = { level: 1, experience: 0, name: 'Hero' };
            }}
          />
        </Toggle>
      )
    ]);
  }

  return (
    <div class="flex gap-4">
      <World>
        <div class="flex flex-col gap-4">
          <DrawWorld />
        </div>
        <div class="flex flex-col gap-4">
          <span>Entities:</span>
          <button class="place-self-start rounded bg-blue-100 p-2" onClick={addPlayer}>
            Add Player
          </button>
          <For each={players()}>{(Player, index) => <Player id={index()} />}</For>
        </div>
        <Systems>
          <div class="flex flex-col gap-4">
            <span>Systems:</span>
            <Toggle name="MovementSystem">
              <MovementSystem />
            </Toggle>
            <Toggle name="ExperienceSystem">
              <ExperienceSystem />
            </Toggle>
            <Toggle name="HealthSystem">
              <HealthSystem />
            </Toggle>
            <Toggle name="TimeSystem">
              <TimeSystem />
            </Toggle>
          </div>
          <div class="flex flex-col gap-4">
            <span>Draw:</span>
            <Toggle name="DrawSystem">
              <DrawSystem />
            </Toggle>
          </div>
        </Systems>
      </World>
    </div>
  );
}

function DrawWorld() {
  const world = useWorldContext();

  onMount(() => {
    const componentNames = Object.entries(world.components).reduce(
      (acc, [key, comp]) => {
        acc.set(comp, key);
        return acc;
      },
      new Map() as Map<unknown, string>
    );

    console.log('Entities:', getAllEntities(world));
    for (const eid of getAllEntities(world)) {
      console.log('Entity:', entityExists(world, eid), getEntityComponents(world, eid));
      for (const comp of getEntityComponents(world, eid)) {
        if (Array.isArray(comp)) {
          console.log(' - Component Array:', componentNames.get(comp), comp[eid]);
        } else {
          const res = Object.entries(comp).reduce((acc, [key, value]) => {
            acc[key] = value[eid];
            return acc;
          }, {});
          console.log(' - Component:', componentNames.get(comp), res);
        }
      }
    }
  });

  return (
    <div>
      <pre>Q: {world.time.then}</pre>
    </div>
  );
}

export default function BitecsECSExample() {
  return (
    <div class="flex flex-col gap-4">
      <span>Bitecs ECS Example (check console)</span>
      <TestECS />
    </div>
  );
}
