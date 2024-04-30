import { Camera, OGLRenderingContext, Transform } from '@packages/ogl';
import { Vec3 } from '@packages/ogl/math/vec-3';
import { Listen } from '@solid-primitives/event-bus';
import { createSignal } from 'solid-js';
import { createRaycast } from '../raycast';
import { SphereComponent } from './sphere.component';

export function ScreenPointIntersection(props: {
  gl: OGLRenderingContext;
  scene: Transform;
  camera: Camera;
  click?: Listen<MouseEvent>;
}) {
  const { gl, scene, camera } = props;

  const pointOnScreen = new Vec3();

  const [intersectPoint, setIntersectPoint] = createSignal<Vec3>(new Vec3());

  const raycast = createRaycast({ camera, plane: [0, 1, 0] });

  props.click?.((e) => {
    const rect = gl.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * -2 + 1;

    pointOnScreen.set(x, y, 0.5);
    const intersectPoint = raycast.cast(pointOnScreen);
    if (intersectPoint) {
      setIntersectPoint(intersectPoint);
    }
  });

  return (
    <>
      <SphereComponent gl={gl} scene={scene} position={intersectPoint()} />
    </>
  );
}
