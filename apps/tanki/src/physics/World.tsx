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
  const physics = useRapier2D();

  onCleanup(() => {
    world.free();
  });

  const world = new physics.World(untrack(() => props.gravity) ?? { x: 0.0, y: -9.81 });
  world.lengthUnit = untrack(() => props.lengthUnit) ?? 1;

  return <WorldProvider value={world}>{props.children}</WorldProvider>;
}
