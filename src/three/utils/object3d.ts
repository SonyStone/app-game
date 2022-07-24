import { Object3D } from 'three';

/**
 * Copy data from source to target
 *
 * @param target Object3D
 * @param source Object3D
 * @param recursive boolen
 */
export function copy(target: Object3D, source: Object3D, recursive = true) {
  target.name = source.name;

  target.up.copy(source.up);

  target.position.copy(source.position);
  target.rotation.order = source.rotation.order;
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);

  target.matrix.copy(source.matrix);
  target.matrixWorld.copy(source.matrixWorld);

  target.matrixAutoUpdate = source.matrixAutoUpdate;
  target.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;

  target.layers.mask = source.layers.mask;
  target.visible = source.visible;

  target.castShadow = source.castShadow;
  target.receiveShadow = source.receiveShadow;

  target.frustumCulled = source.frustumCulled;
  target.renderOrder = source.renderOrder;

  target.userData = JSON.parse(JSON.stringify(source.userData));

  if (recursive === true) {
    for (let i = 0; i < source.children.length; i++) {
      const child = source.children[i];
      target.add(child.clone());
    }
  }

  return target;
}
