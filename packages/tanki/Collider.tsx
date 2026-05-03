import { toRadian } from '@app-game/ogl/extras/path/utils';
import { insert, spread } from '@packages/solid-pixi';
import { createEffect, JSX, onCleanup } from 'solid-js';
import { Collider as _Collider, RigidBody, useRapier2D } from './Rapier2D';
import { useWorld } from './World';

export const Collider = (() =>
  function (
    props: Partial<{ hx: number; hy: number; x: number; y: number; angle: number }> &
      Partial<{
        parent: JSX.Element | RigidBody | (JSX.Element & RigidBody);
      }> &
      Partial<{
        children: JSX.Element;
      }>
  ) {
    const physics = useRapier2D();
    const world = useWorld();

    const colliderDesc = physics.ColliderDesc.cuboid(props.hx ?? 1, props.hy ?? 1);
    const collider = world.createCollider(colliderDesc, props.parent as RigidBody);

    createEffect(() => {
      collider.setTranslation({ x: props.x ?? 0, y: props.y ?? 0 });
      collider.setRotation(toRadian(props.angle ?? 0));
    });

    onCleanup(() => {
      world.removeCollider(collider, true);
    });

    spread(collider, props);
    insert(collider, () => props.children);

    return collider as _Collider & JSX.Element;
  })();
