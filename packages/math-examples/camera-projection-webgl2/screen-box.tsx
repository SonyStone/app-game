import { Camera, Color, Mesh, OGLRenderingContext, Polyline, Transform, Vec3 } from '@packages/ogl';
import { Listen } from '@solid-primitives/event-bus';
import { onCleanup } from 'solid-js';
import { createRaycast } from '../raycast';

export function ScreenBox(props: { gl: OGLRenderingContext; scene: Transform; camera: Camera; update?: Listen<void> }) {
  const { gl, scene, camera } = props;

  const screenPoints = [
    [-1, -1, 0.5],
    [-1, 1, 0.5],
    [1, 1, 0.5],
    [1, -1, 0.5],
    [-1, -1, 0.5]
  ];
  const points = [
    [-1, -1, 0],
    [-1, 1, 0],
    [1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0]
  ];
  const planeNormal = new Vec3(0, 1, 0).normalize();

  const polyline = new Polyline(gl, {
    points,
    uniforms: {
      uColor: { value: new Color('#ddd') },
      uThickness: { value: 3 }
    }
  });
  const mesh = new Mesh(gl, { geometry: polyline.geometry, program: polyline.program });
  mesh.position.set(0, 0, 0);
  scene.addChild(mesh);

  const raycast = createRaycast({ camera, plane: [0, 1, 0] });

  props.update?.(() => {
    for (let index = 0; index < screenPoints.length; index++) {
      const screenPoint = screenPoints[index];
      const point = points[index];

      const intersectPoint = raycast.cast(screenPoint);
      if (intersectPoint) {
        point[0] = intersectPoint.x;
        point[1] = intersectPoint.y;
        point[2] = intersectPoint.z;
      }
    }
    polyline.updateGeometry();
  });

  onCleanup(() => {
    scene.removeChild(mesh);
  });

  return <></>;
}
