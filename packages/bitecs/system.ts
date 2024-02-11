import { World } from './world';

/**
 * Defines a new system function.
 *
 * @param {function} update
 * @returns {function}
 */
export const defineSystem =
  (update: (world: World, ...args: any[]) => void) =>
  (world: World, ...args: any[]): World => {
    update(world, ...args);
    return world;
  };
