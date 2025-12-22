import { createContextProvider } from '@utils/createContextProvider';
import { JSX, onCleanup } from 'solid-js';
import { Rapier, useRapier2D } from './Rapier2D';

export type World = InstanceType<Rapier['World']>;

export const [WorldProvider, useWorld] = createContextProvider<World>();

export function World(props: Partial<{ children: JSX.Element }>) {
  const physics = useRapier2D();

  onCleanup(() => {
    world.free();
  });

  const gravity = { x: 0.0, y: -9.81 };
  const world = new physics.World(gravity);

  return <WorldProvider value={world}>{props.children}</WorldProvider>;
}
