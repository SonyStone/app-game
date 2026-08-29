import { createContextProvider } from '@app-game/solid-utils';
import type { JSX } from '@solidjs/web';
import { createMemo, latest, Show } from 'solid-js';

export type Rapier = typeof import('@dimforge/rapier2d-simd');

export type RigidBody = InstanceType<Rapier['RigidBody']>;
export type Collider = InstanceType<Rapier['Collider']>;

export const [Rapier2DProvider, useRapier2D] = createContextProvider<Rapier>();

export function Rapier2D(props: Partial<{ children: JSX.Element }>) {
  const rapier2d = createMemo(() => import('@dimforge/rapier2d-simd'));

  return (
    <Show when={latest(rapier2d)}>
      {(renderer) => <Rapier2DProvider value={renderer()}>{props.children}</Rapier2DProvider>}
    </Show>
  );
}
