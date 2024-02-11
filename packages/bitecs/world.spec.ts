import { afterEach, describe, expect, it } from 'vitest';
import { pipe } from '.';
import { $componentMap, addComponent, defineComponent } from './component';
import { TYPES_ENUM } from './constants';
import {
  $entityArray,
  $entityComponents,
  $entityMasks,
  $entitySparseSet,
  addEntity,
  getDefaultSize,
  resetGlobals
} from './entity';
import { $dirtyQueries, $notQueries, $queries, $queryMap, defineQuery } from './query';
import {
  $archetypes,
  $bitflag,
  $localEntities,
  $localEntityLookup,
  $manualEntityRecycling,
  $size,
  World,
  createWorld
} from './world';

const defaultSize = getDefaultSize();

describe('World Unit Tests', () => {
  afterEach(() => {
    resetGlobals();
  });

  it('should initialize all private state', () => {
    const world = createWorld();

    expect(Object.keys(world).length).toBe(0);

    expect(world[$size]).toBe(defaultSize);

    expect(Array.isArray(world[$entityMasks])).toBeTruthy();

    expect(world[$entityMasks][0].constructor.name).toBe('Uint32Array');
    expect(world[$entityMasks][0].length).toBe(defaultSize);

    expect(world[$bitflag]).toBe(1);

    expect(world[$componentMap].constructor.name).toBe('Map');
    expect(world[$queryMap].constructor.name).toBe('Map');
    expect(world[$queries].constructor.name).toBe('Set');
    expect(world[$dirtyQueries].constructor.name).toBe('Set');

    const sparseSet = world[$entitySparseSet];

    expect(world).toEqual({
      [$size]: defaultSize,
      [$entityMasks]: [new Uint32Array(defaultSize)],
      [$entityComponents]: new Map(),
      [$archetypes]: [],
      [$entitySparseSet]: sparseSet,
      [$entityArray]: sparseSet.dense,
      [$bitflag]: 1,
      [$componentMap]: new Map(),
      [$queryMap]: new Map(),
      [$queries]: new Set(),
      [$notQueries]: new Set(),
      [$dirtyQueries]: new Set(),
      [$localEntities]: new Map(),
      [$localEntityLookup]: new Map(),
      [$manualEntityRecycling]: false
    });
  });

  it('should example works', () => {
    const Vector3 = { x: TYPES_ENUM.f32, y: TYPES_ENUM.f32, z: TYPES_ENUM.f32 };
    const Position = defineComponent(Vector3);
    const Velocity = defineComponent(Vector3);

    let now = 0;
    const performance = { now: () => now };

    const movementQuery = defineQuery([Position, Velocity]);
    const movementSystem = (world: World) => {
      const {
        time: { delta }
      } = world;
      const ents = movementQuery(world);
      debugger;
      for (let i = 0; i < ents.length; i++) {
        const eid = ents[i];
        Position.x[eid] += Velocity.x[eid] * delta;
        Position.y[eid] += Velocity.y[eid] * delta;
        Position.z[eid] += Velocity.z[eid] * delta;
      }
      return world;
    };

    const timeSystem = (world: World) => {
      const { time } = world;
      const now = performance.now();
      debugger;
      const delta = now - time.then;
      time.delta = delta;
      time.elapsed += delta;
      time.then = now;
      return world;
    };

    const pipeline = pipe(timeSystem, movementSystem);

    const world = createWorld();
    world.time = { delta: 0, elapsed: 0, then: performance.now() };

    const eid = addEntity(world);
    addComponent(world, Position, eid);
    addComponent(world, Velocity, eid);
    Velocity.x[eid] = 1.23;
    Velocity.y[eid] = 1.23;

    pipeline(world);
    expect(Position.x[eid]).toBe(0);
    expect(Position.y[eid]).toBe(0);

    now = 100;
    pipeline(world);

    debugger;

    expect(Position.x[eid]).toBe(123);
    expect(Position.y[eid]).toBe(123);

    now = 200;
    pipeline(world);

    expect(Position.x[eid]).toBe(246);
    expect(Position.y[eid]).toBe(246);
  });
});
