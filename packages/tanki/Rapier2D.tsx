import createContextProvider from '@utils/createContextProvider';
import { createResource, JSX, Show } from 'solid-js';

export type Rapier = typeof import('@dimforge/rapier2d-simd');

export type RigidBody = InstanceType<Rapier['RigidBody']>;
export type Collider = InstanceType<Rapier['Collider']>;

export const [Rapier2DProvider, useRapier2D] = createContextProvider<Rapier>();

export function Rapier2D(props: Partial<{ children: JSX.Element }>) {
  const [rapier2d] = createResource(() => import('@dimforge/rapier2d-simd'));

  return (
    <Show when={rapier2d()}>
      {(renderer) => <Rapier2DProvider value={renderer()}>{props.children}</Rapier2DProvider>}
    </Show>
  );
}
