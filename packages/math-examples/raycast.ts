import { Camera, Vec3 } from '@packages/ogl';
import { Vec2Tuple } from '@packages/ogl/math/vec-2_old';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';

export function createRaycast({ camera, plane = [0, 1, 0] }: { camera: Camera; plane?: Vec3Tuple }) {
  const planeNormal = new Vec3().set(plane).normalize();
  const direction = new Vec3();

  return {
    cast(pointOnScreen: Vec2Tuple) {
      direction.set(pointOnScreen[0], pointOnScreen[1], 0.5);
      camera.unproject(direction);
      direction.sub(camera.position).normalize();
      const denom = planeNormal.dot(direction);
      if (Math.abs(denom) > 1e-6) {
        const t = -camera.position!.dot(planeNormal) / denom;
        const intersectPoint = camera.position!.clone().add(direction.clone().scale(t));

        return intersectPoint;
      }
      return undefined;
    }
  };
}
