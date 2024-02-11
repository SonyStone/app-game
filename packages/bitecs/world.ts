import { $componentMap, Component } from './component';
import {
  $entityArray,
  $entityComponents,
  $entityMasks,
  $entitySparseSet,
  Entity,
  getGlobalSize,
  removeEntity
} from './entity';
import { $dirtyQueries, $notQueries, $queries, $queryMap } from './query';
import { resize } from './storage';
import { SparseSet } from './util';

export const $size = Symbol('size');
export const $resizeThreshold = Symbol('resizeThreshold');
export const $bitflag = Symbol('bitflag');
export const $archetypes = Symbol('archetypes');
export const $localEntities = Symbol('localEntities');
export const $localEntityLookup = Symbol('localEntityLookup');
export const $manualEntityRecycling = Symbol('manualEntityRecycling');

type WorldSymbols =
  | typeof $size
  | typeof $resizeThreshold
  | typeof $bitflag
  | typeof $archetypes
  | typeof $localEntities
  | typeof $localEntityLookup
  | typeof $manualEntityRecycling;

/**
 * A world represents a set of entities and the components that they each possess.
 *
 * Worlds do not store actual component data, only their relationships with entities.
 *
 * Any number of worlds can be created. An empty object is returned which you can use as a context.
 *
 * ```ts
 * const world = createWorld()
 *
 * world.name = 'MyWorld'
 * ```
 */
export interface World {
  /**
   * The maximum number of entities that can be created in the world.
   */
  [$size]: number;
  /**
   * The threshold at which the world will resize.
   */
  [$resizeThreshold]: number;

  /**
   * The entity bitmasks for each component type.
   */
  [$entityMasks]: Uint32Array[];

  /**
   * entity to components map
   */
  [$entityComponents]: Map<Entity, Set<Component>>;

  [$archetypes]: any[];

  /**
   * todo: look up what this is
   */
  [$entitySparseSet]: SparseSet;

  /**
   * The entity array.
   */
  [$entityArray]: Entity[];

  /**
   * The bitflag for the world.
   */
  [$bitflag]: number;
  [$componentMap]: Map<any, any>;
  [$queryMap]: Map<any, any>;

  /**
   * Set of queries of this world.
   */
  [$queries]: Set<any>;
  [$notQueries]: Set<any>;
  [$dirtyQueries]: Set<any>;

  [$localEntities]: Map<any, any>;
  [$localEntityLookup]: Map<Entity, any>;

  [$manualEntityRecycling]: boolean;

  /**
   * Any other properties.
   */
  [key: string]: any;
}

export const worlds: World[] = [];

export const resizeWorlds = (size: number) => {
  worlds.forEach((world) => {
    world[$size] = size;

    for (let i = 0; i < world[$entityMasks].length; i++) {
      const masks = world[$entityMasks][i];
      // @ts-ignore
      world[$entityMasks][i] = resize(masks, size);
    }

    world[$resizeThreshold] = world[$size] - world[$size] / 5;
  });
};

/**
 * Creates a new world.
 *
 * @returns {World}
 */
export const createWorld = (...args: any[]): World => {
  const world = typeof args[0] === 'object' ? args[0] : {};
  const size = typeof args[0] === 'number' ? args[0] : typeof args[1] === 'number' ? args[1] : getGlobalSize();
  resetWorld(world, size);
  worlds.push(world);
  return world;
};

export const enableManualEntityRecycling = (world: World) => {
  world[$manualEntityRecycling] = true;
};

/**
 * Resets a world.
 *
 * @param {World} world
 * @returns {object}
 */
export const resetWorld = (world: World, size = getGlobalSize()) => {
  world[$size] = size;

  if (world[$entityArray]) {
    for (const eid of world[$entityArray]) {
      removeEntity(world, eid);
    }
  }

  const sparseSet = SparseSet();
  Object.assign(world, {
    [$entityMasks]: [new Uint32Array(size)],
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

  return world;
};

/**
 * Deletes a world.
 *
 * @param {World} world
 */
export const deleteWorld = (world: World) => {
  for (const key of Object.getOwnPropertySymbols(world)) {
    delete world[key as WorldSymbols];
  }
  for (const key of Object.keys(world)) {
    delete world[key];
  }
  worlds.splice(worlds.indexOf(world), 1);
};

/**
 * Returns all components registered to a world
 *
 * @param {World} world
 * @returns Array
 */
export const getWorldComponents = (world: World) => Array.from(world[$componentMap].keys());

/**
 * Returns all existing entities in a world
 *
 * @param {World} world
 * @returns Array
 */
export const getAllEntities = (world: World) => world[$entitySparseSet].dense.slice(0);
