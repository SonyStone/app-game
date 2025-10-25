import { toRadian } from '@packages/ogl/extras/path/utils';
import { insert, spread } from '@packages/solid-pixi';
import { createEffect, JSX, onCleanup } from 'solid-js';
import { RigidBody as _RigidBody, useRapier2D } from './Rapier2D';
import { useWorld } from './World';

export const RigidBody = (() =>
  function RigidBody(props: { x: number; y: number; angle: number } & Partial<{ children: JSX.Element }>) {
    const physics = useRapier2D();
    const world = useWorld();

    const rigidBodyDesc = physics.RigidBodyDesc.dynamic()
      .setTranslation(props.x, props.y)
      .setRotation(toRadian(props.angle));
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    createEffect(() => {
      rigidBody.setTranslation({ x: props.x, y: props.y }, true);
      rigidBody.setRotation(toRadian(props.angle), true);
    });

    onCleanup(() => {
      world.removeRigidBody(rigidBody);
    });

    spread(rigidBody, props);
    insert(rigidBody, () => props.children);

    return rigidBody as _RigidBody & JSX.Element;
  })();
