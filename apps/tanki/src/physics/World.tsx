import { createContextProvider } from '@app-game/solid-utils';
import type { JSX } from '@solidjs/web';
import { onCleanup, untrack } from 'solid-js';
import { Rapier, useRapier2D } from './Rapier2D';

export type World = InstanceType<Rapier['World']>;

export const [WorldProvider, useWorld] = createContextProvider<World>();

/**
 * Creates a Rapier world for its subtree and frees it on disposal.
 *
 * Both props are read once at creation.
 *
 * @param props.gravity - Gravity vector in world units per second squared. Defaults to Earth gravity pointing down `{ x: 0, y: -9.81 }`.
 * @param props.lengthUnit - World units per meter, which scales Rapier's internal tolerances. Defaults to `1`.
 */
export function World(
  props: Partial<{ gravity: { x: number; y: number }; lengthUnit: number; children: JSX.Element }>
) {
  const world = createWorld(useRapier2D(), { gravity: untrack(() => props.gravity), lengthUnit: untrack(() => props.lengthUnit) });

  return <WorldProvider value={world}>{props.children}</WorldProvider>;
}

/**
 * Creates a Rapier world owned by the calling component or factory and frees it, with every body
 * and collider in it, when that owner is disposed.
 *
 * A scene that builds its bodies imperatively should own its world this way rather than share one
 * from `<World>`: when a hot update remounts only the scene, its old bodies go with the old world
 * instead of staying behind as obstacles nothing draws.
 *
 * @param options.gravity - Gravity vector in world units per second squared. Defaults to Earth gravity pointing down `{ x: 0, y: -9.81 }`.
 * @param options.lengthUnit - World units per meter, which scales Rapier's internal tolerances. Defaults to `1`.
 */
export function createWorld(physics: Rapier, options: { gravity?: { x: number; y: number }; lengthUnit?: number } = {}) {
  const world = new physics.World(options.gravity ?? { x: 0.0, y: -9.81 });
  world.lengthUnit = options.lengthUnit ?? 1;

  onCleanup(() => {
    world.free();
  });

  return world;
}
